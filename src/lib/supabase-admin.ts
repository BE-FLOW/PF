import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type {
  AiAccessStatus,
  AiReportFeedbackInput,
  AnalysisResult,
  EpisodePlan,
  EpisodeProgress,
  HealthCheckInput,
  HistoryRecord,
  PetEpisode,
  PetProfile,
  ReportMediaAttachment,
  ReportMediaKind,
  VetReviewDraft,
} from "./types";
import {
  isUuid,
  storedReportToHistoryRecord,
  toStoredHealthReport,
  type DisplayHealthReport,
} from "./report-storage";
import {
  isAllowedReportMediaMimeType,
  maxReportMediaFiles,
  maxReportMediaSizeBytes,
  reportMediaBucket,
  reportMediaExtensionFromMimeType,
} from "./report-media";
import {
  isAllowedPetPhotoMimeType,
  maxPetPhotoSizeBytes,
  petPhotoBucket,
  petPhotoExtensionFromMimeType,
} from "./pet-photo";
import {
  buildFreeAiAccessStatus,
  freeAiServerConfiguration,
} from "./ai-access";
import { analyzeLocally, deriveAgeGroup } from "./analysis";
import type { MonetizationEventInput } from "./monetization";
import { freeReleaseProductEventId } from "./product-event";

const requestTimeoutMs = 3500;
const supabasePageSize = 500;
const maxTimelineRows = 5000;

let adminClient: SupabaseClient | null | undefined;

export type DatabaseStatus = "connected" | "unconfigured" | "error";
export type FreeReleaseSchemaStatus = "ready" | "unconfigured" | "missing";

export interface HealthReportSaveResult {
  saved: boolean;
  episodeId: string | null;
  result: AnalysisResult | null;
}

export interface HealthReportEditResult {
  report: DisplayHealthReport;
  result: AnalysisResult;
}

export interface PetHealthHistoryResult {
  records: HistoryRecord[];
  reports: DisplayHealthReport[];
}

export interface ReportOwner {
  userId: string;
  petId: string;
  pet: PetProfile;
}

export interface EpisodeVetReviewBundle {
  episode: PetEpisode;
  sourceRevision: number;
  pet: PetProfile;
  reports: DisplayHealthReport[];
  plan?: EpisodePlan;
  progress: EpisodeProgress[];
}

export interface ReportMediaUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: ReportMediaKind;
}

export interface ReportMediaRegistrationInput extends ReportMediaUploadInput {
  storagePath: string;
}

export interface SignedStorageUpload {
  storagePath: string;
  token: string;
}

export interface PetPhotoUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AiReportAccess {
  userId: string;
  status: AiAccessStatus;
}

export interface AiReportUsageInput {
  userId: string;
  petId?: string | null;
  episodeId?: string | null;
  status: "succeeded" | "failed";
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  errorCode?: string | null;
}

export interface AiReportReservationInput {
  userId: string;
  petId: string;
  episodeId: string;
  model: string;
}

export interface AiReportCompletionInput {
  usageId: string;
  userId: string;
  status: "succeeded" | "failed";
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  errorCode?: string | null;
}

export interface FreeAiReportReservationInput {
  userId: string;
  petId: string;
  episodeId: string;
  model: string;
  requestId: string;
  requestFingerprint: string;
  sourceRevision: number;
  reportIds: string[];
}

export interface FreeAiReportReservation {
  usageId: string | null;
  reservationToken: string | null;
  state:
    | "reserved"
    | "succeeded"
    | "pending"
    | "conflict"
    | "limit"
    | "attempt_limit"
    | "stale_source"
    | "unavailable";
  draft: VetReviewDraft | null;
}

export interface FreeAiReportCompletionInput extends AiReportCompletionInput {
  reservationToken: string;
  draft?: VetReviewDraft | null;
}

export interface StoredFreeAiReportRequest {
  usageId: string;
  requestId: string;
  requestFingerprint: string;
  episodeId: string;
  sourceRevision: number;
  reportIds: string[];
  status: "pending" | "succeeded" | "failed";
  draft: VetReviewDraft | null;
}

export interface BillingPurchaseInput {
  userId: string;
  transactionId: string;
  originalTransactionId?: string | null;
  productId: string;
  store: "app_store" | "play_store";
  environment: "sandbox" | "production";
  purchasedAt: string;
  credits?: number;
  priceUsd?: number | null;
  priceAmount?: number | null;
  currency?: string | null;
  countryCode?: string | null;
  quantity?: number | null;
  taxPercentage?: number | null;
  commissionPercentage?: number | null;
}

export interface BillingEventInput {
  eventId: string;
  eventType: string;
  userId?: string | null;
  transactionId?: string | null;
  status: "processed" | "ignored" | "failed";
  errorCode?: string | null;
}

interface AuthenticatedUser {
  id: string;
  email: string;
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function getAdminClient() {
  if (adminClient !== undefined) return adminClient;
  const config = getConfig();
  adminClient = config
    ? createClient(config.url, config.serviceRoleKey, {
        auth: { persistSession: false },
      })
    : null;
  return adminClient;
}

async function supabaseRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const config = getConfig();
  if (!config) return null;

  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function fetchAllSupabaseRows<T>(
  path: string,
  maxRows = maxTimelineRows,
): Promise<T[] | null> {
  const rows: T[] = [];

  for (let offset = 0; offset < maxRows; offset += supabasePageSize) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await supabaseRequest(
      `${path}${separator}limit=${supabasePageSize}&offset=${offset}`,
      { method: "GET" },
    );
    if (!response?.ok) return null;

    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < supabasePageSize) return rows;
  }

  return null;
}

function appVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    "dev"
  );
}

function deploymentEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function toPetEpisode(row: {
  id: string;
  pet_id: string;
  status: PetEpisode["status"];
  started_at: string;
  last_activity_at: string;
  closed_at: string | null;
}): PetEpisode {
  return {
    id: row.id,
    petId: row.pet_id,
    status: row.status,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    closedAt: row.closed_at,
  };
}

function toEpisodePlan(row: {
  id: string;
  episode_id: string;
  pet_id: string;
  source_type: EpisodePlan["sourceType"];
  review_status: EpisodePlan["reviewStatus"];
  reported_at: string;
  plan_tasks?: Array<{
    id: string;
    task_text: string;
    position: number;
    completed_at: string | null;
  }>;
}): EpisodePlan {
  return {
    id: row.id,
    episodeId: row.episode_id,
    petId: row.pet_id,
    sourceType: row.source_type,
    reviewStatus: row.review_status,
    reportedAt: row.reported_at,
    tasks: [...(row.plan_tasks ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((task) => ({
        id: task.id,
        text: task.task_text,
        position: task.position,
        completedAt: task.completed_at,
      })),
  };
}

function toEpisodeProgress(row: {
  id: string;
  episode_id: string;
  pet_id: string;
  follow_up_day: EpisodeProgress["followUpDay"];
  condition_change: EpisodeProgress["conditionChange"];
  appetite: EpisodeProgress["appetite"];
  energy: EpisodeProgress["energy"];
  source_type: EpisodeProgress["sourceType"];
  review_status: EpisodeProgress["reviewStatus"];
  recorded_at: string;
}): EpisodeProgress {
  return {
    id: row.id,
    episodeId: row.episode_id,
    petId: row.pet_id,
    followUpDay: row.follow_up_day,
    conditionChange: row.condition_change,
    appetite: row.appetite,
    energy: row.energy,
    sourceType: row.source_type,
    reviewStatus: row.review_status,
    recordedAt: row.recorded_at,
  };
}

function toPetProfile(row: {
  id: string;
  name: string;
  species: PetProfile["species"];
  breed: string | null;
  birth_date: string | null;
  sex: PetProfile["sex"];
  weight: string | null;
}): PetProfile {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    breed: row.breed ?? "",
    birthDate: row.birth_date ?? "",
    sex: row.sex,
    weight: row.weight ?? "",
  };
}

function canonicalHealthInput(
  input: HealthCheckInput,
  pet: PetProfile,
  observedAt?: string | null,
): HealthCheckInput {
  const observedDate = observedAt ? new Date(observedAt) : new Date();
  return {
    ...input,
    petName: pet.name,
    species: pet.species,
    breed: pet.breed || undefined,
    birthDate: pet.birthDate || undefined,
    sex: pet.sex,
    weight: pet.weight || undefined,
    ageGroup: deriveAgeGroup(
      pet.birthDate,
      Number.isNaN(observedDate.getTime()) ? new Date() : observedDate,
    ),
  };
}

interface ReportMediaRow {
  id: string;
  report_id: string;
  pet_id: string;
  episode_id: string;
  kind: ReportMediaKind;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

const reportMediaSelect =
  "id,report_id,pet_id,episode_id,kind,file_name,mime_type,size_bytes,storage_path,created_at";

function toReportMediaAttachment(
  row: ReportMediaRow,
  signedUrl?: string,
): ReportMediaAttachment {
  return {
    id: row.id,
    reportId: row.report_id,
    petId: row.pet_id,
    episodeId: row.episode_id,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    signedUrl,
  };
}

async function signReportMediaRows(
  rows: ReportMediaRow[],
): Promise<ReportMediaAttachment[]> {
  const client = getAdminClient();
  if (!client || !rows.length) return rows.map((row) => toReportMediaAttachment(row));

  const signed = await Promise.all(
    rows.map(async (row) => {
      const { data } = await client.storage
        .from(reportMediaBucket)
        .createSignedUrl(row.storage_path, 60 * 60);
      return toReportMediaAttachment(row, data?.signedUrl);
    }),
  );
  return signed;
}

function groupMediaByReport(media: ReportMediaAttachment[]) {
  const grouped = new Map<string, ReportMediaAttachment[]>();
  for (const item of media) {
    const items = grouped.get(item.reportId) ?? [];
    items.push(item);
    grouped.set(item.reportId, items);
  }
  return grouped;
}

function isValidMediaUploadInput(
  input: ReportMediaUploadInput,
): input is ReportMediaUploadInput {
  return Boolean(
    input &&
      ["image", "video"].includes(input.kind) &&
      isAllowedReportMediaMimeType(input.mimeType) &&
      Number.isInteger(input.sizeBytes) &&
      input.sizeBytes > 0 &&
      input.sizeBytes <= maxReportMediaSizeBytes &&
      typeof input.fileName === "string" &&
      input.fileName.trim().length > 0 &&
      input.fileName.trim().length <= 160,
  );
}

function isValidMediaRegistrationInput(
  input: ReportMediaRegistrationInput,
): input is ReportMediaRegistrationInput {
  return Boolean(
    isValidMediaUploadInput(input) &&
      typeof input.storagePath === "string" &&
      input.storagePath.length <= 500,
  );
}

async function getAuthenticatedUser(
  accessToken: string | null,
): Promise<AuthenticatedUser | null> {
  const config = getConfig();
  if (!config || !accessToken) return null;
  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string; email?: string };
    return isUuid(user.id)
      ? { id: user.id, email: user.email?.trim() ?? "" }
      : null;
  } catch {
    return null;
  }
}

async function getAuthenticatedUserId(
  accessToken: string | null,
): Promise<string | null> {
  return (await getAuthenticatedUser(accessToken))?.id ?? null;
}

async function removeStorageFiles(
  bucket: string,
  paths: Array<string | null | undefined>,
): Promise<boolean> {
  const uniquePaths = Array.from(
    new Set(paths.map((path) => path?.trim()).filter(Boolean) as string[]),
  );
  const client = getAdminClient();
  if (!client) return false;
  if (!uniquePaths.length) return true;

  try {
    const { error } = await client.storage.from(bucket).remove(uniquePaths);
    return !error;
  } catch {
    return false;
  }
}

async function listStorageFiles(
  bucket: string,
  rootPath: string,
): Promise<string[] | null> {
  const client = getAdminClient();
  if (!client || !rootPath.trim()) return null;
  const storage = client.storage.from(bucket);
  const paths: string[] = [];
  const pageSize = 100;
  const maxFiles = 5_000;

  async function walk(folder: string): Promise<boolean> {
    let offset = 0;
    while (paths.length <= maxFiles) {
      const { data, error } = await storage.list(folder, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) return false;

      for (const item of data) {
        const itemPath = `${folder}/${item.name}`;
        if (item.id) {
          paths.push(itemPath);
          if (paths.length > maxFiles) return false;
        } else if (!(await walk(itemPath))) {
          return false;
        }
      }

      if (data.length < pageSize) return true;
      offset += pageSize;
    }
    return false;
  }

  return (await walk(rootPath)) ? paths : null;
}

export async function deleteAccount(
  accessToken: string | null,
): Promise<{ deletedAt: string } | null> {
  const user = await getAuthenticatedUser(accessToken);
  const client = getAdminClient();
  if (!user || !client) return null;

  try {
    const [mediaResponse, petResponse, mediaFiles, petPhotoFiles] = await Promise.all([
      supabaseRequest(
        `health_report_media?user_id=eq.${user.id}&select=storage_path`,
        { method: "GET" },
      ),
      supabaseRequest(`pets?user_id=eq.${user.id}&select=photo_path`, {
        method: "GET",
      }),
      listStorageFiles(reportMediaBucket, user.id),
      listStorageFiles(petPhotoBucket, user.id),
    ]);
    if (
      !mediaResponse?.ok ||
      !petResponse?.ok ||
      !mediaFiles ||
      !petPhotoFiles
    ) {
      return null;
    }

    const mediaRows = (await mediaResponse.json()) as Array<{
      storage_path: string | null;
    }>;
    const petRows = (await petResponse.json()) as Array<{
      photo_path: string | null;
    }>;

    const storageRemoved = await Promise.all([
      removeStorageFiles(
        reportMediaBucket,
        [...mediaRows.map((row) => row.storage_path), ...mediaFiles],
      ),
      removeStorageFiles(
        petPhotoBucket,
        [...petRows.map((row) => row.photo_path), ...petPhotoFiles],
      ),
    ]);
    if (storageRemoved.some((removed) => !removed)) return null;

    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) return null;
    return { deletedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

function emptyAiAccessStatus(reason: AiAccessStatus["reason"]): AiAccessStatus {
  const { dailyLimit } = freeAiServerConfiguration();
  return {
    enabled: false,
    reason,
    availableCredits: 0,
    complimentaryCredits: 0,
    purchasedCredits: 0,
    usedTotal: 0,
    billingConfigured: false,
    purchaseAvailable: false,
    productId: "",
    freeRelease: true,
    dailyLimit,
    attemptsToday: 0,
    dailyAttemptLimit: dailyLimit * 3,
    resetsAt: null,
  };
}

async function buildFreeAiStatus(userId: string): Promise<AiAccessStatus> {
  const { dailyLimit, generationConfigured } = freeAiServerConfiguration();
  if (!generationConfigured) return emptyAiAccessStatus("unavailable");
  try {
    const response = await supabaseRequest("rpc/get_free_ai_access_status", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: userId,
        target_daily_limit: dailyLimit,
      }),
    });
    if (!response?.ok) return emptyAiAccessStatus("unavailable");
    const rows = (await response.json()) as Array<{
      used_today: number;
      daily_limit: number;
      attempts_today: number;
      daily_attempt_limit: number;
      resets_at: string;
    }>;
    const row = rows[0];
    if (!row) return emptyAiAccessStatus("unavailable");
    return buildFreeAiAccessStatus(
      Number(row.used_today),
      Number(row.daily_limit),
      typeof row.resets_at === "string" ? row.resets_at : null,
      Number(row.attempts_today) || 0,
      Number(row.daily_attempt_limit) || dailyLimit * 3,
    );
  } catch {
    return emptyAiAccessStatus("unavailable");
  }
}

export async function getAiAccessStatus(
  accessToken: string | null,
): Promise<AiAccessStatus | null> {
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;
  return buildFreeAiStatus(userId);
}

export async function getAiAccessStatusForUser(userId: string) {
  if (!isUuid(userId)) return null;
  return buildFreeAiStatus(userId);
}

export async function getAiReportAccess(
  accessToken: string | null,
): Promise<AiReportAccess | null> {
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;
  return { userId, status: await buildFreeAiStatus(userId) };
}

export async function getEpisodeSourceRevisionForUser(
  userId: string,
  episodeId: string,
): Promise<number | null> {
  if (!isUuid(userId) || !isUuid(episodeId)) return null;
  try {
    const response = await supabaseRequest(
      `episodes?id=eq.${episodeId}&user_id=eq.${userId}&select=source_revision&limit=1`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{ source_revision: number }>;
    const revision = Number(rows[0]?.source_revision);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
  } catch {
    return null;
  }
}

function estimatedOpenAiCostUsd(
  promptTokens?: number | null,
  completionTokens?: number | null,
) {
  const inputRate = Number(process.env.OPENAI_INPUT_COST_USD_PER_1M_TOKENS);
  const outputRate = Number(process.env.OPENAI_OUTPUT_COST_USD_PER_1M_TOKENS);
  if (
    !Number.isFinite(inputRate) ||
    !Number.isFinite(outputRate) ||
    inputRate < 0 ||
    outputRate < 0
  ) {
    return null;
  }
  return (
    ((promptTokens ?? 0) * inputRate + (completionTokens ?? 0) * outputRate) /
    1_000_000
  );
}

export async function recordAiReportUsage(
  input: AiReportUsageInput,
): Promise<string | null> {
  if (!isUuid(input.userId)) return null;
  try {
    const payload = {
      user_id: input.userId,
      pet_id: isUuid(input.petId) ? input.petId : null,
      episode_id: isUuid(input.episodeId) ? input.episodeId : null,
      status: input.status,
      model: input.model ?? null,
      prompt_tokens: input.promptTokens ?? null,
      completion_tokens: input.completionTokens ?? null,
      total_tokens: input.totalTokens ?? null,
      estimated_cost_usd:
        input.status === "succeeded"
          ? estimatedOpenAiCostUsd(input.promptTokens, input.completionTokens)
          : null,
      error_code: input.errorCode ?? null,
    };
    const response = await supabaseRequest("ai_report_usage", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function reserveAiReportUsage(
  input: AiReportReservationInput,
): Promise<{ usageId: string | null; unavailable: boolean }> {
  if (
    !isUuid(input.userId) ||
    !isUuid(input.petId) ||
    !isUuid(input.episodeId)
  ) {
    return { usageId: null, unavailable: true };
  }

  try {
    const response = await supabaseRequest("rpc/reserve_ai_report_usage", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: input.userId,
        target_pet_id: input.petId,
        target_episode_id: input.episodeId,
        target_model: input.model,
      }),
    });
    if (!response?.ok) return { usageId: null, unavailable: true };
    const usageId = (await response.json()) as unknown;
    return {
      usageId: typeof usageId === "string" && isUuid(usageId) ? usageId : null,
      unavailable: false,
    };
  } catch {
    return { usageId: null, unavailable: true };
  }
}

export async function completeAiReportUsage(
  input: AiReportCompletionInput,
): Promise<boolean> {
  if (!isUuid(input.usageId) || !isUuid(input.userId)) return false;

  try {
    const response = await supabaseRequest("rpc/complete_ai_report_usage", {
      method: "POST",
      body: JSON.stringify({
        target_usage_id: input.usageId,
        target_user_id: input.userId,
        target_status: input.status,
        target_model: input.model,
        target_prompt_tokens: input.promptTokens ?? null,
        target_completion_tokens: input.completionTokens ?? null,
        target_total_tokens: input.totalTokens ?? null,
        target_estimated_cost_usd:
          input.status === "succeeded"
            ? estimatedOpenAiCostUsd(
                input.promptTokens,
                input.completionTokens,
              )
            : null,
        target_error_code: input.errorCode ?? null,
      }),
    });
    if (!response?.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}

export async function getStoredFreeAiReportRequest(input: {
  userId: string;
  episodeId: string;
  requestId?: string;
  requestFingerprint?: string;
  sourceRevision?: number;
  selectedReportIds?: string[];
  succeededOnly?: boolean;
}): Promise<StoredFreeAiReportRequest | null> {
  if (
    !isUuid(input.userId) ||
    !isUuid(input.episodeId) ||
    (input.requestId !== undefined && !isUuid(input.requestId)) ||
    (input.requestFingerprint !== undefined &&
      !/^[0-9a-f]{64}$/.test(input.requestFingerprint)) ||
    (input.sourceRevision !== undefined &&
      (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0)) ||
    (input.selectedReportIds !== undefined &&
      (input.selectedReportIds.length > 60 ||
        !input.selectedReportIds.every(isUuid)))
  ) {
    return null;
  }

  const filters = [
    `user_id=eq.${input.userId}`,
    `episode_id=eq.${input.episodeId}`,
    "access_mode=eq.free_daily",
    "select=id,request_id,request_fingerprint,episode_id,source_revision,selected_report_ids,status,result",
  ];
  if (input.requestId) filters.push(`request_id=eq.${input.requestId}`);
  if (input.requestFingerprint) {
    filters.push(`request_fingerprint=eq.${input.requestFingerprint}`);
  }
  if (input.sourceRevision !== undefined) {
    filters.push(`source_revision=eq.${input.sourceRevision}`);
  }
  if (input.selectedReportIds) {
    const arrayLiteral = `{${input.selectedReportIds.join(",")}}`;
    filters.push(`selected_report_ids=eq.${encodeURIComponent(arrayLiteral)}`);
  }
  if (input.succeededOnly) {
    filters.push("status=eq.succeeded", "result=not.is.null");
  }
  filters.push("order=generated_at.desc", "limit=1");

  try {
    const response = await supabaseRequest(`ai_report_usage?${filters.join("&")}`, {
      method: "GET",
    });
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{
      id: string;
      request_id: string;
      request_fingerprint: string;
      episode_id: string;
      source_revision: number;
      selected_report_ids: unknown;
      status: "pending" | "succeeded" | "failed";
      result: unknown;
    }>;
    const row = rows[0];
    if (
      !row ||
      !isUuid(row.id) ||
      !isUuid(row.request_id) ||
      !/^[0-9a-f]{64}$/.test(row.request_fingerprint) ||
      !isUuid(row.episode_id) ||
      !Number.isSafeInteger(Number(row.source_revision)) ||
      Number(row.source_revision) < 0 ||
      !["pending", "succeeded", "failed"].includes(row.status)
    ) {
      return null;
    }
    const reportIds = Array.isArray(row.selected_report_ids)
      ? row.selected_report_ids.filter(
          (value): value is string => typeof value === "string" && isUuid(value),
        )
      : [];
    const draft =
      row.result && typeof row.result === "object"
        ? (row.result as VetReviewDraft)
        : null;
    return {
      usageId: row.id,
      requestId: row.request_id,
      requestFingerprint: row.request_fingerprint,
      episodeId: row.episode_id,
      sourceRevision: Number(row.source_revision),
      reportIds,
      status: row.status,
      draft,
    };
  } catch {
    return null;
  }
}

export async function reserveFreeAiReportUsage(
  input: FreeAiReportReservationInput,
): Promise<FreeAiReportReservation> {
  if (
    !isUuid(input.userId) ||
    !isUuid(input.petId) ||
    !isUuid(input.episodeId) ||
    !isUuid(input.requestId) ||
    !/^[0-9a-f]{64}$/.test(input.requestFingerprint) ||
    !Number.isSafeInteger(input.sourceRevision) ||
    input.sourceRevision < 0 ||
    input.reportIds.length > 60 ||
    !input.reportIds.every(isUuid)
  ) {
    return {
      usageId: null,
      reservationToken: null,
      state: "unavailable",
      draft: null,
    };
  }

  const { dailyLimit } = freeAiServerConfiguration();
  try {
    const response = await supabaseRequest("rpc/reserve_free_ai_report_usage", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: input.userId,
        target_pet_id: input.petId,
        target_episode_id: input.episodeId,
        target_model: input.model,
        target_request_id: input.requestId,
        target_request_fingerprint: input.requestFingerprint,
        target_source_revision: input.sourceRevision,
        target_selected_report_ids: input.reportIds,
        target_daily_limit: dailyLimit,
      }),
    });
    if (!response?.ok) {
      return {
        usageId: null,
        reservationToken: null,
        state: "unavailable",
        draft: null,
      };
    }
    const rows = (await response.json()) as Array<{
      usage_id: string | null;
      reservation_state: FreeAiReportReservation["state"];
      stored_result: unknown;
      reservation_token: string | null;
    }>;
    const row = rows[0];
    const allowedStates: FreeAiReportReservation["state"][] = [
      "reserved",
      "succeeded",
      "pending",
      "conflict",
      "limit",
      "attempt_limit",
      "stale_source",
    ];
    if (!row || !allowedStates.includes(row.reservation_state)) {
      return {
        usageId: null,
        reservationToken: null,
        state: "unavailable",
        draft: null,
      };
    }
    return {
      usageId:
        typeof row.usage_id === "string" && isUuid(row.usage_id)
          ? row.usage_id
          : null,
      reservationToken:
        typeof row.reservation_token === "string" &&
        isUuid(row.reservation_token)
          ? row.reservation_token
          : null,
      state: row.reservation_state,
      draft:
        row.stored_result && typeof row.stored_result === "object"
          ? (row.stored_result as VetReviewDraft)
          : null,
    };
  } catch {
    return {
      usageId: null,
      reservationToken: null,
      state: "unavailable",
      draft: null,
    };
  }
}

export async function completeFreeAiReportUsage(
  input: FreeAiReportCompletionInput,
): Promise<boolean> {
  if (
    !isUuid(input.usageId) ||
    !isUuid(input.userId) ||
    !isUuid(input.reservationToken)
  ) {
    return false;
  }
  if (input.status === "succeeded" && !input.draft) return false;

  try {
    const response = await supabaseRequest("rpc/complete_free_ai_report_usage", {
      method: "POST",
      body: JSON.stringify({
        target_usage_id: input.usageId,
        target_user_id: input.userId,
        target_reservation_token: input.reservationToken,
        target_status: input.status,
        target_model: input.model,
        target_prompt_tokens: input.promptTokens ?? null,
        target_completion_tokens: input.completionTokens ?? null,
        target_total_tokens: input.totalTokens ?? null,
        target_estimated_cost_usd:
          input.status === "succeeded"
            ? estimatedOpenAiCostUsd(input.promptTokens, input.completionTokens)
            : null,
        target_error_code: input.errorCode ?? null,
        target_result: input.status === "succeeded" ? input.draft : null,
      }),
    });
    if (!response?.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}

export async function recordAiCreditPurchase(input: BillingPurchaseInput) {
  if (
    !isUuid(input.userId) ||
    !input.transactionId.trim() ||
    !input.productId.trim() ||
    !Number.isFinite(Date.parse(input.purchasedAt))
  ) {
    return null;
  }

  try {
    const response = await supabaseRequest("rpc/record_ai_credit_purchase", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: input.userId,
        target_transaction_id: input.transactionId.trim(),
        target_original_transaction_id:
          input.originalTransactionId?.trim() || null,
        target_product_id: input.productId.trim(),
        target_store: input.store,
        target_environment: input.environment,
        target_purchased_at: input.purchasedAt,
        target_credits: input.credits ?? 1,
        target_price_usd: input.priceUsd ?? null,
        target_price_amount: input.priceAmount ?? null,
        target_currency: input.currency?.trim().toUpperCase() || null,
        target_country_code: input.countryCode?.trim().toUpperCase() || null,
        target_quantity: input.quantity ?? 1,
        target_tax_percentage: input.taxPercentage ?? null,
        target_commission_percentage: input.commissionPercentage ?? null,
      }),
    });
    if (!response?.ok) return null;
    const purchaseId = (await response.json()) as unknown;
    return typeof purchaseId === "string" && isUuid(purchaseId)
      ? purchaseId
      : null;
  } catch {
    return null;
  }
}

export async function refundAiCreditPurchase(
  transactionId: string,
  eventId: string,
  refundedAt?: string | null,
) {
  if (!transactionId.trim() || !eventId.trim()) return false;
  try {
    const response = await supabaseRequest("rpc/refund_ai_credit_purchase", {
      method: "POST",
      body: JSON.stringify({
        target_transaction_id: transactionId.trim(),
        target_event_id: eventId.trim(),
        target_refunded_at:
          refundedAt && Number.isFinite(Date.parse(refundedAt))
            ? refundedAt
            : new Date().toISOString(),
      }),
    });
    if (!response?.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}

export async function reverseAiCreditRefund(
  transactionId: string,
  eventId: string,
  reversedAt?: string | null,
) {
  if (!transactionId.trim() || !eventId.trim()) return false;
  try {
    const response = await supabaseRequest("rpc/reverse_ai_credit_refund", {
      method: "POST",
      body: JSON.stringify({
        target_transaction_id: transactionId.trim(),
        target_event_id: eventId.trim(),
        target_reversed_at:
          reversedAt && Number.isFinite(Date.parse(reversedAt))
            ? reversedAt
            : new Date().toISOString(),
      }),
    });
    if (!response?.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}

export async function recordMonetizationEvent(
  accessToken: string | null,
  input: MonetizationEventInput,
) {
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return "unauthorized" as const;

  try {
    const response = await supabaseRequest(
      "monetization_events?on_conflict=event_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({
          event_id: input.eventId,
          user_id: userId,
          event_name: input.eventName,
          context: input.context,
          platform: input.platform,
          product_id: freeReleaseProductEventId,
          app_version: input.appVersion ?? null,
          app_build: input.appBuild ?? null,
        }),
      },
    );
    return response?.ok ? ("saved" as const) : ("failed" as const);
  } catch {
    return "failed" as const;
  }
}

export async function recordBillingEvent(input: BillingEventInput) {
  if (!input.eventId.trim() || !input.eventType.trim()) return false;
  try {
    const response = await supabaseRequest(
      "billing_events?on_conflict=event_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          event_id: input.eventId.trim(),
          event_type: input.eventType.trim(),
          user_id: input.userId && isUuid(input.userId) ? input.userId : null,
          transaction_id: input.transactionId?.trim() || null,
          status: input.status,
          error_code: input.errorCode?.trim() || null,
        }),
      },
    );
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

export async function saveAiReportFeedback(
  accessToken: string | null,
  input: AiReportFeedbackInput,
): Promise<boolean> {
  const userId = await getAuthenticatedUserId(accessToken);
  if (
    !userId ||
    !isUuid(input.usageId) ||
    ![1, 2, 3, 4, 5].includes(input.usefulnessScore) ||
    (input.comment !== undefined && input.comment.length > 500)
  ) {
    return false;
  }
  try {
    const usageResponse = await supabaseRequest(
      `ai_report_usage?id=eq.${input.usageId}&user_id=eq.${userId}&select=id,episode_id&limit=1`,
      { method: "GET" },
    );
    if (!usageResponse?.ok) return false;
    const usageRows = (await usageResponse.json()) as Array<{
      id: string;
      episode_id: string | null;
    }>;
    const usage = usageRows[0];
    if (!usage) return false;

    const response = await supabaseRequest(
      "ai_report_feedback?on_conflict=usage_id%2Cuser_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          usage_id: input.usageId,
          user_id: userId,
          episode_id: usage.episode_id,
          usefulness_score: input.usefulnessScore,
          comment: input.comment?.trim() || null,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return response?.ok ?? false;
  } catch {
    return false;
  }
}

async function ensureOpenEpisode(
  userId: string,
  petId: string,
  activityAt: string,
): Promise<string | null> {
  try {
    const response = await supabaseRequest("rpc/ensure_open_episode", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: userId,
        target_pet_id: petId,
        activity_at: activityAt,
      }),
    });
    if (!response?.ok) return null;
    const episodeId = (await response.json()) as string;
    return isUuid(episodeId) ? episodeId : null;
  } catch {
    return null;
  }
}

async function savedHealthReportForRequest(
  account: ReportOwner,
  requestId: string,
): Promise<HealthReportSaveResult | null> {
  const response = await supabaseRequest(
    `health_reports?user_id=eq.${account.userId}&client_id=eq.${requestId}&select=id,pet_id,episode_id,species,breed,owner_note,age_group,symptoms,symptom_details,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at&limit=1`,
    { method: "GET" },
  );
  if (!response?.ok) return null;

  const rows = (await response.json()) as DisplayHealthReport[];
  const stored = rows[0];
  if (
    !stored ||
    stored.pet_id !== account.petId ||
    !isUuid(stored.id) ||
    !isUuid(stored.episode_id)
  ) {
    return null;
  }

  return {
    saved: true,
    episodeId: stored.episode_id,
    result: storedReportToHistoryRecord(stored, account.pet).result,
  };
}

export async function saveHealthReport(
  input: HealthCheckInput,
  requestId: string | null,
  account: ReportOwner,
  observedAt: string | null,
): Promise<HealthReportSaveResult> {
  if (
    !isUuid(requestId) ||
    !isUuid(account.userId) ||
    !isUuid(account.petId)
  ) {
    return { saved: false, episodeId: null, result: null };
  }

  try {
    const existing = await savedHealthReportForRequest(account, requestId);
    if (existing) return existing;

    const canonicalInput = canonicalHealthInput(input, account.pet, observedAt);
    const analyzed = analyzeLocally(canonicalInput);
    const result = observedAt ? { ...analyzed, createdAt: observedAt } : analyzed;
    const episodeId = await ensureOpenEpisode(
      account.userId,
      account.petId,
      result.createdAt,
    );
    if (!episodeId) return { saved: false, episodeId: null, result: null };
    const payload = toStoredHealthReport(canonicalInput, result, requestId, {
      appVersion: appVersion(),
      environment: deploymentEnvironment(),
      userId: account.userId,
      petId: account.petId,
      episodeId,
    });
    const response = await supabaseRequest(
      "health_reports?on_conflict=user_id%2Cclient_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(payload),
      },
    );
    if (!response?.ok) {
      return { saved: false, episodeId: null, result: null };
    }
    return (
      (await savedHealthReportForRequest(account, requestId)) ?? {
        saved: false,
        episodeId: null,
        result: null,
      }
    );
  } catch {
    return { saved: false, episodeId: null, result: null };
  }
}

export async function updateHealthReport(
  accessToken: string | null,
  reportId: string | null,
  input: HealthCheckInput,
): Promise<HealthReportEditResult | null> {
  if (!isUuid(reportId)) return null;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;

  try {
    const reportResponse = await supabaseRequest(
      `health_reports?id=eq.${reportId}&user_id=eq.${userId}&select=id,pet_id,episode_id,created_at&limit=1`,
      { method: "GET" },
    );
    if (!reportResponse?.ok) return null;
    const existing = (await reportResponse.json()) as Array<{
      id: string;
      pet_id: string | null;
      episode_id: string | null;
      created_at: string;
    }>;
    const report = existing[0];
    if (!report || !isUuid(report.pet_id)) return null;

    const petResponse = await supabaseRequest(
      `pets?id=eq.${report.pet_id}&user_id=eq.${userId}&select=id,name,species,breed,birth_date,sex,weight&limit=1`,
      { method: "GET" },
    );
    if (!petResponse?.ok) return null;
    const petRows = (await petResponse.json()) as Parameters<typeof toPetProfile>[0][];
    if (!petRows[0]) return null;
    const canonicalInput = canonicalHealthInput(
      input,
      toPetProfile(petRows[0]),
      report.created_at,
    );
    const result = analyzeLocally(canonicalInput);

    const response = await supabaseRequest(
      `health_reports?id=eq.${report.id}&user_id=eq.${userId}&select=id,pet_id,episode_id,species,breed,owner_note,age_group,symptoms,symptom_details,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          species: canonicalInput.species,
          breed: canonicalInput.breed?.trim().slice(0, 80) || null,
          owner_note: canonicalInput.note.trim().slice(0, 1000) || null,
          age_group: canonicalInput.ageGroup,
          symptoms: canonicalInput.symptoms,
          symptom_details: canonicalInput.symptomDetails ?? {},
          appetite: canonicalInput.appetite,
          energy: canonicalInput.energy,
          duration: canonicalInput.duration,
          red_flags: canonicalInput.redFlags,
          risk_level: result.riskLevel,
          risk_score: result.riskScore,
          analysis_source: result.source,
          app_version: appVersion(),
          deployment_environment: deploymentEnvironment(),
        }),
      },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as DisplayHealthReport[];
    const updated = rows[0];
    if (!updated) return null;

    const mediaResponse = await supabaseRequest(
      `health_report_media?user_id=eq.${userId}&report_id=eq.${report.id}&select=${reportMediaSelect}&order=created_at.asc`,
      { method: "GET" },
    );
    const mediaRows = mediaResponse?.ok
      ? ((await mediaResponse.json()) as ReportMediaRow[])
      : [];

    return {
      report: {
        ...updated,
        media: await signReportMediaRows(mediaRows),
      },
      result,
    };
  } catch {
    return null;
  }
}

export async function deleteHealthReport(
  accessToken: string | null,
  reportId: string | null,
): Promise<boolean> {
  if (!isUuid(reportId)) return false;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return false;

  try {
    const reportResponse = await supabaseRequest(
      `health_reports?id=eq.${reportId}&user_id=eq.${userId}&select=id,pet_id&limit=1`,
      { method: "GET" },
    );
    if (!reportResponse?.ok) return false;
    const reports = (await reportResponse.json()) as Array<{
      id: string;
      pet_id: string;
    }>;
    const report = reports[0];
    if (report?.id !== reportId || !isUuid(report.pet_id)) return false;

    const mediaResponse = await supabaseRequest(
      `health_report_media?user_id=eq.${userId}&report_id=eq.${reportId}&select=storage_path`,
      { method: "GET" },
    );
    if (!mediaResponse?.ok) return false;
    const mediaRows = (await mediaResponse.json()) as Array<{
      storage_path: string;
    }>;
    const reportFiles = await listStorageFiles(
      reportMediaBucket,
      `${userId}/${report.pet_id}/${reportId}`,
    );
    if (!reportFiles) return false;

    const storageRemoved = await removeStorageFiles(
      reportMediaBucket,
      [...mediaRows.map((row) => row.storage_path), ...reportFiles],
    );
    if (!storageRemoved) return false;

    const response = await supabaseRequest(
      `health_reports?id=eq.${reportId}&user_id=eq.${userId}&select=id`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
    );
    if (!response?.ok) return false;
    const deleted = (await response.json()) as Array<{ id: string }>;
    return deleted[0]?.id === reportId;
  } catch {
    return false;
  }
}

export async function deletePet(
  accessToken: string | null,
  petId: string | null,
): Promise<boolean> {
  if (!isUuid(petId)) return false;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return false;

  try {
    const [petResponse, mediaResponse, reportFiles, petPhotoFiles] = await Promise.all([
      supabaseRequest(
        `pets?id=eq.${petId}&user_id=eq.${userId}&select=id,photo_path&limit=1`,
        { method: "GET" },
      ),
      supabaseRequest(
        `health_report_media?pet_id=eq.${petId}&user_id=eq.${userId}&select=storage_path`,
        { method: "GET" },
      ),
      listStorageFiles(reportMediaBucket, `${userId}/${petId}`),
      listStorageFiles(petPhotoBucket, `${userId}/${petId}`),
    ]);
    if (
      !petResponse?.ok ||
      !mediaResponse?.ok ||
      !reportFiles ||
      !petPhotoFiles
    ) {
      return false;
    }

    const pets = (await petResponse.json()) as Array<{
      id: string;
      photo_path: string | null;
    }>;
    const pet = pets[0];
    if (pet?.id !== petId) return false;
    const mediaRows = (await mediaResponse.json()) as Array<{
      storage_path: string | null;
    }>;

    const storageRemoved = await Promise.all([
      removeStorageFiles(
        reportMediaBucket,
        [...mediaRows.map((row) => row.storage_path), ...reportFiles],
      ),
      removeStorageFiles(petPhotoBucket, [pet.photo_path, ...petPhotoFiles]),
    ]);
    if (storageRemoved.some((removed) => !removed)) return false;

    const response = await supabaseRequest(
      `pets?id=eq.${petId}&user_id=eq.${userId}&select=id`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
    );
    if (!response?.ok) return false;
    const deleted = (await response.json()) as Array<{ id: string }>;
    return deleted[0]?.id === petId;
  } catch {
    return false;
  }
}

export async function getReportOwner(
  accessToken: string | null,
  petId: string | null,
): Promise<ReportOwner | null> {
  const config = getConfig();
  if (!config || !accessToken || !isUuid(petId)) return null;
  try {
    const userId = await getAuthenticatedUserId(accessToken);
    if (!userId) return null;
    const petResponse = await supabaseRequest(
      `pets?id=eq.${petId}&user_id=eq.${userId}&select=id,name,species,breed,birth_date,sex,weight&limit=1`,
      { method: "GET" },
    );
    if (!petResponse?.ok) return null;
    const pets = (await petResponse.json()) as Parameters<typeof toPetProfile>[0][];
    return pets[0]?.id === petId
      ? { userId, petId, pet: toPetProfile(pets[0]) }
      : null;
  } catch {
    return null;
  }
}

interface OwnedMediaReport {
  id: string;
  clientId: string;
  userId: string;
  petId: string;
  episodeId: string;
}

async function getOwnedMediaReport(
  userId: string,
  reportId: string,
): Promise<OwnedMediaReport | null> {
  const response = await supabaseRequest(
    `health_reports?id=eq.${reportId}&user_id=eq.${userId}&select=id,client_id,user_id,pet_id,episode_id&limit=1`,
    { method: "GET" },
  );
  if (!response?.ok) return null;
  const rows = (await response.json()) as Array<{
    id: string;
    client_id: string;
    user_id: string;
    pet_id: string | null;
    episode_id: string | null;
  }>;
  const report = rows[0];
  if (
    !report ||
    !isUuid(report.client_id) ||
    !isUuid(report.pet_id) ||
    !isUuid(report.episode_id)
  ) {
    return null;
  }
  return {
    id: report.id,
    clientId: report.client_id,
    userId,
    petId: report.pet_id,
    episodeId: report.episode_id,
  };
}

export async function prepareHealthReportMediaUploads(
  accessToken: string | null,
  reportId: string | null,
  files: ReportMediaUploadInput[],
): Promise<SignedStorageUpload[] | null> {
  if (
    !isUuid(reportId) ||
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > maxReportMediaFiles ||
    files.some((file) => !isValidMediaUploadInput(file))
  ) {
    return null;
  }
  const userId = await getAuthenticatedUserId(accessToken);
  const client = getAdminClient();
  if (!userId || !client) return null;

  try {
    const report = await getOwnedMediaReport(userId, reportId);
    if (!report) return null;
    const existingResponse = await supabaseRequest(
      `health_report_media?report_id=eq.${report.id}&user_id=eq.${userId}&select=id`,
      { method: "GET" },
    );
    if (!existingResponse?.ok) return null;
    const existing = (await existingResponse.json()) as Array<{ id: string }>;
    if (existing.length + files.length > maxReportMediaFiles) return null;

    const uploads: SignedStorageUpload[] = [];
    for (const file of files) {
      const extension = reportMediaExtensionFromMimeType(file.mimeType);
      const storagePath = `${userId}/${report.petId}/${report.id}/${randomUUID()}.${extension}`;
      const { data, error } = await client.storage
        .from(reportMediaBucket)
        .createSignedUploadUrl(storagePath, { upsert: false });
      if (error || !data?.token) return null;
      uploads.push({ storagePath, token: data.token });
    }
    return uploads;
  } catch {
    return null;
  }
}

export async function preparePetPhotoUpload(
  accessToken: string | null,
  petId: string | null,
  input: PetPhotoUploadInput,
): Promise<SignedStorageUpload | null> {
  if (
    !isUuid(petId) ||
    !input ||
    typeof input.fileName !== "string" ||
    input.fileName.trim().length < 1 ||
    input.fileName.trim().length > 160 ||
    !isAllowedPetPhotoMimeType(input.mimeType) ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > maxPetPhotoSizeBytes
  ) {
    return null;
  }
  const owner = await getReportOwner(accessToken, petId);
  const client = getAdminClient();
  if (!owner || !client) return null;

  const extension = petPhotoExtensionFromMimeType(input.mimeType);
  const storagePath = `${owner.userId}/${owner.petId}/${randomUUID()}.${extension}`;
  try {
    const { data, error } = await client.storage
      .from(petPhotoBucket)
      .createSignedUploadUrl(storagePath, { upsert: false });
    return error || !data?.token
      ? null
      : { storagePath, token: data.token };
  } catch {
    return null;
  }
}

export async function registerHealthReportMedia(
  accessToken: string | null,
  reportId: string | null,
  files: ReportMediaRegistrationInput[],
): Promise<ReportMediaAttachment[] | null> {
  if (
    !isUuid(reportId) ||
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > maxReportMediaFiles
  ) {
    return null;
  }
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId || files.some((file) => !isValidMediaRegistrationInput(file))) {
    return null;
  }

  try {
    const report = await getOwnedMediaReport(userId, reportId);
    if (!report) return null;

    const existingResponse = await supabaseRequest(
      `health_report_media?report_id=eq.${report.id}&user_id=eq.${userId}&select=id`,
      { method: "GET" },
    );
    if (!existingResponse?.ok) return null;
    const existing = (await existingResponse.json()) as Array<{ id: string }>;
    if (existing.length + files.length > maxReportMediaFiles) return null;

    const pathPrefix = `${userId}/${report.petId}/${report.id}/`;
    const rows = files.map((file) => {
      const kindMatchesMime =
        file.kind === "image"
          ? file.mimeType.startsWith("image/")
          : file.mimeType.startsWith("video/");
      if (
        !kindMatchesMime ||
        !file.storagePath.startsWith(pathPrefix) ||
        file.storagePath.includes("..") ||
        file.storagePath.includes("//")
      ) {
        throw new Error("invalid media path");
      }
      return {
        report_id: report.id,
        client_id: report.clientId,
        user_id: userId,
        pet_id: report.petId,
        episode_id: report.episodeId,
        kind: file.kind,
        file_name: file.fileName.trim().slice(0, 160),
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        storage_path: file.storagePath,
      };
    });

    const response = await supabaseRequest(
      "health_report_media?on_conflict=storage_path",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(rows),
      },
    );
    if (!response?.ok) return null;
    const inserted = (await response.json()) as ReportMediaRow[];
    return signReportMediaRows(inserted);
  } catch {
    return null;
  }
}

export async function deleteHealthReportMedia(
  accessToken: string | null,
  reportId: string | null,
  mediaId: string | null,
): Promise<boolean> {
  if (!isUuid(reportId) || !isUuid(mediaId)) return false;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return false;

  try {
    const report = await getOwnedMediaReport(userId, reportId);
    if (!report) return false;

    const mediaResponse = await supabaseRequest(
      `health_report_media?id=eq.${mediaId}&report_id=eq.${report.id}&user_id=eq.${userId}&select=id,storage_path&limit=1`,
      { method: "GET" },
    );
    if (!mediaResponse?.ok) return false;
    const mediaRows = (await mediaResponse.json()) as Array<{
      id: string;
      storage_path: string;
    }>;
    const media = mediaRows[0];
    if (media?.id !== mediaId) return false;

    const storageRemoved = await removeStorageFiles(reportMediaBucket, [
      media.storage_path,
    ]);
    if (!storageRemoved) return false;

    const response = await supabaseRequest(
      `health_report_media?id=eq.${mediaId}&report_id=eq.${report.id}&user_id=eq.${userId}&select=id`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
    );
    if (!response?.ok) return false;
    const deleted = (await response.json()) as Array<{ id: string }>;
    return deleted[0]?.id === mediaId;
  } catch {
    return false;
  }
}

export async function getPetHealthHistory(
  accessToken: string | null,
  petId: string | null,
): Promise<PetHealthHistoryResult | null> {
  const owner = await getReportOwner(accessToken, petId);
  if (!owner) return null;
  try {
    const reports = await fetchAllSupabaseRows<DisplayHealthReport>(
      `health_reports?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,pet_id,episode_id,species,breed,owner_note,age_group,symptoms,symptom_details,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at&order=created_at.desc`,
    );
    if (!reports) return null;
    const mediaRows = await fetchAllSupabaseRows<ReportMediaRow>(
      `health_report_media?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=${reportMediaSelect}&order=created_at.asc`,
    );
    if (!mediaRows) return null;
    const mediaByReport = groupMediaByReport(await signReportMediaRows(mediaRows));
    const reportsWithMedia = reports.map((report) => ({
      ...report,
      media: mediaByReport.get(report.id) ?? [],
    }));
    return {
      records: reportsWithMedia.map((report) =>
        storedReportToHistoryRecord(report, owner.pet),
      ),
      reports: reportsWithMedia,
    };
  } catch {
    return null;
  }
}

export async function listPetEpisodes(
  accessToken: string | null,
  petId: string | null,
): Promise<PetEpisode[] | null> {
  const owner = await getReportOwner(accessToken, petId);
  if (!owner) return null;
  try {
    const rows = await fetchAllSupabaseRows<{
      id: string;
      pet_id: string;
      status: PetEpisode["status"];
      started_at: string;
      last_activity_at: string;
      closed_at: string | null;
    }>(
      `episodes?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,pet_id,status,started_at,last_activity_at,closed_at&order=last_activity_at.desc`,
    );
    if (!rows) return null;
    return rows.map(toPetEpisode);
  } catch {
    return null;
  }
}

export async function listPetEpisodePlans(
  accessToken: string | null,
  petId: string | null,
): Promise<EpisodePlan[] | null> {
  const owner = await getReportOwner(accessToken, petId);
  if (!owner) return null;
  try {
    const rows = await fetchAllSupabaseRows<
      Parameters<typeof toEpisodePlan>[0]
    >(
      `episode_plans?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,episode_id,pet_id,source_type,review_status,reported_at,plan_tasks(id,task_text,position,completed_at)&order=reported_at.desc`,
    );
    if (!rows) return null;
    return rows.map(toEpisodePlan);
  } catch {
    return null;
  }
}

export async function listPetEpisodeProgress(
  accessToken: string | null,
  petId: string | null,
): Promise<EpisodeProgress[] | null> {
  const owner = await getReportOwner(accessToken, petId);
  if (!owner) return null;
  try {
    const rows = await fetchAllSupabaseRows<
      Parameters<typeof toEpisodeProgress>[0]
    >(
      `episode_progress_logs?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,episode_id,pet_id,follow_up_day,condition_change,appetite,energy,source_type,review_status,recorded_at&order=follow_up_day.asc`,
    );
    if (!rows) return null;
    return rows.map(toEpisodeProgress);
  } catch {
    return null;
  }
}

export async function getEpisodeVetReviewBundle(
  accessToken: string | null,
  episodeId: string | null,
): Promise<EpisodeVetReviewBundle | null> {
  if (!isUuid(episodeId)) return null;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;

  try {
    const episodeResponse = await supabaseRequest(
      `episodes?id=eq.${episodeId}&user_id=eq.${userId}&select=id,pet_id,status,started_at,last_activity_at,closed_at,source_revision&limit=1`,
      { method: "GET" },
    );
    if (!episodeResponse?.ok) return null;
    const episodeRows = (await episodeResponse.json()) as Array<{
      id: string;
      pet_id: string;
      status: PetEpisode["status"];
      started_at: string;
      last_activity_at: string;
      closed_at: string | null;
      source_revision: number;
    }>;
    const episodeRow = episodeRows[0];
    if (
      !episodeRow ||
      !Number.isSafeInteger(Number(episodeRow.source_revision)) ||
      Number(episodeRow.source_revision) < 0
    ) return null;
    const episode = toPetEpisode(episodeRow);

    const [
      petResponse,
      reports,
      mediaRows,
      plansResponse,
      progressResponse,
    ] =
      await Promise.all([
        supabaseRequest(
          `pets?id=eq.${episode.petId}&user_id=eq.${userId}&select=id,name,species,breed,birth_date,sex,weight&limit=1`,
          { method: "GET" },
        ),
        fetchAllSupabaseRows<DisplayHealthReport>(
          `health_reports?user_id=eq.${userId}&pet_id=eq.${episode.petId}&episode_id=eq.${episode.id}&select=id,pet_id,episode_id,species,breed,owner_note,age_group,symptoms,symptom_details,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at&order=created_at.asc`,
        ),
        fetchAllSupabaseRows<ReportMediaRow>(
          `health_report_media?user_id=eq.${userId}&pet_id=eq.${episode.petId}&episode_id=eq.${episode.id}&select=${reportMediaSelect}&order=created_at.asc`,
        ),
        supabaseRequest(
          `episode_plans?user_id=eq.${userId}&episode_id=eq.${episode.id}&select=id,episode_id,pet_id,source_type,review_status,reported_at,plan_tasks(id,task_text,position,completed_at)&order=reported_at.desc&limit=1`,
          { method: "GET" },
        ),
        supabaseRequest(
          `episode_progress_logs?user_id=eq.${userId}&episode_id=eq.${episode.id}&select=id,episode_id,pet_id,follow_up_day,condition_change,appetite,energy,source_type,review_status,recorded_at&order=follow_up_day.asc`,
          { method: "GET" },
        ),
      ]);

    if (
      !petResponse?.ok ||
      !reports ||
      !mediaRows ||
      !plansResponse?.ok ||
      !progressResponse?.ok
    ) {
      return null;
    }

    const petRows = (await petResponse.json()) as Parameters<
      typeof toPetProfile
    >[0][];
    const mediaByReport = groupMediaByReport(await signReportMediaRows(mediaRows));
    const planRows = (await plansResponse.json()) as Parameters<
      typeof toEpisodePlan
    >[0][];
    const progressRows = (await progressResponse.json()) as Parameters<
      typeof toEpisodeProgress
    >[0][];
    const pet = petRows[0] ? toPetProfile(petRows[0]) : null;
    if (!pet) return null;

    return {
      episode,
      sourceRevision: Number(episodeRow.source_revision),
      pet,
      reports: reports.map((report) => ({
        ...report,
        media: mediaByReport.get(report.id) ?? [],
      })),
      plan: planRows[0] ? toEpisodePlan(planRows[0]) : undefined,
      progress: progressRows.map(toEpisodeProgress),
    };
  } catch {
    return null;
  }
}

export async function saveEpisodePlan(
  accessToken: string | null,
  episodeId: string | null,
  tasks: string[],
): Promise<{ plan: EpisodePlan; episode: PetEpisode } | null> {
  if (!isUuid(episodeId)) return null;
  const userId = await getAuthenticatedUserId(accessToken);
  const cleanedTasks = tasks.map((task) => task.trim()).filter(Boolean);
  if (
    !userId ||
    cleanedTasks.length < 1 ||
    cleanedTasks.length > 5 ||
    cleanedTasks.some((task) => task.length > 160)
  ) return null;

  try {
    const savedResponse = await supabaseRequest(
      "rpc/save_user_reported_episode_plan",
      {
        method: "POST",
        body: JSON.stringify({
          target_user_id: userId,
          target_episode_id: episodeId,
          task_items: cleanedTasks,
        }),
      },
    );
    if (!savedResponse?.ok) return null;
    const planId = (await savedResponse.json()) as string;
    if (!isUuid(planId)) return null;

    const [planResponse, episodeResponse] = await Promise.all([
      supabaseRequest(
        `episode_plans?id=eq.${planId}&user_id=eq.${userId}&select=id,episode_id,pet_id,source_type,review_status,reported_at,plan_tasks(id,task_text,position,completed_at)&limit=1`,
        { method: "GET" },
      ),
      supabaseRequest(
        `episodes?id=eq.${episodeId}&user_id=eq.${userId}&select=id,pet_id,status,started_at,last_activity_at,closed_at&limit=1`,
        { method: "GET" },
      ),
    ]);
    if (!planResponse?.ok || !episodeResponse?.ok) return null;
    const planRows = (await planResponse.json()) as Parameters<
      typeof toEpisodePlan
    >[0][];
    const episodeRows = (await episodeResponse.json()) as Parameters<
      typeof toPetEpisode
    >[0][];
    if (!planRows[0] || !episodeRows[0]) return null;
    return {
      plan: toEpisodePlan(planRows[0]),
      episode: toPetEpisode(episodeRows[0]),
    };
  } catch {
    return null;
  }
}

export async function saveReportFeedback(
  accessToken: string | null,
  reportId: string,
  feedback: "helpful" | "not-helpful",
): Promise<boolean> {
  if (!isUuid(reportId)) return false;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return false;

  try {
    const reportResponse = await supabaseRequest(
      `health_reports?id=eq.${reportId}&user_id=eq.${userId}&select=id,client_id&limit=1`,
      { method: "GET" },
    );
    if (!reportResponse?.ok) return false;
    const reports = (await reportResponse.json()) as Array<{
      id: string;
      client_id: string;
    }>;
    const report = reports[0];
    if (!report || !isUuid(report.client_id)) return false;

    const response = await supabaseRequest(
      "health_report_feedback?on_conflict=report_id%2Cclient_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          report_id: reportId,
          client_id: report.client_id,
          user_id: userId,
          feedback,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return response?.ok ?? false;
  } catch {
    return false;
  }
}

export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  if (!getConfig()) return "unconfigured";
  try {
    const response = await supabaseRequest("health_reports?select=id&limit=1", {
      method: "GET",
      headers: { Range: "0-0" },
    });
    return response?.ok ? "connected" : "error";
  } catch {
    return "error";
  }
}

export async function checkFreeReleaseSchema(): Promise<FreeReleaseSchemaStatus> {
  if (!getConfig()) return "unconfigured";
  try {
    const [columnResponse, versionResponse] = await Promise.all([
      supabaseRequest("episodes?select=id,source_revision&limit=1", {
        method: "GET",
        headers: { Range: "0-0" },
      }),
      supabaseRequest("rpc/get_free_release_schema_version", {
        method: "POST",
        body: "{}",
      }),
    ]);
    if (!columnResponse?.ok || !versionResponse?.ok) return "missing";
    const version = (await versionResponse.json()) as unknown;
    return version === "202608180004" ? "ready" : "missing";
  } catch {
    return "missing";
  }
}

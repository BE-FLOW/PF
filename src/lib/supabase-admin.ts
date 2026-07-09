import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AiAccessStatus,
  AiReportFeedbackInput,
  AnalysisResult,
  EpisodePlan,
  EpisodeProgress,
  HealthCheckInput,
  PetEpisode,
  PetProfile,
  ReportMediaAttachment,
  ReportMediaKind,
} from "./types";
import {
  isUuid,
  toStoredHealthReport,
  type DisplayHealthReport,
} from "./report-storage";
import {
  isAllowedReportMediaMimeType,
  maxReportMediaFiles,
  maxReportMediaSizeBytes,
  reportMediaBucket,
} from "./report-media";
import { petPhotoBucket } from "./pet-photo";

const requestTimeoutMs = 3500;

let adminClient: SupabaseClient | null | undefined;

export type DatabaseStatus = "connected" | "unconfigured" | "error";

export interface HealthReportSaveResult {
  saved: boolean;
  episodeId: string | null;
}

export interface HealthReportEditResult {
  report: DisplayHealthReport;
}

export interface EpisodeVetReviewBundle {
  episode: PetEpisode;
  pet: PetProfile;
  reports: DisplayHealthReport[];
  plan?: EpisodePlan;
  progress: EpisodeProgress[];
}

export interface ReportMediaRegistrationInput {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: ReportMediaKind;
}

export interface AiReportAccess {
  userId: string;
  status: AiAccessStatus;
}

export interface AiReportUsageInput {
  userId: string;
  grantId?: string;
  petId?: string | null;
  episodeId?: string | null;
  status: "succeeded" | "failed";
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
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

function isValidMediaInput(
  input: ReportMediaRegistrationInput,
): input is ReportMediaRegistrationInput {
  return Boolean(
      input &&
      ["image", "video"].includes(input.kind) &&
      isAllowedReportMediaMimeType(input.mimeType) &&
      Number.isInteger(input.sizeBytes) &&
      input.sizeBytes > 0 &&
      input.sizeBytes <= maxReportMediaSizeBytes &&
      typeof input.fileName === "string" &&
      input.fileName.trim().length > 0 &&
      input.fileName.trim().length <= 160 &&
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

export async function requestAccountDeletion(
  accessToken: string | null,
): Promise<{ requestedAt: string } | null> {
  const user = await getAuthenticatedUser(accessToken);
  if (!user) return null;

  try {
    const requestedAt = new Date().toISOString();
    const response = await supabaseRequest(
      "account_deletion_requests?on_conflict=user_id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email || "unknown",
          status: "requested",
          requested_at: requestedAt,
          updated_at: requestedAt,
        }),
      },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{ requested_at: string }>;
    return { requestedAt: rows[0]?.requested_at ?? requestedAt };
  } catch {
    return null;
  }
}

async function removeStorageFiles(
  bucket: string,
  paths: Array<string | null | undefined>,
) {
  const uniquePaths = Array.from(
    new Set(paths.map((path) => path?.trim()).filter(Boolean) as string[]),
  );
  const client = getAdminClient();
  if (!client || !uniquePaths.length) return;

  try {
    await client.storage.from(bucket).remove(uniquePaths);
  } catch {
    /* Account deletion must still remove the auth user; orphan cleanup can be retried from storage logs. */
  }
}

export async function deleteAccount(
  accessToken: string | null,
): Promise<{ deletedAt: string } | null> {
  const user = await getAuthenticatedUser(accessToken);
  const client = getAdminClient();
  if (!user || !client) return null;

  try {
    const [mediaResponse, petResponse] = await Promise.all([
      supabaseRequest(
        `health_report_media?user_id=eq.${user.id}&select=storage_path`,
        { method: "GET" },
      ),
      supabaseRequest(`pets?user_id=eq.${user.id}&select=photo_path`, {
        method: "GET",
      }),
    ]);
    const mediaRows = mediaResponse?.ok
      ? ((await mediaResponse.json()) as Array<{ storage_path: string | null }>)
      : [];
    const petRows = petResponse?.ok
      ? ((await petResponse.json()) as Array<{ photo_path: string | null }>)
      : [];

    await Promise.all([
      removeStorageFiles(
        reportMediaBucket,
        mediaRows.map((row) => row.storage_path),
      ),
      removeStorageFiles(
        petPhotoBucket,
        petRows.map((row) => row.photo_path),
      ),
    ]);

    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) return null;
    return { deletedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function emptyAiAccessStatus(reason: AiAccessStatus["reason"]): AiAccessStatus {
  return {
    enabled: false,
    reason,
    monthlyReportLimit: 0,
    totalReportLimit: null,
    usedThisMonth: 0,
    usedTotal: 0,
    remainingThisMonth: 0,
  };
}

async function countSucceededAiReports(
  userId: string,
  sinceIso?: string,
): Promise<number | null> {
  try {
    const sinceFilter = sinceIso
      ? `&generated_at=gte.${encodeURIComponent(sinceIso)}`
      : "";
    const response = await supabaseRequest(
      `ai_report_usage?user_id=eq.${userId}&status=eq.succeeded${sinceFilter}&select=id`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{ id: string }>;
    return rows.length;
  } catch {
    return null;
  }
}

async function buildAiAccessStatus(userId: string): Promise<AiAccessStatus> {
  try {
    const grantResponse = await supabaseRequest(
      `ai_access_grants?user_id=eq.${userId}&select=id,code_id,status,monthly_report_limit,total_report_limit,granted_at&limit=1`,
      { method: "GET" },
    );
    if (!grantResponse?.ok) return emptyAiAccessStatus("no_code");
    const grants = (await grantResponse.json()) as Array<{
      id: string;
      code_id: string;
      status: "active" | "revoked";
      monthly_report_limit: number;
      total_report_limit: number | null;
      granted_at: string;
    }>;
    const grant = grants[0];
    if (!grant) return emptyAiAccessStatus("no_code");

    const [codeResponse, usedThisMonth, usedTotal] = await Promise.all([
      supabaseRequest(
        `ai_access_codes?id=eq.${grant.code_id}&select=label,disabled_at,expires_at&limit=1`,
        { method: "GET" },
      ),
      countSucceededAiReports(userId, monthStartIso()),
      countSucceededAiReports(userId),
    ]);
    if (!codeResponse?.ok || usedThisMonth === null || usedTotal === null) {
      return emptyAiAccessStatus("no_code");
    }
    const codes = (await codeResponse.json()) as Array<{
      label: string;
      disabled_at: string | null;
      expires_at: string | null;
    }>;
    const code = codes[0];
    if (!code) return emptyAiAccessStatus("no_code");

    const disabledOrExpired =
      Boolean(code.disabled_at) ||
      Boolean(code.expires_at && new Date(code.expires_at) <= new Date());
    const remainingThisMonth = Math.max(
      grant.monthly_report_limit - usedThisMonth,
      0,
    );
    const totalLimitHit =
      grant.total_report_limit !== null && usedTotal >= grant.total_report_limit;
    const reason: AiAccessStatus["reason"] =
      grant.status === "revoked" || disabledOrExpired
        ? "revoked"
        : totalLimitHit
          ? "total_limit"
          : remainingThisMonth <= 0
            ? "monthly_limit"
            : "active";

    return {
      enabled: reason === "active",
      reason,
      grantId: grant.id,
      codeLabel: code.label,
      monthlyReportLimit: grant.monthly_report_limit,
      totalReportLimit: grant.total_report_limit,
      usedThisMonth,
      usedTotal,
      remainingThisMonth,
      grantedAt: grant.granted_at,
    };
  } catch {
    return emptyAiAccessStatus("no_code");
  }
}

export async function getAiAccessStatus(
  accessToken: string | null,
): Promise<AiAccessStatus | null> {
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;
  return buildAiAccessStatus(userId);
}

export async function getAiReportAccess(
  accessToken: string | null,
): Promise<AiReportAccess | null> {
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;
  return { userId, status: await buildAiAccessStatus(userId) };
}

export async function redeemAiAccessCode(
  accessToken: string | null,
  code: string,
): Promise<AiAccessStatus | null> {
  const userId = await getAuthenticatedUserId(accessToken);
  const cleanedCode = code.trim();
  if (!userId || cleanedCode.length < 6 || cleanedCode.length > 40) return null;
  try {
    const response = await supabaseRequest("rpc/redeem_ai_access_code", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: userId,
        raw_code: cleanedCode,
      }),
    });
    if (!response?.ok) return null;
    return buildAiAccessStatus(userId);
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
      grant_id: isUuid(input.grantId) ? input.grantId : null,
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

export async function saveAiReportFeedback(
  accessToken: string | null,
  input: AiReportFeedbackInput,
): Promise<boolean> {
  const userId = await getAuthenticatedUserId(accessToken);
  if (
    !userId ||
    !isUuid(input.usageId) ||
    ![1, 2, 3, 4, 5].includes(input.usefulnessScore) ||
    !["no", "maybe", "yes"].includes(input.wouldPay) ||
    (input.willingnessToPayKrw !== undefined &&
      input.willingnessToPayKrw !== null &&
      (!Number.isInteger(input.willingnessToPayKrw) ||
        input.willingnessToPayKrw < 0 ||
        input.willingnessToPayKrw > 1_000_000)) ||
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
          episode_id: usage.episode_id ?? input.episodeId ?? null,
          usefulness_score: input.usefulnessScore,
          would_pay: input.wouldPay,
          willingness_to_pay_krw: input.willingnessToPayKrw ?? null,
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

export async function saveHealthReport(
  input: HealthCheckInput,
  result: AnalysisResult,
  clientId: string | null,
  isTest = false,
  account: { userId?: string | null; petId?: string | null } = {},
): Promise<HealthReportSaveResult> {
  if (!isUuid(clientId)) return { saved: false, episodeId: null };

  try {
    const episodeId =
      isUuid(account.userId) && isUuid(account.petId)
        ? await ensureOpenEpisode(
            account.userId,
            account.petId,
            result.createdAt,
          )
        : null;
    if (isUuid(account.userId) && isUuid(account.petId) && !episodeId) {
      return { saved: false, episodeId: null };
    }
    const payload = toStoredHealthReport(input, result, clientId, {
      appVersion: appVersion(),
      environment: deploymentEnvironment(),
      isTest,
      userId: account.userId,
      petId: account.petId,
      episodeId,
    });
    const response = await supabaseRequest(
      "health_reports?on_conflict=id%2Cclient_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(payload),
      },
    );
    const saved = response?.ok ?? false;
    return { saved, episodeId: saved ? episodeId : null };
  } catch {
    return { saved: false, episodeId: null };
  }
}

export async function updateHealthReport(
  accessToken: string | null,
  reportId: string | null,
  input: HealthCheckInput,
  result: AnalysisResult,
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
    if (!report) return null;

    const response = await supabaseRequest(
      `health_reports?id=eq.${report.id}&user_id=eq.${userId}&select=id,pet_id,episode_id,species,breed,age_group,symptoms,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          species: input.species,
          breed: input.breed?.trim().slice(0, 80) || null,
          age_group: input.ageGroup,
          symptoms: input.symptoms,
          appetite: input.appetite,
          energy: input.energy,
          duration: input.duration,
          red_flags: input.redFlags,
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
    const mediaResponse = await supabaseRequest(
      `health_report_media?user_id=eq.${userId}&report_id=eq.${reportId}&select=storage_path`,
      { method: "GET" },
    );
    const mediaRows = mediaResponse?.ok
      ? ((await mediaResponse.json()) as Array<{ storage_path: string }>)
      : [];

    const response = await supabaseRequest(
      `health_reports?id=eq.${reportId}&user_id=eq.${userId}`,
      { method: "DELETE" },
    );
    if (!response?.ok) return false;

    const paths = mediaRows.map((row) => row.storage_path).filter(Boolean);
    const client = getAdminClient();
    if (client && paths.length) {
      try {
        await client.storage.from(reportMediaBucket).remove(paths);
      } catch {
        /* Storage cleanup is best-effort after the report row is deleted. */
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function getReportOwner(
  accessToken: string | null,
  petId: string | null,
): Promise<{ userId: string; petId: string } | null> {
  const config = getConfig();
  if (!config || !accessToken || !isUuid(petId)) return null;
  try {
    const userId = await getAuthenticatedUserId(accessToken);
    if (!userId) return null;
    const petResponse = await supabaseRequest(
      `pets?id=eq.${petId}&user_id=eq.${userId}&select=id&limit=1`,
      { method: "GET" },
    );
    if (!petResponse?.ok) return null;
    const pets = (await petResponse.json()) as Array<{ id: string }>;
    return pets[0]?.id === petId ? { userId, petId } : null;
  } catch {
    return null;
  }
}

export async function registerHealthReportMedia(
  accessToken: string | null,
  reportId: string | null,
  clientId: string | null,
  files: ReportMediaRegistrationInput[],
): Promise<ReportMediaAttachment[] | null> {
  if (
    !isUuid(reportId) ||
    !isUuid(clientId) ||
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > maxReportMediaFiles
  ) {
    return null;
  }
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId || files.some((file) => !isValidMediaInput(file))) return null;

  try {
    const reportResponse = await supabaseRequest(
      `health_reports?id=eq.${reportId}&client_id=eq.${clientId}&user_id=eq.${userId}&select=id,client_id,user_id,pet_id,episode_id&limit=1`,
      { method: "GET" },
    );
    if (!reportResponse?.ok) return null;
    const reportRows = (await reportResponse.json()) as Array<{
      id: string;
      client_id: string;
      user_id: string;
      pet_id: string | null;
      episode_id: string | null;
    }>;
    const report = reportRows[0];
    if (!report?.pet_id || !report.episode_id) return null;

    const existingResponse = await supabaseRequest(
      `health_report_media?report_id=eq.${report.id}&client_id=eq.${report.client_id}&select=id`,
      { method: "GET" },
    );
    if (!existingResponse?.ok) return null;
    const existing = (await existingResponse.json()) as Array<{ id: string }>;
    if (existing.length + files.length > maxReportMediaFiles) return null;

    const pathPrefix = `${userId}/${report.pet_id}/${report.id}/`;
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
        client_id: report.client_id,
        user_id: userId,
        pet_id: report.pet_id,
        episode_id: report.episode_id,
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

export async function listPetHealthReports(
  accessToken: string | null,
  petId: string | null,
): Promise<DisplayHealthReport[] | null> {
  const owner = await getReportOwner(accessToken, petId);
  if (!owner) return null;
  try {
    const response = await supabaseRequest(
      `health_reports?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,pet_id,episode_id,species,breed,age_group,symptoms,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at&order=created_at.desc&limit=60`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const reports = (await response.json()) as DisplayHealthReport[];
    const mediaResponse = await supabaseRequest(
      `health_report_media?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=${reportMediaSelect}&order=created_at.asc`,
      { method: "GET" },
    );
    if (!mediaResponse?.ok) return reports.map((report) => ({ ...report, media: [] }));
    const mediaRows = (await mediaResponse.json()) as ReportMediaRow[];
    const mediaByReport = groupMediaByReport(await signReportMediaRows(mediaRows));
    return reports.map((report) => ({
      ...report,
      media: mediaByReport.get(report.id) ?? [],
    }));
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
    const response = await supabaseRequest(
      `episodes?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,pet_id,status,started_at,last_activity_at,closed_at&order=last_activity_at.desc&limit=60`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{
      id: string;
      pet_id: string;
      status: PetEpisode["status"];
      started_at: string;
      last_activity_at: string;
      closed_at: string | null;
    }>;
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
    const response = await supabaseRequest(
      `episode_plans?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,episode_id,pet_id,source_type,review_status,reported_at,plan_tasks(id,task_text,position,completed_at)&order=reported_at.desc`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Parameters<typeof toEpisodePlan>[0][];
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
    const response = await supabaseRequest(
      `episode_progress_logs?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,episode_id,pet_id,follow_up_day,condition_change,appetite,energy,source_type,review_status,recorded_at&order=follow_up_day.asc`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Parameters<typeof toEpisodeProgress>[0][];
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
      `episodes?id=eq.${episodeId}&user_id=eq.${userId}&select=id,pet_id,status,started_at,last_activity_at,closed_at&limit=1`,
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
    }>;
    const episodeRow = episodeRows[0];
    if (!episodeRow) return null;
    const episode = toPetEpisode(episodeRow);

    const [
      petResponse,
      reportsResponse,
      mediaResponse,
      plansResponse,
      progressResponse,
    ] =
      await Promise.all([
        supabaseRequest(
          `pets?id=eq.${episode.petId}&user_id=eq.${userId}&select=id,name,species,breed,birth_date,sex,weight&limit=1`,
          { method: "GET" },
        ),
        supabaseRequest(
          `health_reports?user_id=eq.${userId}&pet_id=eq.${episode.petId}&episode_id=eq.${episode.id}&select=id,pet_id,episode_id,species,breed,age_group,symptoms,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at&order=created_at.asc&limit=60`,
          { method: "GET" },
        ),
        supabaseRequest(
          `health_report_media?user_id=eq.${userId}&pet_id=eq.${episode.petId}&episode_id=eq.${episode.id}&select=${reportMediaSelect}&order=created_at.asc`,
          { method: "GET" },
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
      !reportsResponse?.ok ||
      !plansResponse?.ok ||
      !progressResponse?.ok
    ) {
      return null;
    }

    const petRows = (await petResponse.json()) as Parameters<
      typeof toPetProfile
    >[0][];
    const reports = (await reportsResponse.json()) as DisplayHealthReport[];
    const mediaRows = mediaResponse?.ok
      ? ((await mediaResponse.json()) as ReportMediaRow[])
      : [];
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

export async function saveEpisodeProgress(
  accessToken: string | null,
  episodeId: string | null,
  input: Pick<
    EpisodeProgress,
    "followUpDay" | "conditionChange" | "appetite" | "energy"
  >,
): Promise<EpisodeProgress | null> {
  if (!isUuid(episodeId)) return null;
  const userId = await getAuthenticatedUserId(accessToken);
  if (
    !userId ||
    ![3, 7, 14, 30, 60, 90].includes(input.followUpDay) ||
    !["better", "same", "worse"].includes(input.conditionChange) ||
    !["normal", "slight", "low", "none"].includes(input.appetite) ||
    !["normal", "slight", "low", "none"].includes(input.energy)
  ) return null;

  try {
    const savedResponse = await supabaseRequest(
      "rpc/save_owner_episode_progress",
      {
        method: "POST",
        body: JSON.stringify({
          target_user_id: userId,
          target_episode_id: episodeId,
          target_follow_up_day: input.followUpDay,
          target_condition_change: input.conditionChange,
          target_appetite: input.appetite,
          target_energy: input.energy,
        }),
      },
    );
    if (!savedResponse?.ok) return null;
    const progressId = (await savedResponse.json()) as string;
    if (!isUuid(progressId)) return null;

    const response = await supabaseRequest(
      `episode_progress_logs?id=eq.${progressId}&user_id=eq.${userId}&select=id,episode_id,pet_id,follow_up_day,condition_change,appetite,energy,source_type,review_status,recorded_at&limit=1`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Parameters<typeof toEpisodeProgress>[0][];
    return rows[0] ? toEpisodeProgress(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function saveEpisodePlan(
  accessToken: string | null,
  episodeId: string | null,
  tasks: string[],
): Promise<EpisodePlan | null> {
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

    const response = await supabaseRequest(
      `episode_plans?id=eq.${planId}&user_id=eq.${userId}&select=id,episode_id,pet_id,source_type,review_status,reported_at,plan_tasks(id,task_text,position,completed_at)&limit=1`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Parameters<typeof toEpisodePlan>[0][];
    return rows[0] ? toEpisodePlan(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function setEpisodePlanTaskCompletion(
  accessToken: string | null,
  episodeId: string | null,
  taskId: string | null,
  completed: boolean,
): Promise<boolean> {
  if (!isUuid(episodeId) || !isUuid(taskId)) return false;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return false;
  try {
    const response = await supabaseRequest("rpc/set_plan_task_completion", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: userId,
        target_episode_id: episodeId,
        target_task_id: taskId,
        is_completed: completed,
      }),
    });
    if (!response?.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}

export async function closePetEpisode(
  accessToken: string | null,
  episodeId: string | null,
): Promise<PetEpisode | null> {
  if (!isUuid(episodeId)) return null;
  const userId = await getAuthenticatedUserId(accessToken);
  if (!userId) return null;
  try {
    const existingResponse = await supabaseRequest(
      `episodes?id=eq.${episodeId}&user_id=eq.${userId}&select=id,pet_id,status,started_at,last_activity_at,closed_at&limit=1`,
      { method: "GET" },
    );
    if (!existingResponse?.ok) return null;
    const existing = (await existingResponse.json()) as Array<{
      id: string;
      pet_id: string;
      status: PetEpisode["status"];
      started_at: string;
      last_activity_at: string;
      closed_at: string | null;
    }>;
    if (!existing[0]) return null;
    if (existing[0].status === "closed") return toPetEpisode(existing[0]);

    const closedAt = new Date().toISOString();
    const response = await supabaseRequest(
      `episodes?id=eq.${episodeId}&user_id=eq.${userId}&status=eq.open`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "closed",
          closed_at: closedAt,
          updated_at: closedAt,
        }),
      },
    );
    if (!response?.ok) return null;
    const rows = (await response.json()) as Array<{
      id: string;
      pet_id: string;
      status: PetEpisode["status"];
      started_at: string;
      last_activity_at: string;
      closed_at: string | null;
    }>;
    return rows[0] ? toPetEpisode(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function saveReportFeedback(
  reportId: string,
  clientId: string,
  feedback: "helpful" | "not-helpful",
): Promise<boolean> {
  if (!isUuid(reportId) || !isUuid(clientId)) return false;

  try {
    const response = await supabaseRequest(
      "health_report_feedback?on_conflict=report_id%2Cclient_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          report_id: reportId,
          client_id: clientId,
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

import type {
  AnalysisResult,
  EpisodePlan,
  HealthCheckInput,
  PetEpisode,
} from "./types";
import {
  isUuid,
  toStoredHealthReport,
  type DisplayHealthReport,
} from "./report-storage";

const requestTimeoutMs = 3500;

export type DatabaseStatus = "connected" | "unconfigured" | "error";

export interface HealthReportSaveResult {
  saved: boolean;
  episodeId: string | null;
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
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

async function getAuthenticatedUserId(
  accessToken: string | null,
): Promise<string | null> {
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
    const user = (await response.json()) as { id?: string };
    return isUuid(user.id) ? user.id : null;
  } catch {
    return null;
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
    return (await response.json()) as DisplayHealthReport[];
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

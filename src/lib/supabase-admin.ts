import type { AnalysisResult, HealthCheckInput } from "./types";
import {
  isUuid,
  toStoredHealthReport,
  type DisplayHealthReport,
} from "./report-storage";

const requestTimeoutMs = 3500;

export type DatabaseStatus = "connected" | "unconfigured" | "error";

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

export async function saveHealthReport(
  input: HealthCheckInput,
  result: AnalysisResult,
  clientId: string | null,
  isTest = false,
  account: { userId?: string | null; petId?: string | null } = {},
): Promise<boolean> {
  if (!isUuid(clientId)) return false;

  try {
    const payload = toStoredHealthReport(input, result, clientId, {
      appVersion: appVersion(),
      environment: deploymentEnvironment(),
      isTest,
      userId: account.userId,
      petId: account.petId,
    });
    const response = await supabaseRequest(
      "health_reports?on_conflict=id%2Cclient_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(payload),
      },
    );
    return response?.ok ?? false;
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
    const userResponse = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!userResponse.ok) return null;
    const user = (await userResponse.json()) as { id?: string };
    if (!isUuid(user.id)) return null;
    const petResponse = await supabaseRequest(
      `pets?id=eq.${petId}&user_id=eq.${user.id}&select=id&limit=1`,
      { method: "GET" },
    );
    if (!petResponse?.ok) return null;
    const pets = (await petResponse.json()) as Array<{ id: string }>;
    return pets[0]?.id === petId ? { userId: user.id, petId } : null;
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
      `health_reports?user_id=eq.${owner.userId}&pet_id=eq.${owner.petId}&select=id,pet_id,species,breed,age_group,symptoms,appetite,energy,duration,red_flags,risk_level,risk_score,analysis_source,created_at&order=created_at.desc&limit=60`,
      { method: "GET" },
    );
    if (!response?.ok) return null;
    return (await response.json()) as DisplayHealthReport[];
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

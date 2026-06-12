import type { AnalysisResult, HealthCheckInput } from "./types";
import { isUuid, toStoredHealthReport } from "./report-storage";

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
): Promise<boolean> {
  if (!isUuid(clientId)) return false;

  try {
    const payload = toStoredHealthReport(input, result, clientId, {
      appVersion: appVersion(),
      environment: deploymentEnvironment(),
      isTest,
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

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const envFile = resolve(process.cwd(), envFileArg?.split("=")[1] ?? ".env.local");
const days = Number(daysArg?.split("=")[1] ?? 30);

if (!Number.isInteger(days) || days < 1 || days > 365) {
  throw new Error("--days must be an integer between 1 and 365");
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function percent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function validationStatus(summaries, shares, repeatUsers) {
  if (!summaries) return "무료 전달본 생성 전";
  if (!shares) return "무료 전달본 생성 확인 · 공유 신호 필요";
  if (!repeatUsers) return "생성·공유 확인 · 재사용 신호 필요";
  return "무료 전달본 생성 · 공유 · 재사용 신호 확인";
}

export function queryFreeDailyUsage(client, since) {
  return client
    .from("ai_report_usage")
    .select("user_id,episode_id,status,estimated_cost_usd,generated_at")
    .eq("access_mode", "free_daily")
    .gte("generated_at", since);
}

async function main() {
  loadEnv(envFile);
  const url = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  )?.replace(/\/$/, "");
  if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString();

  const [usageResult, shareResult] = await Promise.all([
    queryFreeDailyUsage(client, since),
    client
      .from("monetization_events")
      .select("user_id,event_name,created_at")
      .in("event_name", ["ai_summary_shared", "factual_summary_shared"])
      .gte("created_at", since),
  ]);
  if (usageResult.error) throw usageResult.error;
  if (shareResult.error) throw shareResult.error;

  const usage = usageResult.data ?? [];
  const succeeded = usage.filter((row) => row.status === "succeeded");
  const failed = usage.filter((row) => row.status === "failed");
  const shares = shareResult.data ?? [];
  const aiShares = shares.filter((row) => row.event_name === "ai_summary_shared");
  const factualShares = shares.filter(
    (row) => row.event_name === "factual_summary_shared",
  );
  const generatedByUser = new Map();
  const generatedEpisodesByUser = new Map();
  for (const row of succeeded) {
    generatedByUser.set(row.user_id, (generatedByUser.get(row.user_id) ?? 0) + 1);
    if (!row.episode_id) continue;
    const episodes = generatedEpisodesByUser.get(row.user_id) ?? new Set();
    episodes.add(row.episode_id);
    generatedEpisodesByUser.set(row.user_id, episodes);
  }
  const repeatUsers = [...generatedEpisodesByUser.values()].filter(
    (episodesForUser) => episodesForUser.size > 1,
  ).length;
  const usersWhoShared = new Set(shares.map((row) => row.user_id)).size;
  const usersWhoSharedAi = new Set(aiShares.map((row) => row.user_id)).size;
  const usersWhoSharedFactual = new Set(
    factualShares.map((row) => row.user_id),
  ).size;
  const estimatedAiCostUsd = succeeded.reduce(
    (total, row) => total + Number(row.estimated_cost_usd ?? 0),
    0,
  );

  const output = {
    period: `${since.slice(0, 10)} ~ 오늘 (${days}일)`,
    status: validationStatus(succeeded.length, shares.length, repeatUsers),
    funnel: {
      usersWhoGenerated: generatedByUser.size,
      usersWhoShared,
      usersWhoSharedAi,
      usersWhoSharedFactual,
      summariesCreated: succeeded.length,
      summariesFailed: failed.length,
      summaryShares: shares.length,
      aiSummaryShares: aiShares.length,
      factualSummaryShares: factualShares.length,
      repeatUsers,
      repeatDefinition: "서로 다른 건강 흐름에서 AI 전달본을 만든 사용자",
      generationToSharePercent: percent(
        usersWhoSharedAi,
        generatedByUser.size,
      ),
      estimatedAiCostUsd: Math.round(estimatedAiCostUsd * 1_000_000) / 1_000_000,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

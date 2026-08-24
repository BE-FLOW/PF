import { execFileSync } from "node:child_process";

const target = process.argv[2]?.replace(/\/$/, "");
if (!target) {
  console.error(
    "Usage: npm run verify:deployment -- https://preview-url.vercel.app [--commit=<git-sha>]",
  );
  process.exit(1);
}

const commitArg = process.argv.find((arg) => arg.startsWith("--commit="));
const expectedCommit = (
  commitArg?.slice("--commit=".length) ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
).trim();
if (!/^[0-9a-f]{7,40}$/i.test(expectedCommit)) {
  throw new Error("Expected deployment commit must be a Git SHA.");
}

async function requestJson(path, init) {
  const response = await fetch(`${target}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const healthResult = await requestJson("/api/health");
if (!healthResult.response.ok) {
  throw new Error(`/api/health returned ${healthResult.response.status}`);
}
if (healthResult.body.status !== "ok") {
  throw new Error(`Deployment health is ${healthResult.body.status ?? "unknown"}.`);
}
if (healthResult.body.database !== "connected") {
  throw new Error(
    `Deployment database is ${healthResult.body.database ?? "unknown"}.`,
  );
}
if (healthResult.body.freeReleaseSchema !== "ready") {
  throw new Error(
    `Deployment free-release schema is ${healthResult.body.freeReleaseSchema ?? "unknown"}; expected ready.`,
  );
}
if (healthResult.body.releaseMode !== "free") {
  throw new Error(
    `Deployment release mode is ${healthResult.body.releaseMode ?? "unknown"}; expected free.`,
  );
}
if (
  healthResult.body.freeAi?.enabled !== true ||
  healthResult.body.freeAi?.generationConfigured !== true ||
  !Number.isSafeInteger(healthResult.body.freeAi?.dailyLimit) ||
  healthResult.body.freeAi.dailyLimit < 1 ||
  !Number.isSafeInteger(healthResult.body.freeAi?.dailyAttemptLimit) ||
  healthResult.body.freeAi.dailyAttemptLimit <
    healthResult.body.freeAi.dailyLimit
) {
  throw new Error("Deployment free AI fair-use configuration is invalid.");
}
if (
  !/^[0-9a-f]{12}$/i.test(healthResult.body.version ?? "") ||
  !expectedCommit.startsWith(healthResult.body.version)
) {
  throw new Error(
    `Deployment ${healthResult.body.version ?? "unknown"} does not match ${expectedCommit.slice(0, 12)}.`,
  );
}

for (const path of [
  "/api/billing/events",
  "/api/billing/sync",
  "/api/billing/revenuecat/webhook",
]) {
  const disabledBilling = await requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (disabledBilling.response.status !== 410) {
    throw new Error(
      `${path} returned ${disabledBilling.response.status}; expected 410 in the free release.`,
    );
  }
}

const unauthorized = await requestJson("/api/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-petflow-pet-id": "30000000-0000-4000-8000-000000000001",
  },
  body: JSON.stringify({
    petName: "배포검증",
    species: "dog",
    ageGroup: "adult",
    symptoms: [],
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  }),
});
if (unauthorized.response.status !== 401) {
  throw new Error(
    `Unauthenticated analysis returned ${unauthorized.response.status}; expected 401.`,
  );
}

console.log(
  JSON.stringify(
    {
      target,
      health: healthResult.body.status,
      releaseMode: healthResult.body.releaseMode,
      freeReleaseSchema: healthResult.body.freeReleaseSchema,
      freeAiDailyLimit: healthResult.body.freeAi.dailyLimit,
      version: healthResult.body.version,
      anonymousWriteBlocked: true,
      billingRoutesDisabled: true,
      result: "ok",
    },
    null,
    2,
  ),
);

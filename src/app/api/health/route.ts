import { NextResponse } from "next/server";
import { freeAiServerConfiguration } from "@/lib/ai-access";
import {
  checkDatabaseConnection,
  checkFreeReleaseSchema,
} from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, freeReleaseSchema] = await Promise.all([
    checkDatabaseConnection(),
    checkFreeReleaseSchema(),
  ]);
  const freeAi = freeAiServerConfiguration();
  const healthy = database === "connected" && freeReleaseSchema === "ready";
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
    "local";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      freeReleaseSchema,
      releaseMode: "free",
      freeAi: {
        enabled: freeAi.freeRelease && freeAi.generationConfigured,
        generationConfigured: freeAi.generationConfigured,
        dailyLimit: freeAi.dailyLimit,
        dailyAttemptLimit: freeAi.dailyAttemptLimit,
      },
      version,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

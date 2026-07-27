import { NextResponse } from "next/server";
import { isRevenueCatConfigured } from "@/lib/revenuecat";
import { checkDatabaseConnection } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseConnection();
  const healthy = database === "connected";
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
    "local";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      billing: isRevenueCatConfigured() ? "configured" : "unconfigured",
      version,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

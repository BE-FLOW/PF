import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseConnection();
  return NextResponse.json(
    {
      status: database === "error" ? "degraded" : "ok",
      database,
      environment:
        process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      version:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
        process.env.NEXT_PUBLIC_APP_VERSION ||
        "dev",
      checkedAt: new Date().toISOString(),
    },
    { status: database === "error" ? 503 : 200 },
  );
}

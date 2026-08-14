import { NextResponse } from "next/server";
import { revenueCatServerConfiguration } from "@/lib/billing-config";
import { checkDatabaseConnection } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseConnection();
  const billing = revenueCatServerConfiguration();
  const healthy = database === "connected";
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
    "local";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      billing: billing.ready ? "configured" : "unconfigured",
      billingChecks: {
        customerSync: billing.customerSync,
        webhook: billing.webhook,
        productAllowlist: billing.productAllowlist,
      },
      version,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

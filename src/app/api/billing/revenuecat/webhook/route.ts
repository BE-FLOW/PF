import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Billing webhook is disabled for the free public release." },
    { status: 410 },
  );
}

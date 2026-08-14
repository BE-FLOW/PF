import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api-request";
import {
  processRevenueCatWebhook,
  type RevenueCatWebhookEvent,
  verifyRevenueCatWebhookAuthorization,
} from "@/lib/revenuecat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (
    !verifyRevenueCatWebhookAuthorization(request.headers.get("authorization"))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody<{ event?: RevenueCatWebhookEvent }>(
    request,
    64 * 1024,
  );
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const event = body.value.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await processRevenueCatWebhook(event);
    const status =
      result.status === "invalid"
        ? 400
        : result.status === "failed"
          ? 503
          : 200;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  processRevenueCatWebhook,
  type RevenueCatWebhookEvent,
  verifyRevenueCatWebhookAuthorization,
} from "@/lib/revenuecat";

export async function POST(request: NextRequest) {
  if (
    !verifyRevenueCatWebhookAuthorization(request.headers.get("authorization"))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: RevenueCatWebhookEvent;
  try {
    const payload = (await request.json()) as {
      event?: RevenueCatWebhookEvent;
    };
    if (!payload.event) throw new Error("Missing event");
    event = payload.event;
  } catch {
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

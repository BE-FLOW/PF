import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { parseProductQualityEvent } from "@/lib/product-event";
import { recordMonetizationEvent } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = await readJsonBody<unknown>(request, 4 * 1024);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const event = parseProductQualityEvent(parsed.value);
  if (!event) {
    return NextResponse.json(
      { error: "공유 완료 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const result = await recordMonetizationEvent(
    accessTokenFromRequest(request),
    event,
  );
  if (result !== "saved") {
    return NextResponse.json(
      {
        error:
          result === "unauthorized"
            ? "로그인이 필요해요."
            : "공유 완료 정보를 저장하지 못했어요.",
      },
      { status: result === "unauthorized" ? 401 : 503 },
    );
  }

  return NextResponse.json({ saved: true });
}

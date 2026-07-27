import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isUuid } from "@/lib/report-storage";
import { saveAiReportFeedback } from "@/lib/supabase-admin";
import type { AiReportFeedbackInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const parsed = await readJsonBody<Partial<AiReportFeedbackInput>>(
    request,
    4 * 1024,
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const body = parsed.value;

  if (
    !isUuid(body.usageId) ||
    !Number.isInteger(body.usefulnessScore) ||
    ![1, 2, 3, 4, 5].includes(body.usefulnessScore ?? 0) ||
    (body.comment !== undefined &&
      (typeof body.comment !== "string" || body.comment.length > 500))
  ) {
    return NextResponse.json(
      { error: "AI 리포트 피드백을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await saveAiReportFeedback(accessToken, {
    usageId: body.usageId,
    usefulnessScore: body.usefulnessScore,
    comment: body.comment,
  } as AiReportFeedbackInput);
  if (!saved) {
    return NextResponse.json(
      { error: "피드백을 저장하지 못했어요." },
      { status: 400 },
    );
  }
  return NextResponse.json({ saved: true });
}

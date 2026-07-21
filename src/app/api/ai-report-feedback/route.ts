import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { saveAiReportFeedback } from "@/lib/supabase-admin";
import type { AiReportFeedbackInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Partial<AiReportFeedbackInput>;
  try {
    body = (await request.json()) as Partial<AiReportFeedbackInput>;
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.usageId !== "string" ||
    typeof body.usefulnessScore !== "number"
  ) {
    return NextResponse.json(
      { error: "AI 리포트 피드백을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await saveAiReportFeedback(accessTokenFromRequest(request), {
    usageId: body.usageId,
    episodeId: body.episodeId,
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

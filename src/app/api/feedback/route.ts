import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isUuid } from "@/lib/report-storage";
import { saveReportFeedback } from "@/lib/supabase-admin";

interface FeedbackRequest {
  reportId?: string;
  feedback?: "helpful" | "not-helpful";
}

export async function POST(request: Request) {
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  const parsed = await readJsonBody<FeedbackRequest>(request, 4 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const body = parsed.value;

  if (
    !isUuid(body.reportId) ||
    !["helpful", "not-helpful"].includes(body.feedback ?? "")
  ) {
    return NextResponse.json(
      { error: "피드백 값을 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await saveReportFeedback(
    accessToken,
    body.reportId,
    body.feedback as "helpful" | "not-helpful",
  );
  if (!saved) {
    return NextResponse.json(
      { error: "피드백을 저장할 기록을 확인하지 못했어요." },
      { status: 404 },
    );
  }
  return NextResponse.json({ saved: true });
}

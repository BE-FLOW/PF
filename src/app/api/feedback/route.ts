import { NextResponse } from "next/server";
import { saveReportFeedback } from "@/lib/supabase-admin";

interface FeedbackRequest {
  reportId?: string;
  clientId?: string;
  feedback?: "helpful" | "not-helpful";
}

export async function POST(request: Request) {
  let body: FeedbackRequest;
  try {
    body = (await request.json()) as FeedbackRequest;
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (
    !body.reportId ||
    !body.clientId ||
    !["helpful", "not-helpful"].includes(body.feedback ?? "")
  ) {
    return NextResponse.json(
      { error: "피드백 값을 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await saveReportFeedback(
    body.reportId,
    body.clientId,
    body.feedback as "helpful" | "not-helpful",
  );
  return NextResponse.json({ saved });
}

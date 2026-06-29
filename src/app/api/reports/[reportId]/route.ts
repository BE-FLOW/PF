import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { analyzeLocally, isHealthCheckInput } from "@/lib/analysis";
import {
  deleteHealthReport,
  updateHealthReport,
} from "@/lib/supabase-admin";
import type { AnalysisResult, ReportMediaAttachment } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (!isHealthCheckInput(body)) {
    return NextResponse.json(
      { error: "입력값을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const { reportId } = await context.params;
  const localResult = analyzeLocally(body);
  const saved = await updateHealthReport(
    accessTokenFromRequest(request),
    reportId,
    body,
    localResult,
  );

  if (!saved) {
    return NextResponse.json(
      { error: "기록을 수정하지 못했어요." },
      { status: 404 },
    );
  }

  const { report } = saved;
  const result: AnalysisResult & {
    episodeId?: string | null;
    media?: ReportMediaAttachment[];
    petId?: string | null;
  } = {
    ...localResult,
    id: report.id,
    createdAt: report.created_at,
    riskLevel: report.risk_level,
    riskScore: report.risk_score,
    source: report.analysis_source,
    storage: "remote",
    episodeId: report.episode_id,
    petId: report.pet_id,
    media: report.media ?? [],
  };

  return NextResponse.json(result);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await context.params;
  const deleted = await deleteHealthReport(
    accessTokenFromRequest(request),
    reportId,
  );

  if (!deleted) {
    return NextResponse.json(
      { error: "기록을 삭제하지 못했어요." },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}

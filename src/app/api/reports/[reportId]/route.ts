import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isHealthCheckInput } from "@/lib/analysis";
import { isUuid } from "@/lib/report-storage";
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
  const accessToken = accessTokenFromRequest(request);
  const { reportId } = await context.params;
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(reportId)) {
    return NextResponse.json(
      { error: "기록 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const parsed = await readJsonBody(request, 16 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }

  if (!isHealthCheckInput(parsed.value)) {
    return NextResponse.json(
      { error: "입력값을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await updateHealthReport(
    accessToken,
    reportId,
    parsed.value,
  );

  if (!saved) {
    return NextResponse.json(
      { error: "기록을 수정하지 못했어요." },
      { status: 404 },
    );
  }

  const { report, result: localResult } = saved;
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
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(reportId)) {
    return NextResponse.json(
      { error: "기록 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const deleted = await deleteHealthReport(accessToken, reportId);

  if (!deleted) {
    return NextResponse.json(
      { error: "기록을 삭제하지 못했어요." },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}

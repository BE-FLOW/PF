import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isUuid } from "@/lib/report-storage";
import {
  prepareHealthReportMediaUploads,
  type ReportMediaUploadInput,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(
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
  const parsed = await readJsonBody<{ files?: unknown }>(request, 8 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  if (!Array.isArray(parsed.value.files)) {
    return NextResponse.json(
      { error: "첨부할 사진·영상 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const uploads = await prepareHealthReportMediaUploads(
    accessToken,
    reportId,
    parsed.value.files as ReportMediaUploadInput[],
  );
  if (!uploads) {
    return NextResponse.json(
      { error: "첨부할 파일의 권한, 형식 또는 개수를 확인해 주세요." },
      { status: 403 },
    );
  }
  return NextResponse.json({ uploads });
}

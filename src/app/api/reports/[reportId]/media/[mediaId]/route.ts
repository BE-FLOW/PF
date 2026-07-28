import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { isUuid } from "@/lib/report-storage";
import { deleteHealthReportMedia } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ reportId: string; mediaId: string }> },
) {
  const accessToken = accessTokenFromRequest(request);
  const { reportId, mediaId } = await context.params;

  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(reportId) || !isUuid(mediaId)) {
    return NextResponse.json(
      { error: "첨부 자료 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const deleted = await deleteHealthReportMedia(
    accessToken,
    reportId,
    mediaId,
  );
  if (!deleted) {
    return NextResponse.json(
      { error: "첨부 자료를 삭제하지 못했어요." },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}

import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { isUuid } from "@/lib/report-storage";
import { deletePet } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ petId: string }> },
) {
  const accessToken = accessTokenFromRequest(request);
  const { petId } = await context.params;

  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(petId)) {
    return NextResponse.json(
      { error: "반려동물 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const deleted = await deletePet(accessToken, petId);
  if (!deleted) {
    return NextResponse.json(
      { error: "반려동물을 삭제하지 못했어요." },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}

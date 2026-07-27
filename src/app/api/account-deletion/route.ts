import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { deleteAccount } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const deleted = await deleteAccount(accessToken);
  if (!deleted) {
    return NextResponse.json(
      { error: "계정 탈퇴를 완료하지 못했어요. 다시 로그인한 뒤 시도해 주세요." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    deleted: true,
    deletedAt: deleted.deletedAt,
  });
}

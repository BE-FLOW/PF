import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { deleteAccount, requestAccountDeletion } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const saved = await requestAccountDeletion(accessTokenFromRequest(request));
  if (!saved) {
    return NextResponse.json(
      { error: "계정 삭제 요청을 접수하지 못했어요." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    requested: true,
    requestedAt: saved.requestedAt,
  });
}

export async function DELETE(request: Request) {
  const deleted = await deleteAccount(accessTokenFromRequest(request));
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

import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { requestAccountDeletion } from "@/lib/supabase-admin";

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

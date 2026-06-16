import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import {
  getAiAccessStatus,
  redeemAiAccessCode,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const status = await getAiAccessStatus(accessTokenFromRequest(request));
  if (!status) {
    return NextResponse.json(
      { error: "로그인 상태를 다시 확인해 주세요." },
      { status: 401 },
    );
  }
  return NextResponse.json({ access: status });
}

export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (typeof body.code !== "string" || body.code.trim().length < 6) {
    return NextResponse.json(
      { error: "참여코드를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const status = await redeemAiAccessCode(
    accessTokenFromRequest(request),
    body.code,
  );
  if (!status) {
    return NextResponse.json(
      { error: "참여코드가 올바르지 않거나 사용할 수 없어요." },
      { status: 400 },
    );
  }
  return NextResponse.json({ access: status });
}

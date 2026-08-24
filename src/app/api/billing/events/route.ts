import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "현재 무료 공개판에서는 결제 흐름을 기록하지 않아요." },
    { status: 410 },
  );
}

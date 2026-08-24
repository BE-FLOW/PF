import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "현재 무료 공개판에서는 구매 내역 동기화를 사용하지 않아요." },
    { status: 410 },
  );
}

import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { getAiAccessStatus } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const status = await getAiAccessStatus(accessTokenFromRequest(request));
  if (!status) {
    return NextResponse.json(
      { error: "로그인이 필요해요." },
      { status: 401 },
    );
  }
  return NextResponse.json({ access: status });
}

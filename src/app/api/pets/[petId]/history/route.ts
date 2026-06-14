import { NextResponse } from "next/server";
import { listPetHealthReports } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ petId: string }> },
) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  const { petId } = await context.params;
  const reports = await listPetHealthReports(accessToken, petId);
  if (!reports) {
    return NextResponse.json(
      { error: "기록을 불러올 수 없습니다." },
      { status: 401 },
    );
  }
  return NextResponse.json({ reports });
}

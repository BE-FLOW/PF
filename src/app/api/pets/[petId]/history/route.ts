import { NextResponse } from "next/server";
import {
  listPetEpisodes,
  listPetEpisodePlans,
  listPetEpisodeProgress,
  listPetHealthReports,
} from "@/lib/supabase-admin";

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
  const [reports, episodes, plans, progress] = await Promise.all([
    listPetHealthReports(accessToken, petId),
    listPetEpisodes(accessToken, petId),
    listPetEpisodePlans(accessToken, petId),
    listPetEpisodeProgress(accessToken, petId),
  ]);
  if (!reports || !episodes || !plans || !progress) {
    return NextResponse.json(
      { error: "기록을 불러올 수 없어요." },
      { status: 401 },
    );
  }
  return NextResponse.json({ reports, episodes, plans, progress });
}

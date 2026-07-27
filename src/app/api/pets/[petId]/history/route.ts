import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { isUuid } from "@/lib/report-storage";
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
  const { petId } = await context.params;
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(petId)) {
    return NextResponse.json(
      { error: "반려동물 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
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

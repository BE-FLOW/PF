import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { closePetEpisode } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  const { episodeId } = await context.params;
  const episode = await closePetEpisode(
    accessTokenFromRequest(request),
    episodeId,
  );
  if (!episode) {
    return NextResponse.json(
      { error: "이번 기록을 마무리하지 못했어요." },
      { status: 401 },
    );
  }
  return NextResponse.json({ episode });
}

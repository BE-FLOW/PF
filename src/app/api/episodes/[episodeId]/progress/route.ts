import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { saveEpisodeProgress } from "@/lib/supabase-admin";
import type {
  ConditionChange,
  FollowUpDay,
  Level,
} from "@/lib/types";

export const runtime = "nodejs";

interface ProgressRequest {
  followUpDay?: unknown;
  conditionChange?: unknown;
  appetite?: unknown;
  energy?: unknown;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  let body: ProgressRequest;
  try {
    body = (await request.json()) as ProgressRequest;
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.followUpDay !== "number" ||
    typeof body.conditionChange !== "string" ||
    typeof body.appetite !== "string" ||
    typeof body.energy !== "string"
  ) {
    return NextResponse.json(
      { error: "경과 기록을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const { episodeId } = await context.params;
  const progress = await saveEpisodeProgress(
    accessTokenFromRequest(request),
    episodeId,
    {
      followUpDay: body.followUpDay as FollowUpDay,
      conditionChange: body.conditionChange as ConditionChange,
      appetite: body.appetite as Level,
      energy: body.energy as Level,
    },
  );
  if (!progress) {
    return NextResponse.json(
      { error: "경과 기록을 저장하지 못했어요." },
      { status: 400 },
    );
  }
  return NextResponse.json({ progress });
}

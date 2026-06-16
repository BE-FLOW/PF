import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import {
  saveEpisodePlan,
  setEpisodePlanTaskCompletion,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  let body: { tasks?: unknown };
  try {
    body = (await request.json()) as { tasks?: unknown };
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(body.tasks) ||
    body.tasks.some((task) => typeof task !== "string")
  ) {
    return NextResponse.json(
      { error: "계획 항목을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const { episodeId } = await context.params;
  const plan = await saveEpisodePlan(
    accessTokenFromRequest(request),
    episodeId,
    body.tasks as string[],
  );
  if (!plan) {
    return NextResponse.json(
      { error: "병원에서 받은 계획을 저장하지 못했어요." },
      { status: 400 },
    );
  }
  return NextResponse.json({ plan });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  let body: { taskId?: unknown; completed?: unknown };
  try {
    body = (await request.json()) as {
      taskId?: unknown;
      completed?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (typeof body.taskId !== "string" || typeof body.completed !== "boolean") {
    return NextResponse.json(
      { error: "체크할 계획 항목을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const { episodeId } = await context.params;
  const saved = await setEpisodePlanTaskCompletion(
    accessTokenFromRequest(request),
    episodeId,
    body.taskId,
    body.completed,
  );
  if (!saved) {
    return NextResponse.json(
      { error: "계획 체크 상태를 저장하지 못했어요." },
      { status: 400 },
    );
  }
  return NextResponse.json({ saved: true });
}

import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isUuid } from "@/lib/report-storage";
import {
  saveEpisodePlan,
  setEpisodePlanTaskCompletion,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  const accessToken = accessTokenFromRequest(request);
  const { episodeId } = await context.params;
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(episodeId)) {
    return NextResponse.json(
      { error: "건강 흐름 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const parsed = await readJsonBody<{ tasks?: unknown }>(request, 4 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const body = parsed.value;
  if (
    !Array.isArray(body.tasks) ||
    body.tasks.length < 1 ||
    body.tasks.length > 5 ||
    body.tasks.some(
      (task) =>
        typeof task !== "string" ||
        task.trim().length < 1 ||
        task.trim().length > 160,
    ) ||
    new Set(body.tasks.map((task) => String(task).trim())).size !==
      body.tasks.length
  ) {
    return NextResponse.json(
      { error: "계획 항목을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const tasks = body.tasks.map((task) => task.trim());
  const plan = await saveEpisodePlan(accessToken, episodeId, tasks);
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
  const accessToken = accessTokenFromRequest(request);
  const { episodeId } = await context.params;
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(episodeId)) {
    return NextResponse.json(
      { error: "건강 흐름 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const parsed = await readJsonBody<{
    taskId?: unknown;
    completed?: unknown;
  }>(request, 2 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const body = parsed.value;
  if (
    typeof body.taskId !== "string" ||
    !isUuid(body.taskId) ||
    typeof body.completed !== "boolean"
  ) {
    return NextResponse.json(
      { error: "체크할 계획 항목을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await setEpisodePlanTaskCompletion(
    accessToken,
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

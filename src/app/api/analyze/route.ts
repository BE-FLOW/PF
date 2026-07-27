import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isHealthCheckInput } from "@/lib/analysis";
import { recordDateKeyToIso } from "@/lib/record-calendar";
import { isUuid } from "@/lib/report-storage";
import { getReportOwner, saveHealthReport } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  const parsed = await readJsonBody(request, 16 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  if (!isHealthCheckInput(parsed.value)) {
    return NextResponse.json(
      { error: "입력값을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const petId = request.headers.get("x-petflow-pet-id")?.trim() ?? "";
  if (idempotencyKey && !isUuid(idempotencyKey)) {
    return NextResponse.json(
      { error: "저장 요청 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  if (!isUuid(petId)) {
    return NextResponse.json(
      { error: "계정과 반려동물 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const requestId = idempotencyKey || crypto.randomUUID();

  const owner = await getReportOwner(accessToken, petId);
  if (!owner) {
    return NextResponse.json(
      { error: "이 반려동물의 기록을 저장할 권한이 없어요." },
      { status: 403 },
    );
  }

  const observedDate = request.headers.get("x-petflow-observed-date")?.trim();
  const observedAt = observedDate ? recordDateKeyToIso(observedDate) : null;
  if (observedDate && !observedAt) {
    return NextResponse.json(
      { error: "기록 날짜를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const saved = await saveHealthReport(
    parsed.value,
    requestId,
    owner,
    observedAt,
  );
  if (!saved.saved || !saved.result) {
    return NextResponse.json(
      { error: "기록을 안전하게 저장하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ...saved.result,
    storage: "remote",
    episodeId: saved.episodeId,
  });
}

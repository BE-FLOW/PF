import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { extractResponseOutputText } from "@/lib/openai-response";
import { storedReportToHistoryRecord } from "@/lib/report-storage";
import {
  completeAiReportUsage,
  getAiReportAccess,
  getEpisodeVetReviewBundle,
  recordAiReportUsage,
  reserveAiReportUsage,
} from "@/lib/supabase-admin";
import {
  buildVetReviewDraft,
  formatVetReviewDraft,
} from "@/lib/vet-review-report";
import type { VetReviewDraft } from "@/lib/types";

export const runtime = "nodejs";

function cleanStringArray(value: unknown, minItems: number, maxItems: number) {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 320))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length >= minItems ? items : null;
}

function cleanString(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

interface OpenAiUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

async function requestedReportIds(request: Request) {
  try {
    const body = (await request.json()) as { reportIds?: unknown };
    if (!Array.isArray(body.reportIds)) return [];
    return [...new Set(body.reportIds)]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 60);
  } catch {
    return [];
  }
}

async function enrichWithOpenAI(
  baseDraft: VetReviewDraft,
  apiKey: string,
  model: string,
): Promise<{
  draft?: VetReviewDraft;
  usage?: OpenAiUsage;
  errorCode?: string;
}> {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 1800,
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "petflow_vet_review_draft",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                overview: { type: "string" },
                handoffNote: { type: "string" },
                keyObservations: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 5,
                },
                planAndProgress: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 6,
                },
                mediaSummary: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 5,
                },
                questionsForVet: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 4,
                },
                submissionNote: { type: "string" },
              },
              required: [
                "overview",
                "handoffNote",
                "keyObservations",
                "mediaSummary",
                "planAndProgress",
                "questionsForVet",
                "submissionNote",
              ],
            },
          },
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "당신은 반려동물 병원 접수 전 보호자 관찰 기록을 수의사가 빠르게 검토할 수 있게 정리하는 보조자입니다. " +
                  "수의사 친화적인 사전 문진 보고서 문체를 사용하되 짧고 객관적으로 작성하세요. " +
                  "입력된 사실만 사용하고 새 의학적 판단을 추가하지 마세요. " +
                  "진단명, 질병 확정, 약물명, 용량, 치료 처방, 치료 계획을 생성하지 마세요. " +
                  "보호자가 입력한 병원 계획과 경과는 수의사 확인 전 정보로 분리하세요. " +
                  "첨부 사진·영상은 종류와 개수만 요약하고 이미지·영상 내용을 판독하거나 해석하지 마세요. " +
                  "날짜별 변화, 반복 증상, 식욕·활력, 앱 안전 분류, 보호자 입력 계획, 3·7·14·30·60·90일 경과를 구분하세요. " +
                  "다른 병원에 처음 방문해도 이전 경과를 다시 설명하는 시간을 줄일 수 있게 handoffNote를 시간 순서로 작성하세요. " +
                  "SOAP-LOOP의 관찰·정리·계획·경과 구조를 반영하되 SOAP 같은 전문 약어를 제목으로 노출하지 마세요. " +
                  "보고서는 진료 전 검토 시간을 줄이는 초안이며 진단을 대신하지 않습니다. 한국어로 짧고 밀도 있게 작성하세요.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  title: baseDraft.title,
                  overview: baseDraft.overview,
                  handoffNote: baseDraft.handoffNote,
                  keyObservations: baseDraft.keyObservations,
                  timeline: baseDraft.timeline,
                  mediaSummary: baseDraft.mediaSummary,
                  planAndProgress: baseDraft.planAndProgress,
                  questionsForVet: baseDraft.questionsForVet,
                  submissionNote: baseDraft.submissionNote,
                  disclaimer: baseDraft.disclaimer,
                }),
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return { errorCode: "openai_response_error" };
    const data = (await response.json()) as { usage?: OpenAiUsage };
    const outputText = extractResponseOutputText(data);
    if (!outputText) return { errorCode: "openai_empty_response" };
    const generated = JSON.parse(outputText) as Record<string, unknown>;
    const overview = cleanString(generated.overview, baseDraft.overview, 500);
    const keyObservations =
      cleanStringArray(generated.keyObservations, 2, 5) ??
      baseDraft.keyObservations;
    const handoffNote = cleanString(
      generated.handoffNote,
      baseDraft.handoffNote,
      700,
    );
    const planAndProgress =
      cleanStringArray(generated.planAndProgress, 1, 6) ??
      baseDraft.planAndProgress;
    const mediaSummary =
      cleanStringArray(generated.mediaSummary, 1, 5) ?? baseDraft.mediaSummary;
    const questionsForVet =
      cleanStringArray(generated.questionsForVet, 2, 4) ??
      baseDraft.questionsForVet;
    const submissionNote = cleanString(
      generated.submissionNote,
      baseDraft.submissionNote,
      500,
    );
    const draftWithoutCopy: Omit<VetReviewDraft, "copyText"> = {
      ...baseDraft,
      source: "openai",
      overview,
      handoffNote,
      keyObservations,
      mediaSummary,
      planAndProgress,
      questionsForVet,
      submissionNote,
    };
    return {
      draft: {
        ...draftWithoutCopy,
        copyText: formatVetReviewDraft(draftWithoutCopy),
      },
      usage: data.usage,
    };
  } catch {
    return { errorCode: "openai_request_failed" };
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  const { episodeId } = await context.params;
  const reportIds = await requestedReportIds(request);
  const accessToken = accessTokenFromRequest(request);
  const access = await getAiReportAccess(accessToken);
  if (!access) {
    return NextResponse.json(
      { error: "로그인이 필요해요." },
      { status: 401 },
    );
  }
  if (!access.status.enabled) {
    const unavailable = access.status.reason === "unavailable";
    return NextResponse.json(
      {
        error: unavailable
          ? "AI 요약 사용량을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "이번 달 AI 요약 사용량을 모두 사용했어요.",
        access: access.status,
      },
      { status: unavailable ? 503 : 429 },
    );
  }

  const bundle = await getEpisodeVetReviewBundle(accessToken, episodeId);
  if (!bundle) {
    return NextResponse.json(
      { error: "수의사 검토용 초안을 만들 권한이나 기록을 확인하지 못했어요." },
      { status: 401 },
    );
  }
  if (!bundle.reports.length) {
    return NextResponse.json(
      { error: "초안을 만들 건강 기록이 아직 없어요." },
      { status: 404 },
    );
  }

  const reports = reportIds.length
    ? bundle.reports.filter((report) => reportIds.includes(report.id))
    : bundle.reports;
  if (reportIds.length && reports.length !== reportIds.length) {
    return NextResponse.json(
      { error: "선택한 기록 범위를 확인하지 못했어요." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini-2026-03-17";
  if (!apiKey) {
    await recordAiReportUsage({
      userId: access.userId,
      petId: bundle.pet.id,
      episodeId: bundle.episode.id,
      status: "failed",
      model,
      errorCode: "openai_unconfigured",
    });
    return NextResponse.json(
      { error: "AI 요약을 잠시 사용할 수 없어요." },
      { status: 503 },
    );
  }

  const records = reports.map((report) =>
    storedReportToHistoryRecord(report, bundle.pet),
  );
  const isPartialSelection = reports.length !== bundle.reports.length;
  const localDraft = buildVetReviewDraft(
    records,
    bundle.pet.name,
    isPartialSelection ? undefined : bundle.plan,
    isPartialSelection ? [] : bundle.progress,
    { episodeStartedAt: bundle.episode.startedAt },
  );
  const reservation = await reserveAiReportUsage({
    userId: access.userId,
    petId: bundle.episode.petId,
    episodeId: bundle.episode.id,
    model,
    monthlyReportLimit: access.status.monthlyReportLimit,
  });
  if (!reservation.usageId) {
    return NextResponse.json(
      {
        error: reservation.unavailable
          ? "AI 요약 사용량을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "이번 달 AI 요약 사용량을 모두 사용했어요.",
      },
      { status: reservation.unavailable ? 503 : 429 },
    );
  }

  const result = await enrichWithOpenAI(localDraft, apiKey, model);
  if (!result.draft) {
    await completeAiReportUsage({
      usageId: reservation.usageId,
      userId: access.userId,
      status: "failed",
      model,
      errorCode: result.errorCode ?? "openai_failed",
    });
    return NextResponse.json(
      { error: "AI 요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  const usageCompleted = await completeAiReportUsage({
    usageId: reservation.usageId,
    userId: access.userId,
    status: "succeeded",
    model,
    promptTokens: result.usage?.input_tokens ?? null,
    completionTokens: result.usage?.output_tokens ?? null,
    totalTokens: result.usage?.total_tokens ?? null,
  });
  return NextResponse.json({
    draft: {
      ...result.draft,
      usageId: usageCompleted ? reservation.usageId : undefined,
    },
  });
}

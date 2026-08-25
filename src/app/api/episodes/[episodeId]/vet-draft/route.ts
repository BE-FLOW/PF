import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { extractResponseOutputText } from "@/lib/openai-response";
import { isUuid, storedReportToHistoryRecord } from "@/lib/report-storage";
import {
  completeFreeAiReportUsage,
  getAiAccessStatusForUser,
  getAiReportAccess,
  getEpisodeSourceRevisionForUser,
  getEpisodeVetReviewBundle,
  getStoredFreeAiReportRequest,
  reserveFreeAiReportUsage,
} from "@/lib/supabase-admin";
import {
  buildVetReviewDraft,
  formatVetReviewDraft,
} from "@/lib/vet-review-report";
import { vetDraftSystemPrompt } from "@/lib/vet-draft-prompt";
import {
  buildVetDraftRequestFingerprint,
  maxVetDraftReportIds,
  normalizeVetDraftReportIds,
  reportIdsFromSearchParams,
  vetDraftIdempotencyKey,
} from "@/lib/vet-draft-request";
import {
  vetDraftGroundingViolation,
  vetDraftSafetyViolation,
} from "@/lib/vet-draft-safety";
import type { VetReviewDraft } from "@/lib/types";

export const runtime = "nodejs";

async function completeUsageWithRetry(
  input: Parameters<typeof completeFreeAiReportUsage>[0],
) {
  if (await completeFreeAiReportUsage(input)) return true;
  await new Promise((resolve) => setTimeout(resolve, 120));
  return completeFreeAiReportUsage(input);
}

interface OpenAiUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

type RequestedReportIds =
  | { ids: string[] }
  | { error: { status: number; error: string } };

async function requestedReportIds(request: Request): Promise<RequestedReportIds> {
  const parsed = await readJsonBody<{ reportIds?: unknown }>(request, 8 * 1024);
  if (!parsed.ok) {
    return { error: { status: parsed.status, error: parsed.error } };
  }
  if (parsed.value.reportIds === undefined) return { ids: [] };
  const reportIds = normalizeVetDraftReportIds(parsed.value.reportIds);
  if (!reportIds) {
    return {
      error: {
        status: 400,
        error: "선택한 기록 범위를 다시 확인해 주세요.",
      },
    };
  }
  return { ids: reportIds };
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
  if (!baseDraft.keyObservations.length) return { draft: baseDraft };
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
        max_output_tokens: 240,
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "petflow_vet_review_selection",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                keyObservationIndexes: {
                  type: "array",
                  items: {
                    type: "integer",
                    minimum: 0,
                    maximum: baseDraft.keyObservations.length - 1,
                  },
                  minItems: 1,
                  maxItems: Math.min(5, baseDraft.keyObservations.length),
                  uniqueItems: true,
                },
              },
              required: ["keyObservationIndexes"],
            },
          },
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: vetDraftSystemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  keyObservations: baseDraft.keyObservations.map(
                    (text, index) => ({ index, text }),
                  ),
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
    const indexes = Array.isArray(generated.keyObservationIndexes)
      ? [
          ...new Set(
            generated.keyObservationIndexes.filter(
              (value): value is number =>
                typeof value === "number" &&
                Number.isSafeInteger(value) &&
                value >= 0 &&
                value < baseDraft.keyObservations.length,
            ),
          ),
        ].slice(0, 5)
      : [];
    const keyObservations = indexes.length
      ? indexes.map((index) => baseDraft.keyObservations[index])
      : baseDraft.keyObservations;
    const draftWithoutCopy: Omit<VetReviewDraft, "copyText"> = {
      ...baseDraft,
      source: "openai",
      keyObservations,
      mediaSummary: baseDraft.mediaSummary,
      planAndProgress: baseDraft.planAndProgress,
      questionsForVet: baseDraft.questionsForVet,
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

function storedDraftResponse(input: {
  draft: VetReviewDraft;
  usageId: string;
  requestId: string;
  reportIds: string[];
  recovered: boolean;
}) {
  return NextResponse.json({
    draft: { ...input.draft, usageId: input.usageId },
    requestId: input.requestId,
    reportIds: input.reportIds,
    recovered: input.recovered,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  const { episodeId } = await context.params;
  if (!isUuid(episodeId)) {
    return NextResponse.json(
      { error: "선택한 기록을 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const access = await getAiReportAccess(accessTokenFromRequest(request));
  if (!access) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawRequestId = url.searchParams.get("requestId")?.trim();
  if (rawRequestId && !isUuid(rawRequestId)) {
    return NextResponse.json(
      { error: "병원 전달본 요청 번호를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const selection = reportIdsFromSearchParams(url.searchParams);
  if ("error" in selection) {
    return NextResponse.json({ error: selection.error }, { status: 400 });
  }
  const sourceRevision = await getEpisodeSourceRevisionForUser(
    access.userId,
    episodeId,
  );
  if (sourceRevision === null) {
    return NextResponse.json(
      { error: "선택한 건강 흐름을 확인하지 못했어요." },
      { status: 404 },
    );
  }
  const stored = await getStoredFreeAiReportRequest({
    userId: access.userId,
    episodeId,
    requestId: rawRequestId?.toLowerCase(),
    sourceRevision,
    selectedReportIds: selection.provided ? selection.ids : undefined,
    succeededOnly: true,
  });
  if (!stored?.draft) {
    return NextResponse.json(
      { error: "저장된 병원 전달본이 아직 없어요." },
      { status: 404 },
    );
  }
  return storedDraftResponse({
    draft: stored.draft,
    usageId: stored.usageId,
    requestId: stored.requestId,
    reportIds: stored.reportIds,
    recovered: true,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  const { episodeId } = await context.params;
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(episodeId)) {
    return NextResponse.json(
      { error: "선택한 기록을 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const access = await getAiReportAccess(accessToken);
  if (!access) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const requestId = vetDraftIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "병원 전달본 요청 번호가 필요해요. 다시 시도해 주세요." },
      { status: 400 },
    );
  }
  const requested = await requestedReportIds(request);
  if ("error" in requested) {
    return NextResponse.json(
      { error: requested.error.error },
      { status: requested.error.status },
    );
  }
  const reportIds = requested.ids;
  const bundle = await getEpisodeVetReviewBundle(accessToken, episodeId);
  if (!bundle) {
    return NextResponse.json(
      { error: "병원 전달본을 만들 권한이나 기록을 확인하지 못했어요." },
      { status: 404 },
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
  if (reports.length > maxVetDraftReportIds) {
    return NextResponse.json(
      {
        error: `병원 전달본은 한 번에 최대 ${maxVetDraftReportIds}개 기록으로 만들 수 있어요. 날짜 범위를 좁혀 주세요.`,
      },
      { status: 400 },
    );
  }

  const includedReportIds = reports.map((report) => report.id).sort();
  const requestFingerprint = buildVetDraftRequestFingerprint(
    episodeId,
    includedReportIds,
    bundle.sourceRevision,
  );
  if (!requestFingerprint) {
    return NextResponse.json(
      { error: "병원 전달본 요청을 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const previous = await getStoredFreeAiReportRequest({
    userId: access.userId,
    episodeId,
    requestId,
    sourceRevision: bundle.sourceRevision,
  });
  if (previous && previous.requestFingerprint !== requestFingerprint) {
    return NextResponse.json(
      { error: "같은 요청 번호를 다른 기록 범위에 사용할 수 없어요." },
      { status: 409 },
    );
  }
  if (previous?.status === "succeeded" && previous.draft) {
    return storedDraftResponse({
      draft: previous.draft,
      usageId: previous.usageId,
      requestId,
      reportIds: previous.reportIds,
      recovered: true,
    });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini-2026-03-17";
  if (!apiKey) {
    return NextResponse.json(
      { error: "병원 전달본을 잠시 만들 수 없어요." },
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
  const reservation = await reserveFreeAiReportUsage({
    userId: access.userId,
    petId: bundle.episode.petId,
    episodeId: bundle.episode.id,
    model,
    requestId,
    requestFingerprint,
    sourceRevision: bundle.sourceRevision,
    reportIds: includedReportIds,
  });

  if (reservation.state === "succeeded" && reservation.usageId && reservation.draft) {
    return storedDraftResponse({
      draft: reservation.draft,
      usageId: reservation.usageId,
      requestId,
      reportIds: includedReportIds,
      recovered: true,
    });
  }
  if (reservation.state === "conflict") {
    return NextResponse.json(
      { error: "같은 요청 번호를 다른 기록 범위에 사용할 수 없어요." },
      { status: 409 },
    );
  }
  if (reservation.state === "pending") {
    return NextResponse.json(
      { error: "병원 전달본을 만들고 있어요. 잠시 후 다시 확인해 주세요." },
      { status: 409, headers: { "Retry-After": "3" } },
    );
  }
  if (reservation.state === "stale_source") {
    return NextResponse.json(
      { error: "기록이 방금 바뀌었어요. 최신 내용으로 다시 확인해 주세요." },
      { status: 409, headers: { "Retry-After": "1" } },
    );
  }
  if (reservation.state === "limit") {
    const latestAccess =
      (await getAiAccessStatusForUser(access.userId)) ?? access.status;
    return NextResponse.json(
      {
        access: latestAccess,
        error:
          "오늘의 AI 병원 전달본 공정사용 한도에 도달했어요. 한국 시간 자정에 다시 사용할 수 있어요.",
      },
      { status: 429 },
    );
  }
  if (reservation.state === "attempt_limit") {
    const latestAccess =
      (await getAiAccessStatusForUser(access.userId)) ?? access.status;
    return NextResponse.json(
      {
        access: latestAccess,
        error:
          "오늘 반복 요청 안전 한도에 도달했어요. 한국 시간 자정에 다시 사용할 수 있어요.",
      },
      { status: 429 },
    );
  }
  if (
    reservation.state !== "reserved" ||
    !reservation.usageId ||
    !reservation.reservationToken
  ) {
    return NextResponse.json(
      {
        access: access.status,
        error: "병원 전달본 이용 가능 횟수를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 },
    );
  }

  const result = await enrichWithOpenAI(localDraft, apiKey, model);
  const safetyViolation = result.draft
    ? vetDraftSafetyViolation(result.draft)
    : null;
  const groundingViolation = result.draft
    ? vetDraftGroundingViolation(result.draft, localDraft)
    : null;
  const generatedFallbackReason = safetyViolation ?? groundingViolation;
  const openAiFallbackReason = result.draft
    ? null
    : (result.errorCode ?? "openai_failed");
  const safeDraft =
    result.draft && !generatedFallbackReason && !openAiFallbackReason
      ? result.draft
      : localDraft;
  const usageCompleted = await completeUsageWithRetry({
    usageId: reservation.usageId,
    userId: access.userId,
    reservationToken: reservation.reservationToken,
    status: "succeeded",
    model,
    promptTokens: result.usage?.input_tokens ?? null,
    completionTokens: result.usage?.output_tokens ?? null,
    totalTokens: result.usage?.total_tokens ?? null,
    errorCode: generatedFallbackReason
      ? `unsafe_generated_fallback_${generatedFallbackReason}`
      : openAiFallbackReason
        ? `openai_unavailable_local_fallback_${openAiFallbackReason}`
        : null,
    draft: safeDraft,
  });
  if (!usageCompleted) {
    return NextResponse.json(
      {
        error:
          "병원 전달본 저장을 마치지 못했어요. 같은 요청으로 다시 시도하면 중복 생성되지 않아요.",
      },
      { status: 503 },
    );
  }
  return storedDraftResponse({
    draft: safeDraft,
    usageId: reservation.usageId,
    requestId,
    reportIds: includedReportIds,
    recovered: false,
  });
}

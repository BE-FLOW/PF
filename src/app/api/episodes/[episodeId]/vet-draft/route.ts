import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { extractResponseOutputText } from "@/lib/openai-response";
import { isUuid, storedReportToHistoryRecord } from "@/lib/report-storage";
import {
  completeAiReportUsage,
  getAiAccessStatusForUser,
  getAiReportAccess,
  getEpisodeVetReviewBundle,
  recordAiReportUsage,
  reserveAiReportUsage,
} from "@/lib/supabase-admin";
import {
  buildVetReviewDraft,
  formatVetReviewDraft,
} from "@/lib/vet-review-report";
import { vetDraftSystemPrompt } from "@/lib/vet-draft-prompt";
import type { VetReviewDraft } from "@/lib/types";

export const runtime = "nodejs";

async function completeUsageWithRetry(
  input: Parameters<typeof completeAiReportUsage>[0],
) {
  if (await completeAiReportUsage(input)) return true;
  await new Promise((resolve) => setTimeout(resolve, 120));
  return completeAiReportUsage(input);
}

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

type RequestedReportIds =
  | { ids: string[] }
  | { error: { status: number; error: string } };

async function requestedReportIds(request: Request): Promise<RequestedReportIds> {
  const parsed = await readJsonBody<{ reportIds?: unknown }>(request, 8 * 1024);
  if (!parsed.ok) {
    return { error: { status: parsed.status, error: parsed.error } };
  }
  if (parsed.value.reportIds === undefined) return { ids: [] };
  const reportIds = parsed.value.reportIds;
  if (
    !Array.isArray(reportIds) ||
    reportIds.length > 60 ||
    !reportIds.every(
      (value): value is string => typeof value === "string" && isUuid(value),
    )
  ) {
    return {
      error: {
        status: 400,
        error: "선택한 기록 범위를 다시 확인해 주세요.",
      },
    };
  }
  return { ids: [...new Set(reportIds)] };
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
                submissionNote: { type: "string" },
              },
              required: [
                "overview",
                "handoffNote",
                "keyObservations",
                "mediaSummary",
                "planAndProgress",
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
                  title: baseDraft.title,
                  overview: baseDraft.overview,
                  handoffNote: baseDraft.handoffNote,
                  keyObservations: baseDraft.keyObservations,
                  timeline: baseDraft.timeline,
                  mediaSummary: baseDraft.mediaSummary,
                  planAndProgress: baseDraft.planAndProgress,
                  missingObservableContext: baseDraft.questionsForVet,
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
      questionsForVet: baseDraft.questionsForVet,
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
    return NextResponse.json(
      { error: "로그인이 필요해요." },
      { status: 401 },
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
  if (!access.status.enabled) {
    const unavailable = access.status.reason === "unavailable";
    return NextResponse.json(
      {
        error: unavailable
          ? "병원 전달본 이용 가능 횟수를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "병원 전달본 1회 이용권이 필요해요.",
        access: access.status,
      },
      { status: unavailable ? 503 : 429 },
    );
  }

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
  const reservation = await reserveAiReportUsage({
    userId: access.userId,
    petId: bundle.episode.petId,
    episodeId: bundle.episode.id,
    model,
  });
  if (!reservation.usageId) {
    const latestAccess =
      (await getAiAccessStatusForUser(access.userId)) ?? access.status;
    return NextResponse.json(
      {
        access: latestAccess,
        error: reservation.unavailable
          ? "병원 전달본 이용 가능 횟수를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "병원 전달본 1회 이용권이 필요해요.",
      },
      { status: reservation.unavailable ? 503 : 429 },
    );
  }

  const result = await enrichWithOpenAI(localDraft, apiKey, model);
  if (!result.draft) {
    await completeUsageWithRetry({
      usageId: reservation.usageId,
      userId: access.userId,
      status: "failed",
      model,
      errorCode: result.errorCode ?? "openai_failed",
    });
    return NextResponse.json(
      { error: "병원 전달본을 만들지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  const usageCompleted = await completeUsageWithRetry({
    usageId: reservation.usageId,
    userId: access.userId,
    status: "succeeded",
    model,
    promptTokens: result.usage?.input_tokens ?? null,
    completionTokens: result.usage?.output_tokens ?? null,
    totalTokens: result.usage?.total_tokens ?? null,
  });
  if (!usageCompleted) {
    return NextResponse.json(
      {
        error:
          "병원 전달본 처리 상태를 확정하지 못했어요. 이용권은 자동으로 복구되니 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({
    draft: {
      ...result.draft,
      usageId: reservation.usageId,
    },
  });
}

import { NextResponse } from "next/server";
import { storedReportToHistoryRecord } from "@/lib/report-storage";
import {
  getAiReportAccess,
  getEpisodeVetReviewBundle,
  recordAiReportUsage,
} from "@/lib/supabase-admin";
import {
  buildVetReviewDraft,
  formatVetReviewDraft,
} from "@/lib/vet-review-report";
import type { VetReviewDraft } from "@/lib/types";

export const runtime = "nodejs";

function accessTokenFrom(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
}

function extractOutputText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const response = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("") || null
  );
}

function cleanStringArray(value: unknown, minItems: number, maxItems: number) {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length >= minItems ? items : null;
}

interface OpenAiUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
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
                  "사용자 친화적 설명보다 수의사 친화적인 문진/검토용 보고서 문체를 우선하세요. " +
                  "입력된 사실만 사용하고 새 의학적 판단을 추가하지 마세요. " +
                  "진단명, 질병 확정, 약물명, 용량, 치료 처방, 치료 계획을 생성하지 마세요. " +
                  "보호자가 입력한 병원 계획과 경과는 수의사 확인 전 정보로 분리하세요. " +
                  "다른 병원에 처음 방문해도 이전 경과를 다시 설명하는 시간을 줄일 수 있게 handoffNote를 작성하세요. " +
                  "보고서는 진료 시간을 줄이기 위한 사전 문진 요약이며, 진단을 대신한다고 쓰지 마세요. 한국어로 짧고 밀도 있게 작성하세요.",
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
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return { errorCode: "openai_response_error" };
    const data = (await response.json()) as { usage?: OpenAiUsage };
    const outputText = extractOutputText(data);
    if (!outputText) return { errorCode: "openai_empty_response" };
    const generated = JSON.parse(outputText) as Record<string, unknown>;
    const overview =
      typeof generated.overview === "string" && generated.overview.trim()
        ? generated.overview.trim()
        : baseDraft.overview;
    const keyObservations =
      cleanStringArray(generated.keyObservations, 2, 5) ??
      baseDraft.keyObservations;
    const handoffNote =
      typeof generated.handoffNote === "string" && generated.handoffNote.trim()
        ? generated.handoffNote.trim()
        : baseDraft.handoffNote;
    const planAndProgress =
      cleanStringArray(generated.planAndProgress, 1, 6) ??
      baseDraft.planAndProgress;
    const questionsForVet =
      cleanStringArray(generated.questionsForVet, 2, 4) ??
      baseDraft.questionsForVet;
    const submissionNote =
      typeof generated.submissionNote === "string" &&
      generated.submissionNote.trim()
        ? generated.submissionNote.trim()
        : baseDraft.submissionNote;
    const draftWithoutCopy: Omit<VetReviewDraft, "copyText"> = {
      ...baseDraft,
      source: "openai",
      overview,
      handoffNote,
      keyObservations,
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
  const access = await getAiReportAccess(accessTokenFrom(request));
  if (!access) {
    return NextResponse.json(
      { error: "로그인 상태를 다시 확인해 주세요." },
      { status: 401 },
    );
  }
  if (!access.status.enabled) {
    return NextResponse.json(
      {
        error: "참여코드를 입력한 테스터만 GPT AI 리포트를 만들 수 있어요.",
        access: access.status,
      },
      { status: 403 },
    );
  }

  const bundle = await getEpisodeVetReviewBundle(
    accessTokenFrom(request),
    episodeId,
  );
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

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  if (!apiKey) {
    await recordAiReportUsage({
      userId: access.userId,
      grantId: access.status.grantId,
      petId: bundle.pet.id,
      episodeId: bundle.episode.id,
      status: "failed",
      model,
      errorCode: "openai_unconfigured",
    });
    return NextResponse.json(
      { error: "GPT API 키가 아직 설정되지 않았어요. 관리자 설정이 필요합니다." },
      { status: 503 },
    );
  }

  const records = bundle.reports.map((report) =>
    storedReportToHistoryRecord(report, bundle.pet),
  );
  const localDraft = buildVetReviewDraft(
    records,
    bundle.pet.name,
    bundle.plan,
    bundle.progress,
  );
  const result = await enrichWithOpenAI(localDraft, apiKey, model);
  if (!result.draft) {
    await recordAiReportUsage({
      userId: access.userId,
      grantId: access.status.grantId,
      petId: bundle.pet.id,
      episodeId: bundle.episode.id,
      status: "failed",
      model,
      errorCode: result.errorCode ?? "openai_failed",
    });
    return NextResponse.json(
      { error: "GPT AI 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  const usageId = await recordAiReportUsage({
    userId: access.userId,
    grantId: access.status.grantId,
    petId: bundle.pet.id,
    episodeId: bundle.episode.id,
    status: "succeeded",
    model,
    promptTokens: result.usage?.input_tokens ?? null,
    completionTokens: result.usage?.output_tokens ?? null,
    totalTokens: result.usage?.total_tokens ?? null,
  });
  return NextResponse.json({
    draft: { ...result.draft, usageId: usageId ?? undefined },
  });
}

import { NextResponse } from "next/server";
import { storedReportToHistoryRecord } from "@/lib/report-storage";
import { getEpisodeVetReviewBundle } from "@/lib/supabase-admin";
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

async function enrichWithOpenAI(
  baseDraft: VetReviewDraft,
): Promise<VetReviewDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return baseDraft;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
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
                  "당신은 보호자 관찰 기록을 수의사가 빠르게 검토할 수 있게 정리하는 보조자입니다. " +
                  "입력된 사실만 사용하고 새 의학적 판단을 추가하지 마세요. " +
                  "진단명, 질병 확정, 약물명, 용량, 치료 처방, 치료 계획을 생성하지 마세요. " +
                  "보호자가 입력한 병원 계획과 경과는 수의사 확인 전 정보로 분리해 한국어로 짧게 작성하세요.",
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

    if (!response.ok) return baseDraft;
    const outputText = extractOutputText(await response.json());
    if (!outputText) return baseDraft;
    const generated = JSON.parse(outputText) as Record<string, unknown>;
    const overview =
      typeof generated.overview === "string" && generated.overview.trim()
        ? generated.overview.trim()
        : baseDraft.overview;
    const keyObservations =
      cleanStringArray(generated.keyObservations, 2, 5) ??
      baseDraft.keyObservations;
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
      keyObservations,
      planAndProgress,
      questionsForVet,
      submissionNote,
    };
    return {
      ...draftWithoutCopy,
      copyText: formatVetReviewDraft(draftWithoutCopy),
    };
  } catch {
    return baseDraft;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ episodeId: string }> },
) {
  const { episodeId } = await context.params;
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

  const records = bundle.reports.map((report) =>
    storedReportToHistoryRecord(report, bundle.pet),
  );
  const localDraft = buildVetReviewDraft(
    records,
    bundle.pet.name,
    bundle.plan,
    bundle.progress,
  );
  const draft = await enrichWithOpenAI(localDraft);
  return NextResponse.json({ draft });
}

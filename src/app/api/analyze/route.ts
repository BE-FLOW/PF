import { NextResponse } from "next/server";
import { analyzeLocally, isHealthCheckInput } from "@/lib/analysis";
import { getReportOwner, saveHealthReport } from "@/lib/supabase-admin";
import type { AnalysisResult, HealthCheckInput } from "@/lib/types";

export const runtime = "nodejs";

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

async function enrichWithOpenAI(
  input: HealthCheckInput,
  localResult: AnalysisResult,
): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return localResult;

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
            name: "pet_health_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                headline: { type: "string" },
                summary: { type: "string" },
                observations: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 4,
                },
                actions: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 2,
                  maxItems: 4,
                },
                vetBrief: { type: "string" },
              },
              required: [
                "headline",
                "summary",
                "observations",
                "actions",
                "vetBrief",
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
                  "당신은 반려동물 보호자가 오늘 입력한 관찰을 바로 이해하기 쉽게 정리하는 보조자입니다. " +
                  "사용자에게 당연한 말을 반복하지 말고, 입력에서 실제로 달라진 점과 다음 확인 행동을 짧게 구분해 주세요. " +
                  "진단, 질병 확정, 약물명, 용량, 치료 처방, 치료 계획을 제공하지 마세요. " +
                  "입력된 사실만 사용하고 불확실성을 명확히 표현하세요. 위험 단계와 점수는 앱이 이미 결정했으므로 바꾸지 마세요. " +
                  "vetBrief는 병원에 보여줄 수 있게 사실 중심으로 간결하게 쓰고, 나머지는 보호자 친화적인 한국어로 작성하세요.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  input,
                  riskLevel: localResult.riskLevel,
                  riskScore: localResult.riskScore,
                }),
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return localResult;
    const data: unknown = await response.json();
    const outputText = extractOutputText(data);
    if (!outputText) return localResult;
    const generated = JSON.parse(outputText) as Pick<
      AnalysisResult,
      "headline" | "summary" | "observations" | "actions" | "vetBrief"
    >;
    return { ...localResult, ...generated, source: "openai" };
  } catch {
    return localResult;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (!isHealthCheckInput(body)) {
    return NextResponse.json(
      { error: "입력값을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const localResult = analyzeLocally(body);
  const result = await enrichWithOpenAI(body, localResult);
  const clientId = request.headers.get("x-petflow-client-id");
  const isTest = request.headers.get("x-petflow-test") === "true";
  const authorization = request.headers.get("authorization");
  const owner = await getReportOwner(
    authorization?.startsWith("Bearer ") ? authorization.slice(7) : null,
    request.headers.get("x-petflow-pet-id"),
  );
  const saved = await saveHealthReport(body, result, clientId, isTest, owner ?? {});

  return NextResponse.json({
    ...result,
    storage: saved.saved ? "remote" : "local",
    episodeId: saved.episodeId,
  });
}

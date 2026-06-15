import type {
  HealthFlowSummary,
  HistoryRecord,
  RiskLevel,
  SymptomId,
} from "./types";
import { symptomLabels } from "./analysis";

const riskWeight: Record<RiskLevel, number> = {
  watch: 1,
  soon: 2,
  urgent: 3,
};

export function summarizeHealthFlow(
  records: HistoryRecord[],
  petName = "반려동물",
  now = new Date(),
): HealthFlowSummary {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 14);
  const recent = records
    .filter((record) => new Date(record.result.createdAt) >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.result.createdAt).getTime() -
        new Date(a.result.createdAt).getTime(),
    );

  if (!recent.length) {
    return {
      trend: "stable",
      headline: "아직 건강 흐름을 만들 기록이 없어요",
      description: "오늘 상태를 기록하면 작은 변화가 쌓이기 시작해요.",
      recordCount: 0,
      repeatedSymptoms: [],
      highestRisk: null,
      latestRecordedAt: null,
      vetBrief: `${petName}의 최근 14일 건강 기록이 아직 없습니다.`,
    };
  }

  const symptomCounts = new Map<SymptomId, number>();
  for (const record of recent) {
    for (const symptom of record.input.symptoms) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }
  const repeatedSymptoms = [...symptomCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([symptom, count]) => `${symptomLabels[symptom]} ${count}회`)
    .slice(0, 3);

  const highestRisk = recent.reduce<RiskLevel>(
    (highest, record) =>
      riskWeight[record.result.riskLevel] > riskWeight[highest]
        ? record.result.riskLevel
        : highest,
    "watch",
  );
  const latestScores = recent.slice(0, 3).map((record) => record.result.riskScore);
  const olderScores = recent.slice(3, 6).map((record) => record.result.riskScore);
  const average = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
  const scoreRise = olderScores.length
    ? average(latestScores) - average(olderScores)
    : 0;
  const worsening = highestRisk === "urgent" || scoreRise >= 15;
  const needsWatch =
    !worsening &&
    (highestRisk === "soon" ||
      repeatedSymptoms.length > 0 ||
      recent.some(
        (record) =>
          record.input.appetite !== "normal" || record.input.energy !== "normal",
      ));
  const trend = worsening ? "worsening" : needsWatch ? "watch" : "stable";

  const copy =
    trend === "worsening"
      ? {
          headline: "최근 기록에서 더 주의할 변화가 보여요",
          description: "최근 점수 상승이나 위험 신호가 있어 병원 상담 시 흐름을 함께 보여주세요.",
        }
      : trend === "watch"
        ? {
            headline: "반복되는 변화를 조금 더 지켜봐 주세요",
            description: "같은 증상이나 컨디션 변화가 이어지는지 같은 기준으로 기록해 주세요.",
          }
        : {
            headline: "최근 기록은 비교적 안정적인 흐름이에요",
            description: "뚜렷한 반복 변화는 보이지 않아요. 지금처럼 간단히 이어서 기록해 주세요.",
          };
  const abnormalConditionCount = recent.filter(
    (record) =>
      record.input.appetite !== "normal" || record.input.energy !== "normal",
  ).length;
  const vetBrief = [
    `${petName} 최근 14일 건강 흐름`,
    `기록 ${recent.length}회`,
    `가장 높은 단계: ${highestRisk === "urgent" ? "즉시 상담" : highestRisk === "soon" ? "진료 권장" : "관찰"}`,
    repeatedSymptoms.length
      ? `반복 기록: ${repeatedSymptoms.join(", ")}`
      : "반복된 주요 증상 없음",
    `식욕 또는 활력 변화 ${abnormalConditionCount}회`,
  ].join("\n");

  return {
    trend,
    ...copy,
    recordCount: recent.length,
    repeatedSymptoms,
    highestRisk,
    latestRecordedAt: recent[0].result.createdAt,
    vetBrief,
  };
}

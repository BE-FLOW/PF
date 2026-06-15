import {
  ageGroupLabels,
  durationLabels,
  levelLabels,
  symptomLabels,
} from "./analysis";
import type { HistoryRecord, RiskLevel, SymptomId } from "./types";

const riskLabels: Record<RiskLevel, string> = {
  watch: "관찰",
  soon: "진료 권장",
  urgent: "즉시 상담",
};

const riskWeight: Record<RiskLevel, number> = {
  watch: 1,
  soon: 2,
  urgent: 3,
};

const dayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export interface EpisodeReportTimelineItem {
  id: string;
  recordedAt: string;
  dateLabel: string;
  symptoms: string;
  appetite: string;
  energy: string;
  duration: string;
  riskLabel: string;
  redFlagCount: number;
}

export interface EpisodeReport {
  title: string;
  petProfile: string;
  periodLabel: string;
  recordCount: number;
  highestRiskLabel: string;
  repeatedSymptoms: string[];
  appetiteChangeCount: number;
  energyChangeCount: number;
  timeline: EpisodeReportTimelineItem[];
  shareText: string;
  disclaimer: string;
}

export function buildEpisodeReport(
  records: HistoryRecord[],
  fallbackPetName = "반려동물",
): EpisodeReport {
  const ordered = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
  const first = ordered[0];
  const latest = ordered.at(-1);
  const petName = latest?.input.petName || fallbackPetName;
  const petProfile = latest
    ? [
        latest.input.species === "dog"
          ? "강아지"
          : latest.input.species === "cat"
            ? "고양이"
            : "기타",
        latest.input.breed,
        ageGroupLabels[latest.input.ageGroup],
        latest.input.weight,
      ]
        .filter(Boolean)
        .join(" · ")
    : "프로필 정보 없음";
  const periodLabel = first && latest
    ? dayFormatter.format(new Date(first.result.createdAt)) ===
      dayFormatter.format(new Date(latest.result.createdAt))
      ? dayFormatter.format(new Date(first.result.createdAt))
      : `${dayFormatter.format(new Date(first.result.createdAt))} ~ ${dayFormatter.format(new Date(latest.result.createdAt))}`
    : "기록 없음";

  const symptomCounts = new Map<SymptomId, number>();
  for (const record of ordered) {
    for (const symptom of record.input.symptoms) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }
  const repeatedSymptoms = [...symptomCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([symptom, count]) => `${symptomLabels[symptom]} ${count}회`)
    .slice(0, 3);
  const highestRisk = ordered.reduce<RiskLevel>(
    (highest, record) =>
      riskWeight[record.result.riskLevel] > riskWeight[highest]
        ? record.result.riskLevel
        : highest,
    "watch",
  );
  const appetiteChangeCount = ordered.filter(
    (record) => record.input.appetite !== "normal",
  ).length;
  const energyChangeCount = ordered.filter(
    (record) => record.input.energy !== "normal",
  ).length;
  const timeline = ordered.map<EpisodeReportTimelineItem>((record) => ({
    id: record.result.id,
    recordedAt: record.result.createdAt,
    dateLabel: dateTimeFormatter.format(new Date(record.result.createdAt)),
    symptoms: record.input.symptoms.length
      ? record.input.symptoms.map((symptom) => symptomLabels[symptom]).join(", ")
      : "선택한 주요 증상 없음",
    appetite: levelLabels[record.input.appetite],
    energy: levelLabels[record.input.energy],
    duration: durationLabels[record.input.duration],
    riskLabel: riskLabels[record.result.riskLevel],
    redFlagCount: record.input.redFlags.length,
  }));
  const disclaimer =
    "이 요약은 보호자가 입력한 관찰과 앱의 안전 분류를 정리한 자료이며, 수의사의 진단이나 확인된 진료기록이 아닙니다.";
  const timelineText = timeline.length
    ? timeline
        .map(
          (item, index) =>
            `${index + 1}. ${item.dateLabel}\n증상: ${item.symptoms}\n식욕: ${item.appetite} / 활력: ${item.energy}\n지속 기간: ${item.duration} / 앱 안내: ${item.riskLabel}${item.redFlagCount ? ` / 위험 신호 ${item.redFlagCount}개 입력` : ""}`,
        )
        .join("\n\n")
    : "기록 없음";
  const shareText = [
    "[PetFlow 병원 전달 요약]",
    `반려동물: ${petName} / ${petProfile}`,
    `기록 기간: ${periodLabel}`,
    `기록 횟수: ${timeline.length}회`,
    `가장 높은 앱 안내 단계: ${riskLabels[highestRisk]}`,
    `반복 관찰: ${repeatedSymptoms.length ? repeatedSymptoms.join(", ") : "없음"}`,
    `식욕 변화 ${appetiteChangeCount}회 / 활력 변화 ${energyChangeCount}회`,
    "",
    "[보호자 관찰 기록]",
    timelineText,
    "",
    "[확인 안내]",
    disclaimer,
  ].join("\n");

  return {
    title: `${petName} 병원 전달 요약`,
    petProfile,
    periodLabel,
    recordCount: timeline.length,
    highestRiskLabel: riskLabels[highestRisk],
    repeatedSymptoms,
    appetiteChangeCount,
    energyChangeCount,
    timeline,
    shareText,
    disclaimer,
  };
}

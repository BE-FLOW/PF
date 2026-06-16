import {
  durationLabels,
  levelLabels,
  symptomLabels,
} from "./analysis";
import { buildEpisodeReport } from "./episode-report";
import type {
  EpisodePlan,
  EpisodeProgress,
  HistoryRecord,
  RiskLevel,
  VetReviewDraft,
} from "./types";

const riskLabels: Record<RiskLevel, string> = {
  watch: "관찰",
  soon: "진료 권장",
  urgent: "즉시 상담",
};

const conditionChangeLabels: Record<
  EpisodeProgress["conditionChange"],
  string
> = {
  better: "좋아짐",
  same: "비슷함",
  worse: "나빠짐",
};

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function sortRecords(records: HistoryRecord[]) {
  return [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
}

export function formatVetReviewDraft(
  draft: Omit<VetReviewDraft, "copyText">,
) {
  return [
    `[PetFlow 수의사 검토용 보고서 초안]`,
    draft.title,
    `생성 시각: ${dateTimeFormatter.format(new Date(draft.generatedAt))}`,
    `상태: AI/앱 정리 초안 · 수의사 확인 전`,
    "",
    "[요약]",
    draft.overview,
    "",
    "[핵심 관찰]",
    ...draft.keyObservations.map((item) => `- ${item}`),
    "",
    "[시간순 기록]",
    ...draft.timeline.map((item) => `- ${item}`),
    "",
    "[병원 계획과 3일·7일·14일 경과]",
    ...draft.planAndProgress.map((item) => `- ${item}`),
    "",
    "[수의사에게 확인할 질문]",
    ...draft.questionsForVet.map((item) => `- ${item}`),
    "",
    "[제출 메모]",
    draft.submissionNote,
    "",
    "[주의]",
    draft.disclaimer,
  ].join("\n");
}

export function buildVetReviewDraft(
  records: HistoryRecord[],
  petName = "반려동물",
  plan?: EpisodePlan,
  progress: EpisodeProgress[] = [],
  options: {
    generatedAt?: string;
    source?: VetReviewDraft["source"];
  } = {},
): VetReviewDraft {
  const ordered = sortRecords(records);
  const report = buildEpisodeReport(ordered, petName, plan, progress);
  const latest = ordered.at(-1);
  const repeatedLine = report.repeatedSymptoms.length
    ? `반복 관찰: ${report.repeatedSymptoms.join(", ")}`
    : "반복 관찰: 아직 뚜렷한 반복 기록 없음";
  const redFlagCount = ordered.reduce(
    (total, record) => total + record.input.redFlags.length,
    0,
  );
  const timeline = ordered.length
    ? ordered.map((record) => {
        const symptoms = record.input.symptoms.length
          ? record.input.symptoms
              .map((symptom) => symptomLabels[symptom])
              .join(", ")
          : "선택한 주요 증상 없음";
        return [
          dateTimeFormatter.format(new Date(record.result.createdAt)),
          `증상 ${symptoms}`,
          `식욕 ${levelLabels[record.input.appetite]}`,
          `활력 ${levelLabels[record.input.energy]}`,
          `기간 ${durationLabels[record.input.duration]}`,
          `CHECK SCORE ${record.result.riskScore}`,
          `앱 안내 ${riskLabels[record.result.riskLevel]}`,
        ].join(" · ");
      })
    : ["아직 연결된 관찰 기록이 없습니다."];
  const planLines = plan?.tasks.length
    ? plan.tasks.map(
        (task) =>
          `보호자 기록 병원 계획: ${task.completedAt ? "완료" : "진행 중"} · ${task.text}`,
      )
    : ["보호자가 입력한 병원 계획은 아직 없습니다."];
  const progressLines = progress.length
    ? [...progress]
        .sort((a, b) => a.followUpDay - b.followUpDay)
        .map(
          (item) =>
            `${item.followUpDay}일 경과: ${conditionChangeLabels[item.conditionChange]} · 식욕 ${levelLabels[item.appetite]} · 활력 ${levelLabels[item.energy]} · 보호자 기록/확인 전`,
        )
    : ["3일·7일·14일 경과 기록은 아직 없습니다."];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const draftWithoutCopy: Omit<VetReviewDraft, "copyText"> = {
    title: `${latest?.input.petName || petName} 수의사 검토용 보고서 초안`,
    generatedAt,
    source: options.source ?? "local",
    reviewStatus: "unreviewed",
    overview:
      `${report.periodLabel} 동안 보호자 관찰 ${report.recordCount}회를 묶어 정리했습니다. ` +
      `가장 높은 앱 안내는 ${report.highestRiskLabel}이며, 이 문서는 수의사 검토 전 초안입니다.`,
    keyObservations: [
      repeatedLine,
      `식욕 변화 ${report.appetiteChangeCount}회 · 활력 변화 ${report.energyChangeCount}회`,
      redFlagCount
        ? `위험 신호 입력 ${redFlagCount}회가 있어 병원에 먼저 공유가 필요합니다.`
        : "입력된 위험 신호는 없습니다.",
      latest
        ? `가장 최근 CHECK SCORE는 ${latest.result.riskScore}점입니다.`
        : "아직 CHECK SCORE 기록이 없습니다.",
    ],
    timeline,
    planAndProgress: [...planLines, ...progressLines],
    questionsForVet: [
      "이 변화가 재진 또는 추가 확인이 필요한 흐름인지 확인해 주세요.",
      "다음 상담 전 보호자가 계속 기록해야 할 항목이 무엇인지 알려주세요.",
      "3일·7일·14일 경과 중 특히 주의해서 볼 변화가 있는지 확인해 주세요.",
    ],
    submissionNote:
      "보호자가 입력한 관찰과 병원 계획, 경과 기록을 제출용으로 정리한 초안입니다. 병원에서 확인한 내용은 별도로 구분해 주세요.",
    disclaimer:
      "이 초안은 진단, 처방, 약물명, 용량, 치료 계획을 생성하지 않으며 수의사의 확인된 진료기록을 대신하지 않습니다.",
  };
  return {
    ...draftWithoutCopy,
    copyText: formatVetReviewDraft(draftWithoutCopy),
  };
}

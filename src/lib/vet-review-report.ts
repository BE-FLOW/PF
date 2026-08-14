import {
  durationLabels,
  formatSymptomSummary,
  levelLabels,
  selectedSymptomDetailLabels,
  symptomDetailQuestions,
  symptomLabels,
} from "./analysis";
import { buildEpisodeReport } from "./episode-report";
import { formatReportMediaSummary } from "./report-media";
import type {
  EpisodePlan,
  EpisodeProgress,
  HistoryRecord,
  VetReviewDraft,
} from "./types";

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
    `[PetFlow 병원 전달본]`,
    draft.title,
    `생성 시각: ${dateTimeFormatter.format(new Date(draft.generatedAt))}`,
    `상태: AI 정리 · 수의사 확인 전`,
    "",
    "[요약]",
    draft.overview,
    "",
    "[다른 병원 첫 설명]",
    draft.handoffNote,
    "",
    "[핵심 관찰]",
    ...draft.keyObservations.map((item) => `- ${item}`),
    "",
    "[시간순 기록]",
    ...draft.timeline.map((item) => `- ${item}`),
    "",
    "[첨부 자료]",
    ...draft.mediaSummary.map((item) => `- ${item}`),
    "",
    "[병원에서 들은 내용 · 보호자 기록]",
    ...draft.planAndProgress.map((item) => `- ${item}`),
    ...(draft.questionsForVet.length
      ? [
          "",
          "[추가로 확인하면 좋은 사실]",
          ...draft.questionsForVet.map((item) => `- ${item}`),
        ]
      : []),
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
    episodeStartedAt?: string;
  } = {},
): VetReviewDraft {
  const ordered = sortRecords(records);
  const report = buildEpisodeReport(
    ordered,
    petName,
    plan,
    progress,
    options.episodeStartedAt,
  );
  const latest = ordered.at(-1);
  const repeatedLine = report.repeatedSymptoms.length
    ? `반복 관찰: ${report.repeatedSymptoms.join(", ")}`
    : "반복 관찰: 아직 뚜렷한 반복 기록 없음";
  const latestSymptomSummary = latest?.input.symptoms.length
    ? formatSymptomSummary(latest.input)
    : "선택한 주요 증상 없음";
  const latestOwnerNote = latest?.input.note.trim() || "입력한 메모 없음";
  const missingIntakeQuestions = [
    ...new Set(ordered.flatMap((record) => record.input.symptoms)),
  ]
    .filter((symptom) =>
      ordered
        .filter((record) => record.input.symptoms.includes(symptom))
        .every(
          (record) => selectedSymptomDetailLabels(record.input, symptom).length === 0,
        ),
    )
    .map(
      (symptom) =>
        `${symptomLabels[symptom]}: ${symptomDetailQuestions[symptom].reportPrompt}`,
    )
    .slice(0, 2);
  const timeline = ordered.length
    ? ordered.map((record) => {
        const symptoms = record.input.symptoms.length
          ? formatSymptomSummary(record.input)
          : "선택한 주요 증상 없음";
        const mediaLabel = formatReportMediaSummary(record.media ?? []);
        return [
          dateTimeFormatter.format(new Date(record.result.createdAt)),
          record.input.note.trim()
            ? `보호자 메모 ${record.input.note.trim()}`
            : "",
          `증상 ${symptoms}`,
          `식욕 ${levelLabels[record.input.appetite]}`,
          `활력 ${levelLabels[record.input.energy]}`,
          `기간 ${durationLabels[record.input.duration]}`,
          mediaLabel ? `첨부 ${mediaLabel}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
      })
    : ["아직 연결된 관찰 기록이 없습니다."];
  const mediaSummary = report.mediaSummary.length
    ? [
        ...report.mediaSummary,
        "첨부 자료는 보호자가 저장한 참고 파일이며, 이 초안은 이미지·영상 내용을 판독하지 않았습니다.",
      ]
    : ["첨부 사진·영상 없음"];
  const planLines = plan?.tasks.length
    ? plan.tasks.map(
        (task) => `보호자가 옮긴 병원 안내: ${task.text}`,
      )
    : ["보호자가 옮긴 병원 안내 없음"];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const draftWithoutCopy: Omit<VetReviewDraft, "copyText"> = {
    title: `${latest?.input.petName || petName} 병원 전달본`,
    generatedAt,
    source: options.source ?? "local",
    reviewStatus: "unreviewed",
    overview:
      `${report.periodLabel} 동안 보호자가 남긴 관찰 ${report.recordCount}회를 시간순으로 정리했습니다. ` +
      "이 문서는 수의사 확인 전 초안입니다.",
    handoffNote:
      `다른 병원에서도 바로 확인할 수 있도록 ${report.periodLabel}의 관찰 ${report.recordCount}회 중 ` +
      `가장 최근 보호자 메모는 ` +
      `"${latestOwnerNote}"이며, 최근 선택 증상은 ${latestSymptomSummary}입니다. ` +
      "병원 안내는 보호자가 옮겨 적은 정보로 구분했습니다.",
    keyObservations: [
      `가장 최근 보호자 메모: ${latestOwnerNote}`,
      repeatedLine,
      `가장 최근 증상 상세: ${latestSymptomSummary}`,
      `식욕 변화 ${report.appetiteChangeCount}회 · 활력 변화 ${report.energyChangeCount}회`,
      report.mediaCount
        ? `첨부 자료 ${report.mediaCount}개가 있으며 사진·영상 내용은 판독 전입니다.`
        : "첨부 사진·영상은 없습니다.",
    ],
    timeline,
    mediaSummary,
    planAndProgress: planLines,
    questionsForVet: missingIntakeQuestions,
    submissionNote:
      "보호자가 입력한 관찰과 직접 옮긴 병원 안내를 정리한 초안입니다. 병원에서 확인한 내용과 보호자 관찰을 구분해 검토해 주세요.",
    disclaimer:
      "이 초안은 진단, 처방, 약물명, 용량, 치료 계획을 생성하지 않으며 수의사의 확인된 진료기록을 대신하지 않습니다.",
  };
  return {
    ...draftWithoutCopy,
    copyText: formatVetReviewDraft(draftWithoutCopy),
  };
}

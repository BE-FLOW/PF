import {
  ageGroupLabels,
  durationLabels,
  levelLabels,
  symptomLabels,
} from "./analysis";
import { countReportMedia, formatReportMediaCount } from "./report-media";
import type {
  EpisodePlan,
  EpisodeProgress,
  FollowUpDay,
  HistoryRecord,
  Level,
  RiskLevel,
  SymptomId,
} from "./types";

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

const conditionChangeLabels: Record<
  EpisodeProgress["conditionChange"],
  string
> = {
  better: "좋아짐",
  same: "비슷함",
  worse: "나빠짐",
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

const followUpDays: FollowUpDay[] = [3, 7, 14, 30, 60, 90];
const followUpUpperBounds = [5, 11, 22, 45, 75, Number.POSITIVE_INFINITY];
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const koreaOffsetMilliseconds = 9 * 60 * 60 * 1000;

export interface EpisodeFollowUpCheckpoint {
  followUpDay: FollowUpDay;
  targetAt: string;
  recordedAt?: string;
  recordId?: string;
  source?: "health-record" | "manual";
  conditionChange?: EpisodeProgress["conditionChange"];
  appetite?: Level;
  energy?: Level;
}

function koreaCalendarDay(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? Math.floor((timestamp + koreaOffsetMilliseconds) / millisecondsPerDay)
    : null;
}

function followUpDayForElapsedDays(elapsedDays: number): FollowUpDay | null {
  if (elapsedDays < 1) return null;
  const index = followUpUpperBounds.findIndex((upperBound) => elapsedDays < upperBound);
  return followUpDays[index] ?? null;
}

export function buildEpisodeFollowUpCheckpoints(
  records: HistoryRecord[],
  startedAt?: string,
  progress: EpisodeProgress[] = [],
): EpisodeFollowUpCheckpoint[] {
  const orderedRecords = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
  const referenceAt = startedAt ?? orderedRecords[0]?.result.createdAt;
  const referenceDay = referenceAt ? koreaCalendarDay(referenceAt) : null;
  const referenceTimestamp = referenceAt ? new Date(referenceAt).getTime() : Number.NaN;
  const recordsByCheckpoint = new Map<FollowUpDay, HistoryRecord>();

  if (referenceDay !== null) {
    for (const record of orderedRecords) {
      const recordDay = koreaCalendarDay(record.result.createdAt);
      if (recordDay === null) continue;
      const elapsedDays = recordDay - referenceDay;
      const checkpointDay = followUpDayForElapsedDays(elapsedDays);
      if (!checkpointDay) continue;

      const current = recordsByCheckpoint.get(checkpointDay);
      if (!current) {
        recordsByCheckpoint.set(checkpointDay, record);
        continue;
      }
      const currentDay = koreaCalendarDay(current.result.createdAt);
      if (currentDay === null) continue;
      const currentDistance = Math.abs(currentDay - referenceDay - checkpointDay);
      const nextDistance = Math.abs(elapsedDays - checkpointDay);
      if (
        nextDistance < currentDistance ||
        (nextDistance === currentDistance &&
          new Date(record.result.createdAt).getTime() >
            new Date(current.result.createdAt).getTime())
      ) {
        recordsByCheckpoint.set(checkpointDay, record);
      }
    }
  }

  const progressByCheckpoint = new Map(
    progress.map((item) => [item.followUpDay, item] as const),
  );

  return followUpDays.map((followUpDay) => {
    const record = recordsByCheckpoint.get(followUpDay);
    const manual = progressByCheckpoint.get(followUpDay);
    return {
      followUpDay,
      targetAt: Number.isFinite(referenceTimestamp)
        ? new Date(referenceTimestamp + followUpDay * millisecondsPerDay).toISOString()
        : "",
      recordedAt: manual?.recordedAt ?? record?.result.createdAt,
      recordId: manual ? undefined : record?.result.id,
      source: manual ? "manual" : record ? "health-record" : undefined,
      conditionChange: manual?.conditionChange,
      appetite: manual?.appetite ?? record?.input.appetite,
      energy: manual?.energy ?? record?.input.energy,
    };
  });
}

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
  imageCount: number;
  videoCount: number;
  mediaCount: number;
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
  mediaCount: number;
  mediaSummary: string[];
  timeline: EpisodeReportTimelineItem[];
  planTasks: EpisodePlan["tasks"];
  progress: EpisodeProgress[];
  followUpCheckpoints: EpisodeFollowUpCheckpoint[];
  shareText: string;
  disclaimer: string;
}

export function buildEpisodeReport(
  records: HistoryRecord[],
  fallbackPetName = "반려동물",
  plan?: EpisodePlan,
  progress: EpisodeProgress[] = [],
  episodeStartedAt?: string,
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
  const timeline = ordered.map<EpisodeReportTimelineItem>((record) => {
    const counts = countReportMedia(record.media ?? []);
    return {
      id: record.result.id,
      recordedAt: record.result.createdAt,
      dateLabel: dateTimeFormatter.format(new Date(record.result.createdAt)),
      symptoms: record.input.symptoms.length
        ? record.input.symptoms
            .map((symptom) => symptomLabels[symptom])
            .join(", ")
        : "선택한 주요 증상 없음",
      appetite: levelLabels[record.input.appetite],
      energy: levelLabels[record.input.energy],
      duration: durationLabels[record.input.duration],
      riskLabel: riskLabels[record.result.riskLevel],
      redFlagCount: record.input.redFlags.length,
      ...counts,
    };
  });
  const mediaSummary = timeline
    .filter((item) => item.mediaCount > 0)
    .map(
      (item) =>
        `${item.dateLabel}: ${formatReportMediaCount(item.imageCount, item.videoCount)}`,
    );
  const mediaCount = timeline.reduce((total, item) => total + item.mediaCount, 0);
  const disclaimer =
    "이 요약은 보호자가 입력한 관찰과 앱의 안전 분류를 정리한 자료이며, 수의사의 진단이나 확인된 진료기록이 아닙니다.";
  const timelineText = timeline.length
    ? timeline
        .map(
          (item, index) =>
            `${index + 1}. ${item.dateLabel}\n증상: ${item.symptoms}\n식욕: ${item.appetite} / 활력: ${item.energy}\n지속 기간: ${item.duration} / 앱 안내: ${item.riskLabel}${item.redFlagCount ? ` / 위험 신호 ${item.redFlagCount}개 입력` : ""}${item.mediaCount ? `\n첨부: ${formatReportMediaCount(item.imageCount, item.videoCount)}` : ""}`,
        )
        .join("\n\n")
    : "기록 없음";
  const planText = plan?.tasks.length
    ? plan.tasks
        .map(
          (task) =>
            `- [${task.completedAt ? "완료" : "진행 전"}] ${task.text}`,
        )
        .join("\n")
    : "아직 입력한 계획이 없습니다.";
  const orderedProgress = [...progress].sort(
    (a, b) => a.followUpDay - b.followUpDay,
  );
  const followUpCheckpoints = buildEpisodeFollowUpCheckpoints(
    ordered,
    episodeStartedAt,
    orderedProgress,
  );
  const completedFollowUps = followUpCheckpoints.filter(
    (checkpoint) => checkpoint.recordedAt,
  );
  const progressText = completedFollowUps.length
    ? completedFollowUps
        .map((checkpoint) => {
          if (checkpoint.conditionChange) {
            return `${checkpoint.followUpDay}일: ${conditionChangeLabels[checkpoint.conditionChange]} / 식욕 ${levelLabels[checkpoint.appetite ?? "normal"]} / 활력 ${levelLabels[checkpoint.energy ?? "normal"]}`;
          }
          const source = checkpoint.source === "health-record"
            ? `${dayFormatter.format(new Date(checkpoint.recordedAt!))} 건강 기록 자동 연결 / `
            : "";
          return `${checkpoint.followUpDay}일 전후: ${source}식욕 ${levelLabels[checkpoint.appetite ?? "normal"]} / 활력 ${levelLabels[checkpoint.energy ?? "normal"]}`;
        })
        .join("\n")
    : "자동 연결된 경과 기록이 아직 없습니다.";
  const mediaText = mediaSummary.length
    ? [
        ...mediaSummary,
        "사진·영상은 보호자가 저장한 참고 자료이며 PetFlow가 내용을 판독하지 않았습니다.",
      ].join("\n")
    : "첨부 자료 없음";
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
    "[첨부 자료 · 보호자 저장]",
    mediaText,
    "",
    "[병원에서 받은 계획 · 보호자 기록]",
    planText,
    "PetFlow에서 수의사가 직접 확인한 내용이 아닙니다.",
    "",
    "[초기·장기 경과 · 보호자 기록]",
    progressText,
    "PetFlow에서 수의사가 확인한 경과가 아닙니다.",
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
    mediaCount,
    mediaSummary,
    timeline,
    planTasks: plan?.tasks ?? [],
    progress: orderedProgress,
    followUpCheckpoints,
    shareText,
    disclaimer,
  };
}

import type { AiAccessStatus } from "./health";

export function isDailyAiLimitReached(access: AiAccessStatus | null) {
  return (
    access?.reason === "daily_limit" ||
    access?.reason === "attempt_limit" ||
    access?.reason === "no_credits"
  );
}

export function aiResetCopy(access: AiAccessStatus) {
  if (!access.resetsAt) {
    return "다음 초기화 시점은 서버 연결 후 표시돼요.";
  }
  const resetsAt = new Date(access.resetsAt);
  if (Number.isNaN(resetsAt.getTime())) {
    return "다음 초기화 시점은 서버 연결 후 표시돼요.";
  }
  const label = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(resetsAt);
  return `${label}에 한도가 초기화돼요.`;
}

export function aiAccessCopy(access: AiAccessStatus | null) {
  if (!access) {
    return "오늘의 무료 AI 정리 한도를 확인하고 있어요.";
  }
  if (!access.freeRelease || access.reason === "unavailable") {
    return "무료 AI 정리 한도를 확인하지 못했어요. 기본 사실 전달본은 계속 공유할 수 있어요.";
  }
  if (isDailyAiLimitReached(access)) {
    if (access.reason === "attempt_limit") {
      return `오늘 반복 요청 안전 한도에 도달했어요. ${aiResetCopy(access)} 기본 사실 전달본은 계속 공유할 수 있어요.`;
    }
    return `오늘의 무료 AI 정리 ${access.dailyLimit}회를 모두 사용했어요. ${aiResetCopy(access)} 기본 사실 전달본은 계속 공유할 수 있어요.`;
  }
  return `무료 AI 정리는 하루 ${access.dailyLimit}회까지 사용할 수 있어요. 오늘 ${access.availableCredits}회 남았어요.`;
}

export function aiDraftDailyLabel(access: AiAccessStatus | null) {
  if (!access) return "확인 중";
  return `오늘 ${access.availableCredits}/${access.dailyLimit}회`;
}

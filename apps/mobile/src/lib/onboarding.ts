export type FirstUseAction = "register" | "record" | "report";

export type FirstUseGuide = {
  eyebrow: string;
  title: string;
  description: string;
  result: string;
  action: FirstUseAction;
  actionLabel: string;
};

export function buildFirstUseGuide({
  petCount,
  petName,
  recordCount,
}: {
  petCount: number;
  petName?: string;
  recordCount: number;
}): FirstUseGuide {
  if (petCount < 1) {
    return {
      eyebrow: "병원 가기 전 3분 준비",
      title: "설명할 내용을\n한 번에 정리해요",
      description: "이름과 종류를 등록한 뒤 달라진 점 한 줄만 남기면 돼요.",
      result: "첫 전달본은 무료이며 병원에서 바로 보여줄 수 있어요.",
      action: "register",
      actionLabel: "아이 등록하고 시작",
    };
  }

  const name = petName?.trim() || "반려동물";
  const safeRecordCount = Math.max(0, Math.floor(recordCount));
  if (safeRecordCount < 1) {
    return {
      eyebrow: "첫 기록은 짧게",
      title: `${name}의 달라진 점을\n한 줄로 남겨요`,
      description: "언제부터 무엇이 달라졌는지만 적고, 필요할 때 사진을 더하세요.",
      result: "첫 전달본은 무료예요. 남긴 사실이 그대로 들어가요.",
      action: "record",
      actionLabel: "첫 기록 남기기",
    };
  }

  return {
    eyebrow: "이미 기록이 있어요",
    title: `${safeRecordCount}개 기록으로\n병원 준비를 끝내요`,
    description: "병원에 가져갈 날짜를 고르면 변화 순서대로 정리할 수 있어요.",
    result: "처음부터 다시 설명하지 않고 바로 보여줄 수 있어요.",
    action: "report",
    actionLabel: "기록 골라 전달본 만들기",
  };
}

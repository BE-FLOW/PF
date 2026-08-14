import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileSource = readFileSync(resolve("apps/mobile/App.tsx"), "utf8");
const mobileHealthSource = readFileSync(
  resolve("apps/mobile/src/lib/health.ts"),
  "utf8",
);
const mobileOnboardingSource = readFileSync(
  resolve("apps/mobile/src/lib/onboarding.ts"),
  "utf8",
);
const webSource = readFileSync(resolve("src/components/petflow-app.tsx"), "utf8");
const vetDraftPromptSource = readFileSync(
  resolve("src/lib/vet-draft-prompt.ts"),
  "utf8",
);
const userFacingSources = `${mobileSource}\n${webSource}`;

describe("current product direction", () => {
  it("keeps the app and web centered on pre-visit preparation", () => {
    expect(mobileSource).toContain('label: "병원 준비"');
    expect(mobileSource).toContain('label: "전달본"');
    expect(webSource).toContain('label: "병원 준비"');
    expect(webSource).toContain('label: "전달본"');
  });

  it("keeps the iOS first-use path focused on a three-minute hospital handoff", () => {
    expect(mobileSource).toContain("병원 가기 전 3분");
    expect(mobileSource).toContain("한 줄과 사진이 병원 전달본이 돼요");
    expect(mobileSource).toContain("병원에서 꼭 말하고 싶은 변화는 무엇인가요?");
    expect(mobileSource).toContain("저장하고 전달본 보기");
    expect(mobileOnboardingSource).toContain("아이 등록하고 시작");
    expect(mobileOnboardingSource).toContain("첫 기록 남기기");
    expect(mobileOnboardingSource).toContain("기록 골라 전달본 만들기");
  });

  it("keeps free value before the one-time iOS purchase", () => {
    expect(mobileSource).toContain("첫 전달본은 무료예요");
    expect(mobileSource).toContain("병원 전달본 · 1회 이용권");
    expect(mobileSource).toContain("1회 결제이며 자동");
    expect(mobileSource).toContain("갱신은 없어요");
    expect(mobileSource).not.toContain("구독하기");
  });

  it("keeps fast free-form capture ahead of optional structured questions", () => {
    const prompt = mobileSource.indexOf(
      "병원에서 꼭 말하고 싶은 변화는 무엇인가요?",
    );
    const media = mobileSource.indexOf("<MediaPickerSection", prompt);
    const observations = mobileSource.indexOf("해당하는 변화", media);
    const symptomQuestions = mobileSource.indexOf(
      "문진에서 자주 묻는 내용",
      observations,
    );

    expect(prompt).toBeGreaterThan(-1);
    expect(media).toBeGreaterThan(prompt);
    expect(observations).toBeGreaterThan(media);
    expect(symptomQuestions).toBeGreaterThan(observations);
    expect(mobileHealthSource).toContain('prompt: "구토의 횟수·내용물"');
    expect(mobileHealthSource).toContain('prompt: "소변에서 달라진 점"');
  });

  it("keeps the handoff factual and outside diagnosis or prescribing", () => {
    expect(vetDraftPromptSource).toContain(
      "입력된 사실만 사용하고 새 의학적 판단을 추가하지 마세요.",
    );
    expect(vetDraftPromptSource).toContain(
      "진단명, 질병 확정, 약물명, 용량, 치료 처방, 치료 계획을 생성하지 마세요.",
    );
    expect(vetDraftPromptSource).toContain(
      "다른 병원에 처음 방문해도 이전 관찰을 다시 설명하는 시간을 줄일 수 있게",
    );
  });

  it("does not restore manual follow-up management in user-facing code", () => {
    expect(userFacingSources).not.toContain("흐름 마무리");
    expect(userFacingSources).not.toContain("경과 이어 기록");
    expect(userFacingSources).not.toContain("SOAP-LOOP · P");
    expect(userFacingSources).not.toContain("최근 14일");
  });

  it("does not restore legacy tester or score-first concepts in the iOS app", () => {
    for (const forbiddenCopy of [
      "체크스코어",
      "CHECK SCORE",
      "경과 기록",
      "참여코드",
      "테스터 필수 정보",
      "매일 기록",
    ]) {
      expect(mobileSource).not.toContain(forbiddenCopy);
    }
  });
});

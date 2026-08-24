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
const mobilePackageSource = readFileSync(
  resolve("apps/mobile/package.json"),
  "utf8",
);
const mobileConfigSource = readFileSync(
  resolve("apps/mobile/app.config.js"),
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
    expect(mobileSource).toContain("무료 병원 전달본 만들기");
    expect(mobileOnboardingSource).toContain("아이 등록하고 시작");
    expect(mobileOnboardingSource).toContain("첫 기록 남기기");
    expect(mobileOnboardingSource).toContain("기록 골라 전달본 만들기");
  });

  it("keeps the public app and web completely free of purchase runtime and copy", () => {
    expect(mobileSource).toContain("모든 기능을 무료로 사용할 수 있고 자동 결제가 없어요.");
    expect(mobileOnboardingSource).toContain("모든 병원 전달본은 무료예요");
    expect(mobilePackageSource).not.toContain("react-native-purchases");
    expect(mobileConfigSource).toContain('"com.android.vending.BILLING"');
    expect(mobileConfigSource).toContain("blockedPermissions");
    expect(webSource).toContain("무료 병원 전달본 만들기");
    for (const paidCopy of [
      "병원 전달본 · 1회 이용권",
      "병원 전달본 만들기 · 1회",
      "다시 만들기 · 1회",
      "1회 결제이며 자동",
      "구독하기",
      "구매 복원",
      "결제 반영",
    ]) {
      expect(userFacingSources).not.toContain(paidCopy);
    }
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
      "서버가 이미 만든 사실 문장을 고치거나 새 문장을 만들지 마세요.",
    );
    expect(vetDraftPromptSource).toContain(
      "제공된 keyObservations 중 진료실에서 먼저 볼 항목의 index만 중요도 순으로 선택하세요.",
    );
    expect(vetDraftPromptSource).toContain(
      "진단, 질병 추정, 약물, 용량, 처방, 치료 계획 또는 입력에 없는 관찰을 추가하지 마세요.",
    );
    expect(vetDraftPromptSource).toContain(
      "응답에는 keyObservationIndexes 외의 필드를 넣지 마세요.",
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
    expect(userFacingSources).not.toMatch(/[1-5]점/);
    expect(userFacingSources).not.toContain('"EPISODE"');
  });

  it("requires an explicit species for new pets while preserving edit values", () => {
    expect(mobileSource).toContain('species: ""');
    expect(mobileSource).toContain("const selectedSpecies = petDraft.species");
    expect(mobileSource).toContain("species: pet.species");
    expect(webSource).toContain('species: profile.id ? profile.species : ""');
    expect(userFacingSources).toContain(
      "강아지, 고양이, 기타 중 반려동물 종류를 선택해 주세요.",
    );
  });

  it("does not report a cancelled factual share as successful", () => {
    const shareStart = mobileSource.indexOf(
      "async function shareEpisodeReport",
    );
    const shareEnd = mobileSource.indexOf("function startPlanEdit", shareStart);
    const factualShareSource = mobileSource.slice(shareStart, shareEnd);

    expect(shareStart).toBeGreaterThan(-1);
    expect(factualShareSource).toContain(
      "result.action !== Share.sharedAction",
    );
    expect(factualShareSource).not.toContain("recordAiSummarySharedEvent");
  });

  it("clarifies text-only sharing and offers signed attachment links separately", () => {
    expect(mobileSource).toContain("텍스트 공유에는 사진·영상 파일이 포함되지 않아요.");
    expect(mobileSource).toContain("async function shareReportMedia");
    expect(webSource).toContain("사진·영상 파일은 이 텍스트 공유에 포함되지 않습니다.");
    expect(webSource).toContain("파일 공유");
  });
});

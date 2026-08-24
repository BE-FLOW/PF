import { describe, expect, it } from "vitest";
import { vetDraftSystemPrompt } from "./vet-draft-prompt";

describe("vet draft product contract", () => {
  it("only lets the model prioritize server-built factual observations", () => {
    expect(vetDraftSystemPrompt).toContain("수의사가 빠르게 검토");
    expect(vetDraftSystemPrompt).toContain(
      "서버가 이미 만든 사실 문장을 고치거나 새 문장을 만들지 마세요.",
    );
    expect(vetDraftSystemPrompt).toContain("keyObservations");
    expect(vetDraftSystemPrompt).toContain("index만 중요도 순으로 선택");
  });

  it("blocks medical generation and extra response fields", () => {
    expect(vetDraftSystemPrompt).toContain("진단, 질병 추정, 약물, 용량, 처방");
    expect(vetDraftSystemPrompt).toContain(
      "응답에는 keyObservationIndexes 외의 필드를 넣지 마세요.",
    );
    expect(vetDraftSystemPrompt).not.toContain("체크스코어");
    expect(vetDraftSystemPrompt).not.toContain("SOAP-LOOP의");
  });
});

import { describe, expect, it } from "vitest";
import { vetDraftSystemPrompt } from "./vet-draft-prompt";

describe("vet draft product contract", () => {
  it("keeps owner observations at the center of the pre-visit handoff", () => {
    expect(vetDraftSystemPrompt).toContain("원문 메모와 실제 관찰 시점");
    expect(vetDraftSystemPrompt).toContain("수의사가 빠르게 검토");
    expect(vetDraftSystemPrompt).toContain("다른 병원");
  });

  it("blocks legacy scoring, scheduled checkpoints, and medical generation", () => {
    expect(vetDraftSystemPrompt).toContain(
      "체크스코어, 앱 안전 단계, 고정 3·7·14일 구간",
    );
    expect(vetDraftSystemPrompt).toContain("진단명");
    expect(vetDraftSystemPrompt).not.toContain("SOAP-LOOP의");
  });
});

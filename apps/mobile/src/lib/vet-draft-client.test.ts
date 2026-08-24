import { describe, expect, it } from "vitest";
import {
  normalizeVetDraftReportIds,
  vetDraftRecoveryUrl,
  vetDraftSelectionKey,
  vetDraftSelectionMatches,
} from "./vet-draft-client";

const episodeId = "00000000-0000-4000-8000-000000000001";
const firstReportId = "00000000-0000-4000-8000-000000000002";
const secondReportId = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";

describe("mobile vet draft request scope", () => {
  it("normalizes selection order for cache and idempotency reuse", () => {
    expect(
      normalizeVetDraftReportIds([secondReportId, firstReportId, secondReportId]),
    ).toEqual([firstReportId, secondReportId]);
    expect(vetDraftSelectionKey(episodeId, [secondReportId, firstReportId])).toBe(
      vetDraftSelectionKey(episodeId, [firstReportId, secondReportId]),
    );
  });

  it("does not reuse a draft from a different report selection", () => {
    expect(
      vetDraftSelectionMatches([secondReportId, firstReportId], [firstReportId, secondReportId]),
    ).toBe(true);
    expect(vetDraftSelectionMatches([firstReportId], [secondReportId])).toBe(false);
  });

  it("builds an authenticated GET recovery target with exact report scope", () => {
    expect(
      vetDraftRecoveryUrl({
        apiBaseUrl: "https://petflow.test/",
        episodeId,
        reportIds: [secondReportId, firstReportId],
        requestId,
      }),
    ).toBe(
      `https://petflow.test/api/episodes/${episodeId}/vet-draft?requestId=${requestId}&reportIds=${firstReportId}&reportIds=${secondReportId}`,
    );
  });
});

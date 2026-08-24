import { describe, expect, it } from "vitest";
import {
  buildVetDraftRequestFingerprint,
  normalizeVetDraftReportIds,
  reportIdsFromSearchParams,
  vetDraftIdempotencyKey,
} from "./vet-draft-request";

const episodeId = "00000000-0000-4000-8000-000000000001";
const firstReportId = "00000000-0000-4000-8000-000000000002";
const secondReportId = "00000000-0000-4000-8000-000000000003";

describe("vet draft idempotency", () => {
  it("requires a UUID idempotency header", () => {
    expect(vetDraftIdempotencyKey(new Request("https://petflow.test"))).toBeNull();
    expect(
      vetDraftIdempotencyKey(
        new Request("https://petflow.test", {
          headers: { "Idempotency-Key": "retry-me" },
        }),
      ),
    ).toBeNull();
    expect(
      vetDraftIdempotencyKey(
        new Request("https://petflow.test", {
          headers: { "Idempotency-Key": firstReportId },
        }),
      ),
    ).toBe(firstReportId);
  });

  it("deduplicates and sorts selected record IDs", () => {
    expect(
      normalizeVetDraftReportIds([secondReportId, firstReportId, secondReportId]),
    ).toEqual([firstReportId, secondReportId]);
  });

  it("creates the same fingerprint regardless of selection order", () => {
    expect(
      buildVetDraftRequestFingerprint(episodeId, [secondReportId, firstReportId], 4),
    ).toBe(
      buildVetDraftRequestFingerprint(episodeId, [firstReportId, secondReportId], 4),
    );
    expect(buildVetDraftRequestFingerprint(episodeId, [], 4)).not.toBe(
      buildVetDraftRequestFingerprint(episodeId, [firstReportId], 4),
    );
    expect(buildVetDraftRequestFingerprint(episodeId, [firstReportId], 4)).not.toBe(
      buildVetDraftRequestFingerprint(episodeId, [firstReportId], 5),
    );
  });

  it("accepts repeated and comma-separated GET filters", () => {
    expect(
      reportIdsFromSearchParams(
        new URLSearchParams(
          `reportIds=${secondReportId},${firstReportId}&reportIds=${secondReportId}`,
        ),
      ),
    ).toEqual({ provided: true, ids: [firstReportId, secondReportId] });
  });

  it("distinguishes no GET selection filter from malformed filters", () => {
    expect(reportIdsFromSearchParams(new URLSearchParams())).toEqual({
      provided: false,
      ids: [],
    });
    expect(
      reportIdsFromSearchParams(new URLSearchParams("reportIds=not-a-uuid")),
    ).toHaveProperty("error");
  });
});

import { describe, expect, it } from "vitest";
import {
  emptyPetTestRecordDraft,
  isMissingPetTestRecordsTableError,
  petTestRecordDraftError,
  petTestRecordDraftFromRecord,
  petTestRecordMutation,
  sortPetTestRecordsNewestFirst,
  toPetTestRecord,
  type PetTestRecordRow,
} from "./test-records";

function testRecordRow(
  overrides: Partial<PetTestRecordRow> = {},
): PetTestRecordRow {
  return {
    id: "test-record-1",
    pet_id: "pet-1",
    episode_id: "episode-1",
    tested_at: "2026-09-03",
    test_name: "혈액검사",
    result_text: "ALT 120 U/L",
    clinic_name: "반려동물병원",
    memo: "검사지 원문을 보고 입력",
    source_type: "owner",
    review_status: "user_reported",
    created_at: "2026-09-03T01:00:00.000Z",
    updated_at: "2026-09-03T01:00:00.000Z",
    ...overrides,
  };
}

describe("mobile pet test record helpers", () => {
  it("requires a real date, test name, and owner-entered result", () => {
    expect(petTestRecordDraftError(emptyPetTestRecordDraft())).toBe(
      "검사 날짜를 입력해 주세요.",
    );
    expect(
      petTestRecordDraftError({
        ...emptyPetTestRecordDraft("2026-02-30"),
        testName: "혈액검사",
        resultText: "정상 범위",
      }),
    ).toBe("검사 날짜를 확인해 주세요.");
    expect(
      petTestRecordDraftError({
        ...emptyPetTestRecordDraft("2026-09-03"),
        resultText: "정상 범위",
      }),
    ).toBe("검사명을 입력해 주세요.");
    expect(
      petTestRecordDraftError({
        ...emptyPetTestRecordDraft("2026-09-03"),
        testName: "혈액검사",
      }),
    ).toBe("검사 결과를 입력해 주세요.");
  });

  it("rejects a future test date", () => {
    expect(
      petTestRecordDraftError(
        {
          ...emptyPetTestRecordDraft("20260904"),
          testName: "혈액검사",
          resultText: "검사지 표기 그대로",
        },
        new Date(2026, 8, 3, 12, 0, 0),
      ),
    ).toBe("검사 날짜는 오늘 또는 이전 날짜로 입력해 주세요.");
  });

  it("normalizes numeric dates and optional blank fields for storage", () => {
    const mutation = petTestRecordMutation(
      {
        ...emptyPetTestRecordDraft("20260903", "episode-1"),
        testName: "  혈액검사  ",
        resultText: "  ALT 120 U/L  ",
        clinicName: "   ",
        memo: "   ",
      },
      "user-1",
      "pet-1",
    );

    expect(mutation).toEqual({
      user_id: "user-1",
      pet_id: "pet-1",
      episode_id: "episode-1",
      tested_at: "2026-09-03",
      test_name: "혈액검사",
      result_text: "ALT 120 U/L",
      clinic_name: null,
      memo: null,
      source_type: "owner",
      review_status: "user_reported",
    });
  });

  it("maps the entered result without adding an interpretation", () => {
    const record = toPetTestRecord(
      testRecordRow({
        result_text: "ALT 120 U/L (검사지 표기 그대로)",
        clinic_name: null,
        memo: null,
      }),
    );

    expect(record.resultText).toBe("ALT 120 U/L (검사지 표기 그대로)");
    expect(record.clinicName).toBe("");
    expect(record.memo).toBe("");
    expect(record.sourceType).toBe("owner");
    expect(record.reviewStatus).toBe("user_reported");
    expect(record).not.toHaveProperty("diagnosis");
  });

  it("round-trips an existing record into an editable draft", () => {
    const record = toPetTestRecord(testRecordRow());

    expect(petTestRecordDraftFromRecord(record)).toEqual({
      id: "test-record-1",
      episodeId: "episode-1",
      testedAt: "2026-09-03",
      testName: "혈액검사",
      resultText: "ALT 120 U/L",
      clinicName: "반려동물병원",
      memo: "검사지 원문을 보고 입력",
    });
  });

  it("orders records by actual test date and then creation time", () => {
    const records = [
      toPetTestRecord(testRecordRow()),
      toPetTestRecord(
        testRecordRow({
          id: "test-record-2",
          tested_at: "2026-09-04",
          created_at: "2026-09-04T01:00:00.000Z",
        }),
      ),
      toPetTestRecord(
        testRecordRow({
          id: "test-record-3",
          created_at: "2026-09-03T02:00:00.000Z",
        }),
      ),
    ];

    expect(sortPetTestRecordsNewestFirst(records).map((record) => record.id)).toEqual([
      "test-record-2",
      "test-record-3",
      "test-record-1",
    ]);
  });

  it("recognizes missing-table responses during a staged rollout", () => {
    expect(isMissingPetTestRecordsTableError({ code: "42P01" })).toBe(true);
    expect(isMissingPetTestRecordsTableError({ code: "PGRST205" })).toBe(true);
    expect(
      isMissingPetTestRecordsTableError({ message: "pet_test_records unavailable" }),
    ).toBe(true);
    expect(isMissingPetTestRecordsTableError({ code: "23503" })).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAccessStatus, VetReviewDraft } from "@/lib/types";
import { buildVetDraftRequestFingerprint } from "@/lib/vet-draft-request";

const adminMocks = vi.hoisted(() => ({
  completeFreeAiReportUsage: vi.fn(),
  getAiAccessStatusForUser: vi.fn(),
  getAiReportAccess: vi.fn(),
  getEpisodeSourceRevisionForUser: vi.fn(),
  getEpisodeVetReviewBundle: vi.fn(),
  getStoredFreeAiReportRequest: vi.fn(),
  reserveFreeAiReportUsage: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => adminMocks);

const localDraft: VetReviewDraft = {
  title: "초코 병원 전달본",
  generatedAt: "2026-08-18T00:00:00.000Z",
  source: "local",
  reviewStatus: "unreviewed",
  overview: "어제부터 식욕이 줄었습니다.",
  handoffNote: "보호자가 어제부터 식욕 감소를 관찰했습니다.",
  keyObservations: ["식욕 감소", "활력 유지"],
  timeline: ["8월 18일: 식욕 감소"],
  mediaSummary: ["첨부 없음"],
  planAndProgress: ["보호자가 옮긴 병원 안내 없음"],
  questionsForVet: ["반복 횟수 미입력"],
  submissionNote: "보호자 관찰을 정리한 확인 전 초안입니다.",
  disclaimer: "진단을 대신하지 않습니다.",
  copyText: "초코 병원 전달본\n어제부터 식욕이 줄었습니다.",
};

vi.mock("@/lib/vet-review-report", () => ({
  buildVetReviewDraft: vi.fn(() => localDraft),
  formatVetReviewDraft: vi.fn((draft: VetReviewDraft) => draft.copyText),
}));

import { GET, POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const petId = "00000000-0000-4000-8000-000000000002";
const episodeId = "00000000-0000-4000-8000-000000000003";
const reportId = "00000000-0000-4000-8000-000000000004";
const requestId = "00000000-0000-4000-8000-000000000005";
const usageId = "00000000-0000-4000-8000-000000000006";
const reservationToken = "00000000-0000-4000-8000-000000000007";

const access: AiAccessStatus = {
  enabled: true,
  reason: "active",
  availableCredits: 3,
  complimentaryCredits: 0,
  purchasedCredits: 0,
  usedTotal: 0,
  billingConfigured: false,
  purchaseAvailable: false,
  productId: "petflow_ai_summary_1",
  freeRelease: true,
  dailyLimit: 3,
  attemptsToday: 0,
  dailyAttemptLimit: 9,
  resetsAt: "2026-08-18T15:00:00.000Z",
};

const bundle = {
  episode: {
    id: episodeId,
    petId,
    status: "open",
    startedAt: "2026-08-18T00:00:00.000Z",
    lastActivityAt: "2026-08-18T00:00:00.000Z",
    closedAt: null,
  },
  sourceRevision: 0,
  pet: {
    id: petId,
    name: "초코",
    species: "dog",
    breed: "",
    birthDate: "",
    sex: "unknown",
    weight: "",
  },
  reports: [
    {
      id: reportId,
      pet_id: petId,
      episode_id: episodeId,
      species: "dog",
      breed: null,
      owner_note: "식욕이 줄었어요",
      age_group: "adult",
      symptoms: [],
      symptom_details: {},
      appetite: "low",
      energy: "normal",
      duration: "today",
      red_flags: [],
      risk_level: "watch",
      risk_score: 0,
      analysis_source: "local",
      created_at: "2026-08-18T00:00:00.000Z",
      media: [],
    },
  ],
  progress: [],
};

function postRequest(options: { key?: string; reportIds?: string[] } = {}) {
  const headers: Record<string, string> = {
    Authorization: "Bearer access-token-at-least-20-characters",
    "Content-Type": "application/json",
  };
  if (options.key) headers["Idempotency-Key"] = options.key;
  return new Request(`https://petflow.test/api/episodes/${episodeId}/vet-draft`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reportIds: options.reportIds ?? [] }),
  });
}

const context = { params: Promise.resolve({ episodeId }) };

describe("free vet draft route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    adminMocks.getAiReportAccess.mockResolvedValue({ userId, status: access });
    adminMocks.getAiAccessStatusForUser.mockResolvedValue(access);
    adminMocks.getEpisodeSourceRevisionForUser.mockResolvedValue(0);
    adminMocks.getStoredFreeAiReportRequest.mockResolvedValue(null);
    adminMocks.getEpisodeVetReviewBundle.mockResolvedValue(bundle);
    adminMocks.reserveFreeAiReportUsage.mockResolvedValue({
      usageId,
      reservationToken,
      state: "reserved",
      draft: null,
    });
    adminMocks.completeFreeAiReportUsage.mockResolvedValue(true);
  });

  it("requires a client UUID idempotency key", async () => {
    const response = await POST(postRequest(), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("요청 번호"),
    });
    expect(adminMocks.reserveFreeAiReportUsage).not.toHaveBeenCalled();
  });

  it("returns a persisted result for a repeated POST without another model call", async () => {
    adminMocks.getStoredFreeAiReportRequest.mockResolvedValue({
      usageId,
      requestId,
      requestFingerprint: buildVetDraftRequestFingerprint(episodeId, [reportId], 0),
      episodeId,
      sourceRevision: 0,
      reportIds: [reportId],
      status: "succeeded",
      draft: localDraft,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      postRequest({ key: requestId, reportIds: [reportId] }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recovered: true,
      requestId,
      reportIds: [reportId],
      draft: { usageId },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(adminMocks.reserveFreeAiReportUsage).not.toHaveBeenCalled();
  });

  it("recovers the latest successful episode draft with its selected record IDs", async () => {
    adminMocks.getStoredFreeAiReportRequest.mockResolvedValue({
      usageId,
      requestId,
      requestFingerprint: "a".repeat(64),
      episodeId,
      sourceRevision: 0,
      reportIds: [reportId],
      status: "succeeded",
      draft: localDraft,
    });
    const response = await GET(
      new Request(`https://petflow.test/api/episodes/${episodeId}/vet-draft`, {
        headers: {
          Authorization: "Bearer access-token-at-least-20-characters",
        },
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recovered: true,
      requestId,
      reportIds: [reportId],
      draft: { usageId },
    });
    expect(adminMocks.getStoredFreeAiReportRequest).toHaveBeenCalledWith({
      userId,
      episodeId,
      requestId: undefined,
      sourceRevision: 0,
      selectedReportIds: undefined,
      succeededOnly: true,
    });
  });

  it("filters GET recovery by the exact stored record selection", async () => {
    adminMocks.getStoredFreeAiReportRequest.mockResolvedValue({
      usageId,
      requestId,
      requestFingerprint: "a".repeat(64),
      episodeId,
      sourceRevision: 0,
      reportIds: [reportId],
      status: "succeeded",
      draft: localDraft,
    });
    const response = await GET(
      new Request(
        `https://petflow.test/api/episodes/${episodeId}/vet-draft?reportIds=${reportId}`,
        {
          headers: {
            Authorization: "Bearer access-token-at-least-20-characters",
          },
        },
      ),
      context,
    );
    expect(response.status).toBe(200);
    expect(adminMocks.getStoredFreeAiReportRequest).toHaveBeenCalledWith({
      userId,
      episodeId,
      requestId: undefined,
      sourceRevision: 0,
      selectedReportIds: [reportId],
      succeededOnly: true,
    });
  });

  it("never recovers a draft from an older source revision", async () => {
    adminMocks.getEpisodeSourceRevisionForUser.mockResolvedValue(4);
    adminMocks.getStoredFreeAiReportRequest.mockResolvedValue(null);
    const response = await GET(
      new Request(`https://petflow.test/api/episodes/${episodeId}/vet-draft`, {
        headers: { Authorization: "Bearer access-token-at-least-20-characters" },
      }),
      context,
    );
    expect(response.status).toBe(404);
    expect(adminMocks.getStoredFreeAiReportRequest).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRevision: 4, succeededOnly: true }),
    );
  });

  it("returns Retry-After while the same request is already running", async () => {
    adminMocks.reserveFreeAiReportUsage.mockResolvedValue({
      usageId,
      state: "pending",
      draft: null,
    });
    const response = await POST(postRequest({ key: requestId }), context);
    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("3");
  });

  it("asks the client to retry when source facts change before reservation", async () => {
    adminMocks.reserveFreeAiReportUsage.mockResolvedValue({
      usageId: null,
      state: "stale_source",
      draft: null,
    });
    const response = await POST(postRequest({ key: requestId }), context);
    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("1");
  });

  it("caps an implicit whole-episode selection before model input", async () => {
    adminMocks.getEpisodeVetReviewBundle.mockResolvedValue({
      ...bundle,
      reports: Array.from({ length: 61 }, (_, index) => ({
        ...bundle.reports[0],
        id: `00000000-0000-4000-8${String(index).padStart(3, "0")}-000000000004`,
      })),
    });
    const response = await POST(postRequest({ key: requestId }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("최대 60개"),
    });
    expect(adminMocks.reserveFreeAiReportUsage).not.toHaveBeenCalled();
    expect(adminMocks.completeFreeAiReportUsage).not.toHaveBeenCalled();
  });

  it("returns the KST daily fair-use status without purchase recovery", async () => {
    const limitedAccess = {
      ...access,
      enabled: false,
      reason: "daily_limit" as const,
      availableCredits: 0,
      usedTotal: 3,
    };
    adminMocks.reserveFreeAiReportUsage.mockResolvedValue({
      usageId: null,
      state: "limit",
      draft: null,
    });
    adminMocks.getAiAccessStatusForUser.mockResolvedValue(limitedAccess);
    const response = await POST(postRequest({ key: requestId }), context);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      access: {
        freeRelease: true,
        purchaseAvailable: false,
        reason: "daily_limit",
        resetsAt: access.resetsAt,
      },
      error: expect.stringContaining("자정"),
    });
  });

  it("blocks repeated failed calls at the separate daily attempt budget", async () => {
    const attemptLimitedAccess: AiAccessStatus = {
      ...access,
      enabled: false,
      reason: "attempt_limit",
      attemptsToday: 9,
    };
    adminMocks.reserveFreeAiReportUsage.mockResolvedValue({
      usageId: null,
      state: "attempt_limit",
      draft: null,
    });
    adminMocks.getAiAccessStatusForUser.mockResolvedValue(attemptLimitedAccess);
    const response = await POST(postRequest({ key: requestId }), context);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      access: { enabled: false, reason: "attempt_limit", attemptsToday: 9 },
      error: expect.stringContaining("반복 요청 안전 한도"),
    });
  });

  it("never accepts model-authored medical advice", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            keyObservationIndexes: [0, 1],
            overview: "수액 치료가 필요합니다.",
          }),
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const response = await POST(postRequest({ key: requestId }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recovered: false,
      draft: {
        source: "openai",
        usageId,
        overview: localDraft.overview,
      },
    });
    expect(adminMocks.completeFreeAiReportUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationToken,
        status: "succeeded",
        errorCode: null,
        draft: expect.objectContaining({ overview: localDraft.overview }),
      }),
    );
  });

  it("preserves owner-reported provenance fields without revalidating them as model text", async () => {
    const previousPlan = localDraft.planAndProgress;
    localDraft.planAndProgress = ["보호자 메모: 아목시실린 5mg 하루 2회"];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            keyObservationIndexes: [1, 0],
            mediaSummary: ["모델이 바꾼 첨부 설명"],
            planAndProgress: ["모델이 바꾼 병원 안내"],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      const response = await POST(postRequest({ key: requestId }), context);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        draft: {
          source: "openai",
          planAndProgress: ["보호자 메모: 아목시실린 5mg 하루 2회"],
          mediaSummary: localDraft.mediaSummary,
        },
      });
      expect(adminMocks.completeFreeAiReportUsage).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: null }),
      );
    } finally {
      localDraft.planAndProgress = previousPlan;
    }
  });

  it("does not accept a model-invented symptom or observation count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            keyObservationIndexes: [0, 1],
            overview: "오늘 혈변이 7회 관찰되었습니다.",
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const response = await POST(postRequest({ key: requestId }), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.draft).toMatchObject({
      source: "openai",
      overview: localDraft.overview,
    });
    expect(JSON.stringify(body.draft)).not.toContain("혈변");
    expect(JSON.stringify(body.draft)).not.toContain("7회");
    expect(adminMocks.completeFreeAiReportUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: null,
        draft: expect.objectContaining({ overview: localDraft.overview }),
      }),
    );
  });
});

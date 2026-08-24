import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveEpisodePlan } = vi.hoisted(() => ({ saveEpisodePlan: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({ saveEpisodePlan }));

import { PUT } from "./route";

const episodeId = "11111111-1111-4111-8111-111111111111";
const petId = "22222222-2222-4222-8222-222222222222";
const accessToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("PUT /api/episodes/[episodeId]/plan", () => {
  beforeEach(() => saveEpisodePlan.mockReset());

  it("returns the server-confirmed closed episode with the saved guidance", async () => {
    const plan = {
      id: "33333333-3333-4333-8333-333333333333",
      episodeId,
      petId,
      sourceType: "owner",
      reviewStatus: "user_reported",
      reportedAt: "2026-08-18T02:00:00.000Z",
      tasks: [],
    };
    const episode = {
      id: episodeId,
      petId,
      status: "closed",
      startedAt: "2026-08-18T00:00:00.000Z",
      lastActivityAt: "2026-08-18T02:00:00.000Z",
      closedAt: "2026-08-18T02:00:00.000Z",
    };
    saveEpisodePlan.mockResolvedValue({ plan, episode });

    const response = await PUT(
      new Request(`https://petflow.test/api/episodes/${episodeId}/plan`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tasks: ["다음 방문 전 식사량 기록"] }),
      }),
      { params: Promise.resolve({ episodeId }) },
    );

    expect(response.status).toBe(200);
    expect(saveEpisodePlan).toHaveBeenCalledWith(accessToken, episodeId, [
      "다음 방문 전 식사량 기록",
    ]);
    await expect(response.json()).resolves.toEqual({ plan, episode });
  });
});

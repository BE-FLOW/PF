import { beforeEach, describe, expect, it, vi } from "vitest";

const helpers = vi.hoisted(() => ({
  getPetHealthHistory: vi.fn(),
  listPetEpisodes: vi.fn(),
  listPetEpisodePlans: vi.fn(),
  listPetEpisodeProgress: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => helpers);

import { GET } from "./route";

const petId = "11111111-1111-4111-8111-111111111111";
const accessToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("GET /api/pets/[petId]/history", () => {
  beforeEach(() => {
    Object.values(helpers).forEach((helper) => helper.mockReset());
  });

  it("requires an authenticated session", async () => {
    const response = await GET(new Request("http://localhost/api/pets/x/history"), {
      params: Promise.resolve({ petId }),
    });

    expect(response.status).toBe(401);
    expect(helpers.getPetHealthHistory).not.toHaveBeenCalled();
  });

  it("returns canonical records and legacy reports together", async () => {
    const history = { records: [{ id: "canonical" }], reports: [{ id: "legacy" }] };
    helpers.getPetHealthHistory.mockResolvedValue(history);
    helpers.listPetEpisodes.mockResolvedValue([]);
    helpers.listPetEpisodePlans.mockResolvedValue([]);
    helpers.listPetEpisodeProgress.mockResolvedValue([]);
    const request = new Request(`http://localhost/api/pets/${petId}/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const response = await GET(request, {
      params: Promise.resolve({ petId }),
    });

    expect(response.status).toBe(200);
    expect(helpers.getPetHealthHistory).toHaveBeenCalledWith(accessToken, petId);
    await expect(response.json()).resolves.toEqual({
      ...history,
      episodes: [],
      plans: [],
      progress: [],
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPetPhotoSignedUrl } = vi.hoisted(() => ({
  getPetPhotoSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getPetPhotoSignedUrl }));

import { GET } from "./route";

const petId = "11111111-1111-4111-8111-111111111111";
const accessToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("GET /api/pets/[petId]/photo-url", () => {
  beforeEach(() => {
    getPetPhotoSignedUrl.mockReset();
  });

  it("requires an authenticated session", async () => {
    const response = await GET(new Request("http://localhost/api/pets/x/photo-url"), {
      params: Promise.resolve({ petId }),
    });

    expect(response.status).toBe(401);
    expect(getPetPhotoSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects an invalid pet id before checking storage", async () => {
    const request = new Request("http://localhost/api/pets/x/photo-url", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const response = await GET(request, {
      params: Promise.resolve({ petId: "not-a-pet-id" }),
    });

    expect(response.status).toBe(400);
    expect(getPetPhotoSignedUrl).not.toHaveBeenCalled();
  });

  it("returns only an owner-checked short-lived URL", async () => {
    getPetPhotoSignedUrl.mockResolvedValue("https://storage.example/signed-photo");
    const request = new Request(`http://localhost/api/pets/${petId}/photo-url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const response = await GET(request, {
      params: Promise.resolve({ petId }),
    });

    expect(response.status).toBe(200);
    expect(getPetPhotoSignedUrl).toHaveBeenCalledWith(accessToken, petId);
    await expect(response.json()).resolves.toEqual({
      signedUrl: "https://storage.example/signed-photo",
    });
  });
});

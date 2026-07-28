import { beforeEach, describe, expect, it, vi } from "vitest";

const { deletePet } = vi.hoisted(() => ({ deletePet: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({ deletePet }));

import { DELETE } from "./route";

const petId = "11111111-1111-4111-8111-111111111111";
const accessToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("DELETE /api/pets/[petId]", () => {
  beforeEach(() => {
    deletePet.mockReset();
  });

  it("requires an authenticated session", async () => {
    const response = await DELETE(new Request("http://localhost/api/pets/x"), {
      params: Promise.resolve({ petId }),
    });

    expect(response.status).toBe(401);
    expect(deletePet).not.toHaveBeenCalled();
  });

  it("deletes only through the ownership-checking server helper", async () => {
    deletePet.mockResolvedValue(true);
    const request = new Request(`http://localhost/api/pets/${petId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ petId }),
    });

    expect(response.status).toBe(200);
    expect(deletePet).toHaveBeenCalledWith(accessToken, petId);
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });
});

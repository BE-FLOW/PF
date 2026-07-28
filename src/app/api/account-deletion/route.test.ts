import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteAccount } = vi.hoisted(() => ({ deleteAccount: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({ deleteAccount }));

import { DELETE } from "./route";

const accessToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("DELETE /api/account-deletion", () => {
  beforeEach(() => {
    deleteAccount.mockReset();
  });

  it("requires an authenticated session", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/account-deletion", { method: "DELETE" }),
    );

    expect(response.status).toBe(401);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("does not report completion when storage or auth deletion fails", async () => {
    deleteAccount.mockResolvedValue(null);
    const response = await DELETE(
      new Request("http://localhost/api/account-deletion", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );

    expect(response.status).toBe(400);
    expect(deleteAccount).toHaveBeenCalledWith(accessToken);
  });

  it("returns the server deletion timestamp after completion", async () => {
    deleteAccount.mockResolvedValue({ deletedAt: "2026-07-28T04:00:00.000Z" });
    const response = await DELETE(
      new Request("http://localhost/api/account-deletion", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      deletedAt: "2026-07-28T04:00:00.000Z",
    });
  });
});

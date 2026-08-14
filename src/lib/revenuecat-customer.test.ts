import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteRevenueCatCustomer } from "./revenuecat-customer";

const userId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REVENUECAT_SECRET_API_KEY;
});

describe("RevenueCat customer deletion", () => {
  it("does not block account deletion when billing is not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(deleteRevenueCatCustomer(userId)).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deletes the signed-in RevenueCat customer with the server key", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "secret-api-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(deleteRevenueCatCustomer(userId)).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.revenuecat.com/v1/subscribers/${userId}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-api-key",
        }),
      }),
    );
  });

  it("keeps the account when RevenueCat deletion fails", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "secret-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(deleteRevenueCatCustomer(userId)).resolves.toBe(false);
  });
});

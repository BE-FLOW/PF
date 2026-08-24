import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSource = readFileSync(resolve("src/lib/supabase-admin.ts"), "utf8");
const deletionStart = adminSource.indexOf("export async function deleteAccount");
const deletionEnd = adminSource.indexOf(
  "function emptyAiAccessStatus",
  deletionStart,
);
const deletionSource = adminSource.slice(deletionStart, deletionEnd);

describe("free public account deletion contract", () => {
  it("does not import or call the archived RevenueCat cleanup utility", () => {
    expect(deletionStart).toBeGreaterThan(-1);
    expect(deletionEnd).toBeGreaterThan(deletionStart);
    expect(adminSource).not.toContain('from "./revenuecat-customer"');
    expect(deletionSource).not.toContain("deleteRevenueCatCustomer");
    expect(deletionSource).not.toContain("REVENUECAT_SECRET_API_KEY");
  });

  it("still requires private storage cleanup before deleting the Auth user", () => {
    const storageCleanup = deletionSource.indexOf("const storageRemoved");
    const authDeletion = deletionSource.indexOf("client.auth.admin.deleteUser");

    expect(storageCleanup).toBeGreaterThan(-1);
    expect(authDeletion).toBeGreaterThan(storageCleanup);
  });
});

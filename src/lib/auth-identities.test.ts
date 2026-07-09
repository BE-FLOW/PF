import { describe, expect, it, vi } from "vitest";
import {
  defaultOAuthProviderStatus,
  fetchOAuthProviderStatus,
  oauthLinkErrorMessage,
  oauthSignInErrorMessage,
  passwordAuthErrorMessage,
} from "./auth-identities";

describe("auth identity helpers", () => {
  it("keeps Google and Apple visible when provider settings cannot be fetched", async () => {
    expect(defaultOAuthProviderStatus).toEqual({ google: true, apple: true });

    await expect(fetchOAuthProviderStatus(undefined, undefined)).resolves.toEqual({
      google: true,
      apple: true,
    });
  });

  it("reads enabled OAuth providers from Supabase settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { google: true, apple: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOAuthProviderStatus("https://example.supabase.co", "anon")).resolves.toEqual({
      google: true,
      apple: false,
    });

    vi.unstubAllGlobals();
  });

  it("explains existing email and linked identity conflicts clearly", () => {
    expect(
      passwordAuthErrorMessage("signup", { code: "user_already_exists" }),
    ).toContain("이미 가입된 이메일");
    expect(
      oauthLinkErrorMessage("google", { code: "identity_already_exists" }),
    ).toContain("이미 다른 펫플로우 계정에 연결");
  });

  it("points disabled OAuth providers to admin setup", () => {
    expect(
      oauthSignInErrorMessage("apple", new Error("Unsupported provider")),
    ).toContain("활성화되지 않았어요");
  });
});

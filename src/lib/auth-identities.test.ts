import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultOAuthProviderStatus,
  fetchOAuthProviderStatus,
  oauthLinkErrorMessage,
  oauthSignInErrorMessage,
  passwordAuthErrorMessage,
} from "./auth-identities";

describe("auth identity helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps OAuth providers closed until their status is verified", async () => {
    expect(defaultOAuthProviderStatus).toEqual({ google: false, apple: false });

    await expect(fetchOAuthProviderStatus(undefined, undefined)).resolves.toEqual({
      google: false,
      apple: false,
    });
  });

  it("fails closed when provider settings cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      fetchOAuthProviderStatus("https://example.supabase.co", "anon"),
    ).resolves.toEqual({ google: false, apple: false });
  });

  it("reads enabled OAuth providers from Supabase settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { google: true, apple: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchOAuthProviderStatus("https://example.supabase.co", "anon"),
    ).resolves.toEqual({
      google: true,
      apple: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/settings",
      expect.objectContaining({
        headers: expect.objectContaining({ apikey: "anon" }),
      }),
    );
  });

  it("supports legacy Supabase provider flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          external_google_enabled: false,
          external_apple_enabled: true,
        }),
      }),
    );

    await expect(
      fetchOAuthProviderStatus("https://example.supabase.co/", "anon"),
    ).resolves.toEqual({
      google: false,
      apple: true,
    });
  });

  it("explains existing email and linked identity conflicts clearly", () => {
    expect(
      passwordAuthErrorMessage("signup", { code: "user_already_exists" }),
    ).toContain("이미 가입된 이메일");

    expect(
      oauthLinkErrorMessage("google", { code: "identity_already_exists" }),
    ).toContain("이미 다른 펫플로우 계정");
  });

  it("points disabled OAuth providers to admin setup", () => {
    expect(
      oauthSignInErrorMessage("apple", new Error("Unsupported provider")),
    ).toContain("활성화되지 않았어요");
  });
});

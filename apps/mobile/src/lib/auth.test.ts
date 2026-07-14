import { describe, expect, it } from "vitest";
import {
  oauthCallbackUrlErrorMessage,
  oauthLinkErrorMessage,
  passwordAuthErrorMessage,
} from "./auth";

describe("mobile auth helpers", () => {
  it("keeps existing email signup errors actionable", () => {
    expect(
      passwordAuthErrorMessage("signup", { code: "user_already_exists" }),
    ).toContain("이미 가입된 이메일");
  });

  it("guides users back to account linking when an OAuth identity already exists", () => {
    expect(
      oauthCallbackUrlErrorMessage(
        "petflow://auth-callback?error=server_error&error_description=identity_already_exists",
      ),
    ).toContain("기존 이메일 계정");
  });

  it("does not allow hidden account merges on linked identity conflicts", () => {
    expect(
      oauthLinkErrorMessage("apple", { code: "identity_already_exists" }),
    ).toContain("기록이 섞이지 않도록");
  });
});

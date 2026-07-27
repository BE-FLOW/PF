import { describe, expect, it } from "vitest";
import { isDummyEmail } from "./dummy-account-policy.mjs";

describe("dummy account cleanup policy", () => {
  it("matches only reserved non-deliverable domains", () => {
    expect(isDummyEmail("seed@example.com")).toBe(true);
    expect(isDummyEmail("owner@preview.test")).toBe(true);
    expect(isDummyEmail("user@sample.invalid")).toBe(true);
    expect(isDummyEmail("local@localhost")).toBe(true);
  });

  it("does not infer deletion from a local-part label", () => {
    expect(isDummyEmail("test@gmail.com")).toBe(false);
    expect(isDummyEmail("demo@company.com")).toBe(false);
    expect(isDummyEmail("sample@naver.com")).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isDummyEmail("")).toBe(false);
    expect(isDummyEmail("missing-at.example.com")).toBe(false);
    expect(isDummyEmail("too@many@example.com")).toBe(false);
  });
});

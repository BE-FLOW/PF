import { describe, expect, it } from "vitest";
import { accessTokenFromAuthorizationHeader } from "./api-auth";

const token = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("API authorization", () => {
  it("accepts one well-formed bearer token", () => {
    expect(accessTokenFromAuthorizationHeader(`Bearer ${token}`)).toBe(token);
    expect(accessTokenFromAuthorizationHeader(`bearer ${token}`)).toBe(token);
  });

  it("rejects ambiguous, short, or oversized authorization values", () => {
    expect(accessTokenFromAuthorizationHeader(null)).toBeNull();
    expect(accessTokenFromAuthorizationHeader("Basic abc")).toBeNull();
    expect(accessTokenFromAuthorizationHeader("Bearer short")).toBeNull();
    expect(
      accessTokenFromAuthorizationHeader(`Bearer ${token},Bearer other`),
    ).toBeNull();
    expect(
      accessTokenFromAuthorizationHeader(`Bearer ${"a".repeat(8200)}`),
    ).toBeNull();
  });
});

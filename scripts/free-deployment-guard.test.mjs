import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "scripts/verify-deployment.mjs"),
  "utf8",
);

describe("free deployment guard", () => {
  it("requires the free-release database contract", () => {
    expect(source).toContain('freeReleaseSchema !== "ready"');
  });

  it("matches the deployed version to an expected Git commit", () => {
    expect(source).toContain('execFileSync("git", ["rev-parse", "HEAD"]');
    expect(source).toContain('/^[0-9a-f]{12}$/i.test');
    expect(source).toContain("expectedCommit.startsWith(healthResult.body.version)");
  });
});

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasStatus, parseArgs } from "./lib/app-store-connect.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "package.json"), "utf8"),
);
const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));
const appConfig = require(path.join(mobileRoot, "app.config.js"));

describe("mobile release configuration", () => {
  it("keeps the package version and store identifiers aligned", () => {
    const expectedPackageVersion = /^\d+\.\d+$/.test(appConfig.expo.version)
      ? `${appConfig.expo.version}.0`
      : appConfig.expo.version;
    expect(packageJson.version).toBe(expectedPackageVersion);
    expect(appConfig.expo.android.package).toBe("com.beflow.petflow");
    expect(appConfig.expo.ios.bundleIdentifier).toBe("com.beflow.petflow");
  });

  it("separates Android closed testing from production", () => {
    expect(easJson.submit.closed.android.track).toBe("alpha");
    expect(easJson.submit.production.android.track).toBe("production");
    expect(packageJson.scripts["release:all"]).toBeUndefined();
  });

  it("parses shared App Store script options", () => {
    const args = parseArgs(["--app-id", "123", "--dry-run"]);
    expect(args.get("--app-id")).toBe("123");
    expect(args.get("--dry-run")).toBe("true");
    expect(hasStatus({ status: 409 }, 409)).toBe(true);
  });
});

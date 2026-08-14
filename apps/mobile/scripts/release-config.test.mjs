import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasStatus, parseArgs } from "./lib/app-store-connect.mjs";
import {
  assertRuntimeCoveredByBuild,
  selectExactValidBuild,
  validateRemoteScreenshotAssets,
  validateScreenshotManifest,
} from "./lib/ios-release-guard.mjs";
import {
  hasStatus as hasGooglePlayStatus,
  parseArgs as parseGooglePlayArgs,
} from "./lib/google-play.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
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

  it("keeps local credentials out of EAS build archives", () => {
    const easIgnore = fs.readFileSync(path.join(repoRoot, ".easignore"), "utf8");
    expect(easIgnore).toContain("apps/mobile/credentials.json");
    expect(easIgnore).toContain("apps/mobile/credentials/");
    expect(easIgnore).toContain("*.p8");
    expect(easIgnore).toContain(".env*");
  });

  it("separates Android closed testing from production", () => {
    expect(easJson.submit.closed.android.track).toBe("alpha");
    expect(easJson.submit.production.android.track).toBe("production");
    expect(packageJson.scripts["release:all"]).toBeUndefined();
    expect(packageJson.scripts["release:ios:testflight"]).toBeUndefined();
    expect(packageJson.scripts["submit:ios:latest"]).toBeUndefined();
    expect(packageJson.scripts["release:ios:review-candidate"]).toContain(
      "--auto-submit-with-profile production",
    );
    expect(packageJson.scripts["release:ios:review-candidate"]).not.toContain(
      "--latest",
    );
    expect(packageJson.scripts["submit:ios:testflight-internal"]).toContain(
      "--internal true",
    );
    expect(packageJson.scripts["submit:ios:testflight-external"]).toContain(
      "--internal false",
    );
    expect(packageJson.scripts["submit:ios:testflight-internal"]).not.toContain(
      "--execute true",
    );
    expect(packageJson.scripts["submit:ios:testflight-external"]).not.toContain(
      "--execute true",
    );
  });

  it("parses shared App Store script options", () => {
    const args = parseArgs(["--app-id", "123", "--dry-run"]);
    expect(args.get("--app-id")).toBe("123");
    expect(args.get("--dry-run")).toBe("true");
    expect(hasStatus({ status: 409 }, 409)).toBe(true);
  });

  it("selects only the explicitly requested valid App Store build", () => {
    const builds = [
      {
        id: "old",
        attributes: { version: "22", processingState: "VALID", expired: false },
      },
      {
        id: "current",
        attributes: { version: "25", processingState: "VALID", expired: false },
      },
    ];
    expect(selectExactValidBuild(builds, "25").id).toBe("current");
    expect(() => selectExactValidBuild(builds, "26")).toThrow(
      "expected one valid build",
    );
  });

  it("allows only App Store assets to change after the release build", () => {
    expect(
      assertRuntimeCoveredByBuild({
        buildCommit: "build",
        currentCommit: "head",
        buildIsAncestor: true,
        changedPaths: [
          "apps/mobile/store/app-store/iphone-6-7/01-home-score.png",
          "apps/mobile/store/app-store/iphone-6-7/manifest.json",
        ],
      }),
    ).toEqual({ releaseArtifactOnly: true });
    expect(() =>
      assertRuntimeCoveredByBuild({
        buildCommit: "build",
        currentCommit: "head",
        buildIsAncestor: true,
        changedPaths: ["apps/mobile/App.tsx"],
      }),
    ).toThrow("Runtime changed");
    expect(() =>
      assertRuntimeCoveredByBuild({
        buildCommit: "build",
        currentCommit: "head",
        buildIsAncestor: true,
        changedPaths: Array.from({ length: 12 }, (_, index) => `file-${index}.ts`),
      }),
    ).toThrow("and 4 more");
  });

  it("requires screenshots to be stamped to the exact build and commit", () => {
    const files = Object.fromEntries(
      [
        "01-home-score.png",
        "02-health-check.png",
        "03-health-flow.png",
        "04-account-pets.png",
        "05-report-summary.png",
      ].map((file) => [file, "a".repeat(64)]),
    );
    const manifest = {
      version: "1.0",
      buildNumber: "25",
      gitCommit: "commit-25",
      displayType: "APP_IPHONE_67",
      width: 1290,
      height: 2796,
      capturedAt: "2026-08-01T00:00:00.000Z",
      source: "physical-iphone",
      qaConfirmedAt: "2026-08-01T00:00:00.000Z",
      qaConfirmation: "IOS_BUILD_25_QA_PASSED",
      iapReviewScreenshot: {
        file: "store/app-store/iap/ai-summary-purchase.png",
        sha256: "b".repeat(64),
      },
      files,
    };
    expect(() =>
      validateScreenshotManifest(manifest, {
        version: "1.0",
        buildNumber: "25",
        gitCommit: "commit-25",
        displayType: "APP_IPHONE_67",
      }),
    ).not.toThrow();
    expect(() =>
      validateScreenshotManifest(manifest, {
        version: "1.0",
        buildNumber: "26",
        gitCommit: "commit-25",
        displayType: "APP_IPHONE_67",
      }),
    ).toThrow("buildNumber");
  });

  it("matches every remote App Store screenshot to the local capture", () => {
    const checksums = Object.fromEntries(
      [
        "01-home-score.png",
        "02-health-check.png",
        "03-health-flow.png",
        "04-account-pets.png",
        "05-report-summary.png",
      ].map((file, index) => [file, `checksum-${index}`]),
    );
    const screenshots = Object.entries(checksums).map(([fileName, checksum]) => ({
      attributes: {
        fileName,
        sourceFileChecksum: checksum,
        imageAsset: { width: 1290, height: 2796 },
        assetDeliveryState: { state: "COMPLETE" },
      },
    }));

    expect(() =>
      validateRemoteScreenshotAssets(screenshots, {
        checksums,
        width: 1290,
        height: 2796,
      }),
    ).not.toThrow();
    screenshots[0].attributes.sourceFileChecksum = "stale";
    expect(() =>
      validateRemoteScreenshotAssets(screenshots, {
        checksums,
        width: 1290,
        height: 2796,
      }),
    ).toThrow("does not match");
  });

  it("parses Google Play script options without loading credentials", () => {
    const args = parseGooglePlayArgs([
      "--package-name",
      "com.beflow.petflow",
      "--apply",
    ]);
    expect(args.get("--package-name")).toBe("com.beflow.petflow");
    expect(args.get("--apply")).toBe("true");
    expect(hasGooglePlayStatus({ status: 403 }, 403)).toBe(true);
  });
});

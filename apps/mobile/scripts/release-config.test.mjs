import fs from "node:fs";
import os from "node:os";
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
  findExactFinishedEasBuild,
  runCommand,
} from "./lib/release-source.mjs";
import {
  hasStatus as hasGooglePlayStatus,
  parseArgs as parseGooglePlayArgs,
} from "./lib/google-play.mjs";
import {
  GOOGLE_PLAY_FEATURE_GRAPHIC_DEFINITION,
  GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS,
} from "./lib/google-play-screenshot-guard.mjs";
import {
  assertDistinctScreenshotSets,
  assertScreenshotCapturedAfterBuild,
  readPngMetadata,
  validateScreenshotFiles,
} from "./lib/store-screenshot-guard.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "package.json"), "utf8"),
);
const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));
const appConfig = require(path.join(mobileRoot, "app.config.js"));
const releasePreflightSource = fs.readFileSync(
  path.join(mobileRoot, "scripts", "release-preflight.mjs"),
  "utf8",
);
const prepareIosSource = fs.readFileSync(
  path.join(mobileRoot, "scripts", "prepare-ios-app-store.mjs"),
  "utf8",
);

describe("mobile release configuration", () => {
  it("keeps the package version and store identifiers aligned", () => {
    const expectedPackageVersion = /^\d+\.\d+$/.test(appConfig.expo.version)
      ? `${appConfig.expo.version}.0`
      : appConfig.expo.version;
    expect(packageJson.version).toBe(expectedPackageVersion);
    expect(appConfig.expo.android.package).toBe("com.beflow.petflow");
    expect(appConfig.expo.ios.bundleIdentifier).toBe("com.beflow.petflow");
  });

  it("keeps the public app free of mobile purchase code and permissions", () => {
    expect(packageJson.dependencies["react-native-purchases"]).toBeUndefined();
    expect(packageJson.scripts["status:ios:iap"]).toBeUndefined();
    expect(packageJson.scripts["configure:ios:iap"]).toBeUndefined();
    expect(packageJson.scripts["status:android:iap"]).toBeUndefined();
    expect(packageJson.scripts["configure:android:iap"]).toBeUndefined();
    expect(appConfig.expo.android.permissions ?? []).not.toContain(
      "com.android.vending.BILLING",
    );
    expect(appConfig.expo.android.blockedPermissions).toContain(
      "com.android.vending.BILLING",
    );
    expect(appConfig.expo.plugins).toContain("expo-font");
    expect(fs.existsSync(path.join(mobileRoot, "src/lib/billing.ts"))).toBe(false);
  });

  it("requires a configured free AI backend and both fair-use limits", () => {
    expect(releasePreflightSource).toContain(
      'health.freeReleaseSchema === "ready"',
    );
    expect(releasePreflightSource).toContain(
      "health.freeAi?.generationConfigured === true",
    );
    expect(releasePreflightSource).toContain(
      "Number.isSafeInteger(health.freeAi?.dailyAttemptLimit)",
    );
    expect(releasePreflightSource).toContain(
      "health.freeAi.dailyAttemptLimit >= health.freeAi.dailyLimit",
    );
  });

  it("rejects billing variables from the EAS production environment", () => {
    expect(releasePreflightSource).toContain(
      'readEasEnvironmentVariableNames("production", "project")',
    );
    expect(releasePreflightSource).toContain(
      'readEasEnvironmentVariableNames("production", "account")',
    );
    expect(releasePreflightSource).toContain(
      "/REVENUECAT|PURCHASE|BILLING/",
    );
  });

  it(
    "pins the patched Metro dependency line",
    () => {
      const metroConfig = require(path.join(mobileRoot, "metro.config.js"));

      expect(metroConfig.resolver).toBeDefined();
      expect(packageJson.overrides.metro).toBe("0.84.5");
      expect(packageJson.overrides["metro-config"]).toBe("0.84.5");
      expect(packageJson.overrides["metro-transform-worker"]).toBe("0.84.5");
      expect(() => require.resolve("image-size")).toThrow();
    },
    15_000,
  );

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
      "release:preflight:ios",
    );
    expect(packageJson.scripts["release:ios:review-candidate"]).not.toContain(
      "--latest",
    );
    expect(packageJson.scripts["release:android:closed"]).not.toContain(
      "build:android:production",
    );
    expect(packageJson.scripts["release:android:production"]).not.toContain(
      "build:android:production",
    );
    expect(easJson.build["store-screenshot"]).toMatchObject({
      extends: "production",
      distribution: "internal",
      autoIncrement: false,
      android: { buildType: "apk" },
    });
    expect(packageJson.scripts["build:android:store-screenshot"]).toContain(
      "--profile store-screenshot",
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

  it("captures distinct 9:16 Google Play device classes at recommendation-ready sizes", () => {
    expect(GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS).toEqual([
      expect.objectContaining({
        displayType: "GOOGLE_PLAY_PHONE",
        width: 1080,
        height: 1920,
        avdName: "PetFlow_Phone_API36",
      }),
      expect.objectContaining({
        displayType: "GOOGLE_PLAY_TABLET_7",
        width: 1350,
        height: 2400,
        avdName: "PetFlow_Tablet7_API36",
      }),
      expect.objectContaining({
        displayType: "GOOGLE_PLAY_TABLET_10",
        width: 1800,
        height: 3200,
        avdName: "PetFlow_Tablet10_API36",
      }),
    ]);
    for (const definition of GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS) {
      expect(definition.height / definition.width).toBeCloseTo(16 / 9, 5);
      expect(definition.width).toBeGreaterThanOrEqual(1080);
      expect(definition.height).toBeLessThanOrEqual(3840);
    }
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

  it("accepts only source-identical duplicate EAS builds", () => {
    const common = {
      status: "FINISHED",
      appVersion: "1.0",
      appBuildVersion: "27",
      gitCommitHash: "commit-27",
      fingerprint: { hash: "fingerprint-27" },
      distribution: "STORE",
      buildProfile: "production",
      sdkVersion: "56.0.0",
    };
    const older = {
      ...common,
      id: "older",
      completedAt: "2026-08-14T06:08:35.944Z",
    };
    const newer = {
      ...common,
      id: "newer",
      completedAt: "2026-08-14T06:12:25.739Z",
    };

    expect(
      findExactFinishedEasBuild([older, newer], {
        version: "1.0",
        buildNumber: "27",
      }).id,
    ).toBe("newer");
    expect(() =>
      findExactFinishedEasBuild(
        [older, { ...newer, fingerprint: { hash: "different" } }],
        { version: "1.0", buildNumber: "27" },
      ),
    ).toThrow("conflicting finished builds");

    expect(
      findExactFinishedEasBuild(
        [
          newer,
          {
            ...newer,
            id: "screenshot-apk",
            distribution: "INTERNAL",
            buildProfile: "store-screenshot",
          },
        ],
        {
          version: "1.0",
          buildNumber: "27",
          buildProfile: "production",
          distribution: "STORE",
        },
      ).id,
    ).toBe("newer");
  });

  it("preserves the leading status column in command output", () => {
    expect(
      runCommand(
        process.execPath,
        ["-e", "process.stdout.write(' M apps/mobile/file.png\\n')"],
        mobileRoot,
      ),
    ).toBe(" M apps/mobile/file.png");
  });

  it("allows only store assets and approved release tooling to change after the release build", () => {
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
    expect(
      assertRuntimeCoveredByBuild({
        buildCommit: "build",
        currentCommit: "head",
        buildIsAncestor: true,
        changedPaths: ["apps/mobile/scripts/stamp-android-screenshots.mjs"],
      }),
    ).toEqual({ releaseArtifactOnly: true });
    expect(
      assertRuntimeCoveredByBuild({
        buildCommit: "build",
        currentCommit: "head",
        buildIsAncestor: true,
        changedPaths: [
          "apps/mobile/store/google-play/screenshots-phone/01-home-score.png",
          "apps/mobile/store/google-play/screenshots-phone/manifest.json",
        ],
      }),
    ).toEqual({ releaseArtifactOnly: true });
    expect(() =>
      assertRuntimeCoveredByBuild({
        buildCommit: "build",
        currentCommit: "head",
        buildIsAncestor: true,
        changedPaths: ["apps/mobile/scripts/unreviewed-release-tool.mjs"],
      }),
    ).toThrow("Runtime changed");
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
      platform: "ios",
      displayType: "APP_IPHONE_67",
      width: 1290,
      height: 2796,
      capturedAt: "2026-08-01T00:00:00.000Z",
      source: "physical-iphone",
      qaConfirmedAt: "2026-08-01T00:00:00.000Z",
      qaConfirmation: "IOS_SCREENSHOTS_BUILD_25_QA_PASSED",
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

  it("rejects valid store screenshots with an alpha channel", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "petflow-alpha-png-"));
    const file = path.join(directory, "alpha.png");

    try {
      await sharp({
        create: {
          width: 4,
          height: 6,
          channels: 4,
          background: { r: 31, g: 147, b: 111, alpha: 0.5 },
        },
      })
        .png()
        .toFile(file);
      expect(readPngMetadata(file)).toMatchObject({
        width: 4,
        height: 6,
        hasAlpha: true,
      });
      expect(() =>
        validateScreenshotFiles({
          files: [file],
          expectedFileNames: ["alpha.png"],
          width: 4,
          height: 6,
        }),
      ).toThrow("alpha transparency");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects screenshots captured before the exact EAS build", () => {
    expect(() =>
      assertScreenshotCapturedAfterBuild(
        { capturedAt: "2026-08-01T00:00:00.000Z" },
        { completedAt: "2026-08-01T00:00:01.000Z" },
      ),
    ).toThrow("predate EAS build");
  });

  it("rejects byte-identical Google Play device-class sets", () => {
    const hashes = { "01-home-score.png": "a".repeat(64) };
    expect(() =>
      assertDistinctScreenshotSets([
        {
          hashes,
          manifest: { displayType: "GOOGLE_PLAY_TABLET_7" },
        },
        {
          hashes: { ...hashes },
          manifest: { displayType: "GOOGLE_PLAY_TABLET_10" },
        },
      ]),
    ).toThrow("byte-identical");
  });

  it("wires exact stamped screenshots into both release preflights", () => {
    expect(releasePreflightSource).toContain("validateAndroidReleaseScreenshots");
    expect(releasePreflightSource).toContain("validateIosReleaseScreenshots");
    expect(releasePreflightSource).toContain("validateGooglePlayFeatureGraphic");
    expect(GOOGLE_PLAY_FEATURE_GRAPHIC_DEFINITION).toMatchObject({
      fileName: "feature-graphic-1024x500.png",
      width: 1024,
      height: 500,
    });
    expect(packageJson.scripts["stamp:android:screenshots"]).toContain(
      "stamp-android-screenshots.mjs",
    );
  });

  it("uses the shared Korean store listing for App Store metadata", () => {
    expect(prepareIosSource).toContain('"store", "ko-KR", "listing.md"');
    expect(prepareIosSource).toContain('listingSection("설명")');
    expect(prepareIosSource).toContain('listingSection("키워드 후보")');
    expect(prepareIosSource).not.toContain(
      "PetFlow는 보호자가 반려동물의 식욕, 활력, 증상과",
    );
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

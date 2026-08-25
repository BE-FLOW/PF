import crypto from "node:crypto";
import fs from "node:fs";
import {
  readPngSize,
  sha256File,
  validateScreenshotFiles as validateStoreScreenshotFiles,
  validateScreenshotManifest as validateStoreScreenshotManifest,
} from "./store-screenshot-guard.mjs";

export { readPngSize, sha256File };

export const IOS_SCREENSHOT_FILES = Object.freeze([
  "01-home-score.png",
  "02-health-check.png",
  "03-health-flow.png",
  "04-account-pets.png",
  "05-report-summary.png",
]);

export const EDITABLE_APP_STORE_STATES = new Set([
  "DEVELOPER_REJECTED",
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_SUBMISSION",
]);

export function selectExactValidBuild(builds, buildNumber) {
  const matches = builds.filter(
    (build) =>
      String(build.attributes?.version) === String(buildNumber) &&
      build.attributes?.processingState === "VALID" &&
      !build.attributes?.expired,
  );
  if (matches.length !== 1) {
    throw new Error(
      `App Store build ${buildNumber}: expected one valid build, found ${matches.length}.`,
    );
  }
  return matches[0];
}

export function assertEditableVersionState(state) {
  if (EDITABLE_APP_STORE_STATES.has(state)) return;
  if (state === "PENDING_DEVELOPER_RELEASE") {
    throw new Error(
      "The approved version is awaiting manual release. Withdraw it before assigning a new build.",
    );
  }
  throw new Error(`App Store version is not editable in state ${state}.`);
}

export function md5File(filePath) {
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
}

export function validateScreenshotFiles({ files, width, height }) {
  return validateStoreScreenshotFiles({
    files,
    expectedFileNames: IOS_SCREENSHOT_FILES,
    width,
    height,
  });
}

export function validateScreenshotManifest(manifest, expected) {
  return validateStoreScreenshotManifest(manifest, {
    ...expected,
    platform: "ios",
    width: 1290,
    height: 2796,
    expectedFileNames: IOS_SCREENSHOT_FILES,
  });
}

export function validateRemoteScreenshotAssets(
  screenshots,
  { checksums, width, height },
) {
  if (screenshots.length !== IOS_SCREENSHOT_FILES.length) {
    throw new Error(
      `Expected ${IOS_SCREENSHOT_FILES.length} remote screenshots; found ${screenshots.length}.`,
    );
  }

  const screenshotsByName = new Map(
    screenshots.map((item) => [item.attributes?.fileName, item]),
  );
  for (const fileName of IOS_SCREENSHOT_FILES) {
    const screenshot = screenshotsByName.get(fileName);
    if (!screenshot) throw new Error(`Remote screenshot ${fileName} is missing.`);
    const attributes = screenshot.attributes;
    if (attributes.assetDeliveryState?.state !== "COMPLETE") {
      throw new Error(`Remote screenshot ${fileName} is not complete.`);
    }
    if (attributes.sourceFileChecksum !== checksums[fileName]) {
      throw new Error(`Remote screenshot ${fileName} does not match the local file.`);
    }
    if (
      attributes.imageAsset?.width !== Number(width) ||
      attributes.imageAsset?.height !== Number(height)
    ) {
      throw new Error(`Remote screenshot ${fileName} has unexpected dimensions.`);
    }
  }
}

export function isStoreReleaseArtifact(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const storePrefixes = [
    "apps/mobile/store/app-store/",
    "apps/mobile/store/google-play/",
  ];
  const releaseToolFiles = new Set([
    "apps/mobile/scripts/ios-release-readiness.mjs",
    "apps/mobile/scripts/lib/ios-release-guard.mjs",
    "apps/mobile/scripts/lib/release-source.mjs",
    "apps/mobile/scripts/prepare-ios-app-store.mjs",
    "apps/mobile/scripts/release-config.test.mjs",
    "apps/mobile/scripts/release-preflight.mjs",
    "apps/mobile/scripts/stamp-android-screenshots.mjs",
    "apps/mobile/scripts/stamp-ios-screenshots.mjs",
    "apps/mobile/scripts/upload-ios-screenshots.mjs",
    "apps/mobile/scripts/verify-ios-release-build.mjs",
  ]);
  return (
    storePrefixes.some((prefix) => normalized.startsWith(prefix)) ||
    releaseToolFiles.has(normalized)
  );
}

export function assertRuntimeCoveredByBuild({
  buildCommit,
  currentCommit,
  buildIsAncestor,
  changedPaths,
}) {
  if (buildCommit === currentCommit) return { releaseArtifactOnly: false };
  if (!buildIsAncestor) {
    throw new Error("The selected EAS build is not an ancestor of current main.");
  }
  const runtimeChanges = changedPaths.filter((file) => !isStoreReleaseArtifact(file));
  if (runtimeChanges.length) {
    const visible = runtimeChanges.slice(0, 8);
    const remainder = runtimeChanges.length - visible.length;
    throw new Error(
      `Runtime changed after the selected EAS build (${runtimeChanges.length} files): ${visible.join(", ")}${remainder ? `, and ${remainder} more` : ""}.`,
    );
  }
  return { releaseArtifactOnly: true };
}

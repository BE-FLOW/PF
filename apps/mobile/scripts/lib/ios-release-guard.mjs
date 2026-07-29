import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const IOS_SCREENSHOT_FILES = Object.freeze([
  "01-home-score.png",
  "02-health-check.png",
  "03-health-flow.png",
  "04-account-pets.png",
  "05-report-summary.png",
]);
export const IOS_IAP_REVIEW_SCREENSHOT = "store/app-store/iap/ai-summary-purchase.png";

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

export function readPngSize(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  if (
    header.length < 24 ||
    header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  ) {
    throw new Error(`${path.basename(filePath)} is not a valid PNG file.`);
  }
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function md5File(filePath) {
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
}

export function validateScreenshotFiles({ files, width, height }) {
  const names = files.map((file) => path.basename(file)).sort();
  const expected = [...IOS_SCREENSHOT_FILES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected screenshots ${expected.join(", ")}; found ${names.join(", ") || "none"}.`,
    );
  }

  for (const file of files) {
    const size = readPngSize(file);
    if (size.width !== Number(width) || size.height !== Number(height)) {
      throw new Error(
        `${path.basename(file)} is ${size.width}x${size.height}; expected ${width}x${height}.`,
      );
    }
  }
}

export function validateScreenshotManifest(manifest, expected) {
  const required = [
    "version",
    "buildNumber",
    "gitCommit",
    "displayType",
    "width",
    "height",
    "capturedAt",
    "source",
    "qaConfirmedAt",
    "qaConfirmation",
    "iapReviewScreenshot",
    "files",
  ];
  const missing = required.filter(
    (key) => manifest[key] === undefined || manifest[key] === "",
  );
  if (missing.length) {
    throw new Error(`Screenshot manifest is missing: ${missing.join(", ")}.`);
  }

  const comparisons = [
    ["version", manifest.version, expected.version],
    ["buildNumber", String(manifest.buildNumber), String(expected.buildNumber)],
    ["gitCommit", manifest.gitCommit, expected.gitCommit],
    ["displayType", manifest.displayType, expected.displayType],
  ];
  for (const [label, actual, target] of comparisons) {
    if (actual !== target) {
      throw new Error(`Screenshot ${label} ${actual} does not match ${target}.`);
    }
  }

  const expectedQaConfirmation = `IOS_BUILD_${expected.buildNumber}_QA_PASSED`;
  if (manifest.qaConfirmation !== expectedQaConfirmation) {
    throw new Error(
      `Screenshot QA confirmation must be ${expectedQaConfirmation}.`,
    );
  }
  if (
    manifest.iapReviewScreenshot?.file !== IOS_IAP_REVIEW_SCREENSHOT ||
    !/^[a-f0-9]{64}$/.test(manifest.iapReviewScreenshot?.sha256 ?? "")
  ) {
    throw new Error("Screenshot manifest has no valid iOS purchase review image.");
  }

  for (const fileName of IOS_SCREENSHOT_FILES) {
    if (!/^[a-f0-9]{64}$/.test(manifest.files[fileName] ?? "")) {
      throw new Error(`Screenshot manifest has no valid SHA-256 for ${fileName}.`);
    }
  }
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
  return relativePath.replaceAll("\\", "/").startsWith(
    "apps/mobile/store/app-store/",
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

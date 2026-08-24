import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  GOOGLE_PLAY_SCREENSHOT_FILES,
  googlePlayFeatureGraphic,
  googlePlayScreenshotSets,
} from "./lib/google-play-screenshot-guard.mjs";
import {
  assertDistinctScreenshotSets,
  expectedScreenshotQaConfirmation,
  sha256File,
  validateScreenshotFiles,
} from "./lib/store-screenshot-guard.mjs";
import {
  findExactFinishedEasBuild,
  readEasBuilds,
  runCommand,
} from "./lib/release-source.mjs";
import { parseArgs } from "./lib/app-store-connect.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const require = createRequire(import.meta.url);
const expo = require(path.join(mobileRoot, "app.config.js")).expo;
const args = parseArgs();
const buildNumber = args.get("--build-number");
const execute = args.get("--execute") === "true";
const source = args.get("--source") || "physical-android";
const qaConfirmation = args.get("--confirm-qa");

if (!buildNumber) throw new Error("--build-number is required.");
const expectedQaConfirmation = expectedScreenshotQaConfirmation(
  "android",
  buildNumber,
);
if (qaConfirmation !== expectedQaConfirmation) {
  throw new Error(`Use --confirm-qa ${expectedQaConfirmation} after device QA.`);
}
if (runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot) !== "main") {
  throw new Error("Screenshot stamping must run from main.");
}
runCommand("git", ["fetch", "--quiet", "origin", "main"], repoRoot);
const head = runCommand("git", ["rev-parse", "HEAD"], repoRoot);
const originMain = runCommand("git", ["rev-parse", "origin/main"], repoRoot);
if (head !== originMain) throw new Error("Local main and origin/main differ.");

const dirtyPaths = runCommand(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  repoRoot,
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.slice(3).split(" -> ").at(-1).replaceAll("\\", "/"));
const allowedPrefix = "apps/mobile/store/google-play/";
const unrelated = dirtyPaths.filter((file) => !file.startsWith(allowedPrefix));
if (unrelated.length) {
  throw new Error(`Unrelated uncommitted files: ${unrelated.join(", ")}.`);
}

const easBuild = findExactFinishedEasBuild(readEasBuilds(mobileRoot, "android"), {
  version: expo.version,
  buildNumber,
  platform: "android",
});
if (easBuild.gitCommitHash !== head) {
  throw new Error(
    `EAS build ${buildNumber} was created from ${easBuild.gitCommitHash}, not current main ${head}.`,
  );
}
if (easBuild.buildProfile !== "production" || easBuild.distribution !== "STORE") {
  throw new Error(`EAS build ${buildNumber} is not a production store build.`);
}

const sets = googlePlayScreenshotSets(mobileRoot).map((set) => {
  const files = GOOGLE_PLAY_SCREENSHOT_FILES.map((fileName) =>
    path.join(set.directory, fileName),
  );
  validateScreenshotFiles({
    files,
    expectedFileNames: GOOGLE_PLAY_SCREENSHOT_FILES,
    width: set.width,
    height: set.height,
  });
  const hashes = Object.fromEntries(
    files.map((file) => [path.basename(file), sha256File(file)]),
  );
  return { ...set, files, hashes };
});
const featureGraphic = googlePlayFeatureGraphic(mobileRoot);
const featureGraphicFile = path.join(
  featureGraphic.directory,
  featureGraphic.fileName,
);
validateScreenshotFiles({
  files: [featureGraphicFile],
  expectedFileNames: [featureGraphic.fileName],
  width: featureGraphic.width,
  height: featureGraphic.height,
});
const featureGraphicHashes = {
  [featureGraphic.fileName]: sha256File(featureGraphicFile),
};

assertDistinctScreenshotSets(
  sets.map((set) => ({
    hashes: set.hashes,
    manifest: { displayType: set.displayType },
  })),
);

const completedAt = new Date(easBuild.completedAt ?? easBuild.updatedAt).getTime();
if (!Number.isFinite(completedAt)) {
  throw new Error("The EAS build has no valid completion timestamp.");
}
const staleFiles = sets
  .flatMap((set) => set.files)
  .concat(featureGraphicFile)
  .filter((file) => fs.statSync(file).mtimeMs < completedAt);
if (staleFiles.length) {
  throw new Error(
    `These screenshots predate EAS build ${buildNumber}: ${staleFiles
      .map((file) => path.relative(mobileRoot, file).replaceAll("\\", "/"))
      .join(", ")}. Capture the current app first.`,
  );
}

const stampedAt = new Date().toISOString();
const manifests = sets.map((set) => ({
  path: path.join(set.directory, "manifest.json"),
  value: {
    version: expo.version,
    buildNumber: String(buildNumber),
    gitCommit: easBuild.gitCommitHash,
    platform: "android",
    displayType: set.displayType,
    width: set.width,
    height: set.height,
    capturedAt: stampedAt,
    source,
    qaConfirmedAt: stampedAt,
    qaConfirmation,
    files: set.hashes,
  },
}));
manifests.push({
  path: path.join(featureGraphic.directory, "manifest.json"),
  value: {
    version: expo.version,
    buildNumber: String(buildNumber),
    gitCommit: easBuild.gitCommitHash,
    platform: "android",
    displayType: featureGraphic.displayType,
    width: featureGraphic.width,
    height: featureGraphic.height,
    capturedAt: stampedAt,
    source,
    qaConfirmedAt: stampedAt,
    qaConfirmation,
    files: featureGraphicHashes,
  },
});

if (execute) {
  for (const manifest of manifests) {
    fs.writeFileSync(
      manifest.path,
      `${JSON.stringify(manifest.value, null, 2)}\n`,
      "utf8",
    );
  }
}

console.log(
  JSON.stringify(
    {
      validated: true,
      execute,
      manifests: execute ? manifests.map((manifest) => manifest.path) : [],
      easBuild: {
        id: easBuild.id,
        version: easBuild.appVersion,
        buildNumber: easBuild.appBuildVersion,
        commit: easBuild.gitCommitHash,
        completedAt: easBuild.completedAt,
      },
      screenshotSets: sets.map((set) => ({
        displayType: set.displayType,
        directory: set.directory,
        files: GOOGLE_PLAY_SCREENSHOT_FILES,
      })),
      featureGraphic: {
        directory: featureGraphic.directory,
        file: featureGraphic.fileName,
      },
      nextStep: execute
        ? "Review the images, then commit and push only the Google Play screenshot files and manifests."
        : "Dry run only. Re-run with --execute true to stamp these exact screenshot sets.",
    },
    null,
    2,
  ),
);

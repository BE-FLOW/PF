import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  IOS_SCREENSHOT_FILES,
  sha256File,
  validateScreenshotFiles,
} from "./lib/ios-release-guard.mjs";
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
const source = args.get("--source") || "physical-iphone";
const qaConfirmation = args.get("--confirm-qa");
const screenshotDir = path.resolve(
  args.get("--dir") || path.join(mobileRoot, "store", "app-store", "iphone-6-7"),
);
const manifestPath = path.join(screenshotDir, "manifest.json");

if (!buildNumber) throw new Error("--build-number is required.");
const expectedQaConfirmation = `IOS_BUILD_${buildNumber}_QA_PASSED`;
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
const allowedPrefix = "apps/mobile/store/app-store/";
const unrelated = dirtyPaths.filter((file) => !file.startsWith(allowedPrefix));
if (unrelated.length) {
  throw new Error(`Unrelated uncommitted files: ${unrelated.join(", ")}.`);
}

const easBuild = findExactFinishedEasBuild(readEasBuilds(mobileRoot), {
  version: expo.version,
  buildNumber,
  platform: "ios",
});
if (easBuild.gitCommitHash !== head) {
  throw new Error(
    `EAS build ${buildNumber} was created from ${easBuild.gitCommitHash}, not current main ${head}.`,
  );
}
if (easBuild.buildProfile !== "production" || easBuild.distribution !== "STORE") {
  throw new Error(`EAS build ${buildNumber} is not a production store build.`);
}

const files = IOS_SCREENSHOT_FILES.map((fileName) => path.join(screenshotDir, fileName));
validateScreenshotFiles({ files, width: 1290, height: 2796 });

const completedAt = new Date(easBuild.completedAt ?? easBuild.updatedAt).getTime();
const staleFiles = files.filter(
  (file) => fs.statSync(file).mtimeMs < completedAt,
);
if (staleFiles.length) {
  throw new Error(
    `These screenshots predate EAS build ${buildNumber}: ${staleFiles
      .map((file) => path.basename(file))
      .join(", ")}. Capture the current app first.`,
  );
}

const manifest = {
  version: expo.version,
  buildNumber: String(buildNumber),
  gitCommit: easBuild.gitCommitHash,
  platform: "ios",
  displayType: "APP_IPHONE_67",
  width: 1290,
  height: 2796,
  capturedAt: new Date().toISOString(),
  source,
  qaConfirmedAt: new Date().toISOString(),
  qaConfirmation,
  files: Object.fromEntries(
    files.map((file) => [path.basename(file), sha256File(file)]),
  ),
};

if (execute) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      validated: true,
      execute,
      manifest: execute ? manifestPath : null,
      easBuild: {
        id: easBuild.id,
        version: easBuild.appVersion,
        buildNumber: easBuild.appBuildVersion,
        commit: easBuild.gitCommitHash,
        completedAt: easBuild.completedAt,
      },
      screenshots: IOS_SCREENSHOT_FILES,
      nextStep: execute
        ? "Review the images, then commit and push only the App Store screenshot files."
        : "Dry run only. Re-run with --execute true to stamp this exact screenshot set.",
    },
    null,
    2,
  ),
);

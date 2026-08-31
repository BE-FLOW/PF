import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  parseArgs,
} from "./lib/app-store-connect.mjs";
import {
  IOS_SCREENSHOT_FILES,
  sha256File,
  validateScreenshotFiles,
  validateScreenshotManifest,
} from "./lib/ios-release-guard.mjs";
import {
  findExactFinishedEasBuild,
  readCleanMain,
  readEasBuilds,
  verifyBuildCoversMain,
} from "./lib/release-source.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const require = createRequire(import.meta.url);
const expo = require(path.join(mobileRoot, "app.config.js")).expo;
const args = parseArgs();
const versionString = args.get("--version") || expo.version;
const appId = args.get("--app-id") || appStoreConnectDefaults.appId;
const screenshotDir = path.resolve(
  args.get("--screenshots") || path.join(mobileRoot, "store", "app-store", "iphone-6-7"),
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(screenshotDir, "manifest.json"), "utf8"),
);
const { request } = createAppStoreConnectClient({
  keyId: args.get("--key-id") || appStoreConnectDefaults.keyId,
  issuerId: args.get("--issuer-id") || appStoreConnectDefaults.issuerId,
});

const git = readCleanMain(repoRoot);
const versions = await request(`/v1/apps/${appId}/appStoreVersions?limit=20`);
const version = versions.data.find(
  (item) =>
    item.attributes.platform === "IOS" &&
    item.attributes.versionString === versionString,
);
if (!version) throw new Error(`App Store version ${versionString} was not found.`);

const storeBuild = (await request(`/v1/appStoreVersions/${version.id}/build`)).data;
if (!storeBuild) throw new Error(`App Store version ${versionString} has no build.`);
const buildNumber = String(storeBuild.attributes.version);
const easBuild = findExactFinishedEasBuild(readEasBuilds(mobileRoot), {
  version: versionString,
  buildNumber,
  buildProfile: "production",
  distribution: "STORE",
});
const source = verifyBuildCoversMain(repoRoot, easBuild, git.head);

const files = IOS_SCREENSHOT_FILES.map((fileName) => path.join(screenshotDir, fileName));
validateScreenshotFiles({ files, width: manifest.width, height: manifest.height });
validateScreenshotManifest(manifest, {
  version: versionString,
  buildNumber,
  gitCommit: source.buildCommit,
  displayType: "APP_IPHONE_67",
});
for (const file of files) {
  const fileName = path.basename(file);
  if (manifest.files[fileName] !== sha256File(file)) {
    throw new Error(`${fileName} changed after the screenshot manifest was stamped.`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      appStore: {
        version: versionString,
        state: version.attributes.appStoreState,
        buildNumber,
      },
      eas: {
        buildId: easBuild.id,
        commit: source.buildCommit,
        commitMessage: easBuild.gitCommitMessage,
      },
      git: {
        currentMain: git.head,
        releaseArtifactOnlyChanges: source.releaseArtifactOnly,
        changedAfterBuild: source.changedPaths,
      },
      screenshots: {
        buildNumber: manifest.buildNumber,
        capturedAt: manifest.capturedAt,
        source: manifest.source,
      },
    },
    null,
    2,
  ),
);

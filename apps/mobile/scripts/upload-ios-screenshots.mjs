import crypto from "node:crypto";
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
  assertEditableVersionState,
  IOS_SCREENSHOT_FILES,
  IOS_IAP_REVIEW_SCREENSHOT,
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
const appId = args.get("--app-id") || process.env.ASC_APP_ID || appStoreConnectDefaults.appId;
const keyId = args.get("--key-id") || appStoreConnectDefaults.keyId;
const issuerId = args.get("--issuer-id") || appStoreConnectDefaults.issuerId;
const locale = args.get("--locale") || "ko";
const versionString = args.get("--version") || expo.version;
const displayType = args.get("--display-type") || "APP_IPHONE_67";
const screenshotDir = path.resolve(
  args.get("--dir") || path.join(mobileRoot, "store", "app-store", "iphone-6-7"),
);
const manifestPath = path.join(screenshotDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const buildNumber = args.get("--build-number") || String(manifest.buildNumber);
const execute = args.get("--execute") === "true";
const { request } = createAppStoreConnectClient({ keyId, issuerId });

async function findVersion() {
  const response = await request(`/v1/apps/${appId}/appStoreVersions?limit=20`);
  const version = response.data.find(
    (item) =>
      item.attributes.platform === "IOS" &&
      item.attributes.versionString === versionString,
  );
  if (!version) throw new Error(`iOS App Store version ${versionString} was not found.`);
  return version;
}

async function findLocalization(versionId) {
  const response = await request(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=20`,
  );
  const localization = response.data.find((item) => item.attributes.locale === locale);
  if (!localization) throw new Error(`App Store localization ${locale} was not found.`);
  return localization;
}

async function findAssignedBuild(versionId) {
  const response = await request(`/v1/appStoreVersions/${versionId}/build`);
  if (!response.data) throw new Error("No build is assigned to the App Store version.");
  return response.data;
}

async function findScreenshotSet(localizationId) {
  const response = await request(
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=20`,
  );
  return response.data.find(
    (item) => item.attributes.screenshotDisplayType === displayType,
  ) ?? null;
}

async function createScreenshotSet(localizationId) {
  return (
    await request("/v1/appScreenshotSets", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: displayType },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: "appStoreVersionLocalizations", id: localizationId },
            },
          },
        },
      }),
    })
  ).data;
}

async function reserveScreenshot(setId, fileName, fileSize) {
  return (
    await request("/v1/appScreenshots", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appScreenshots",
          attributes: { fileName, fileSize },
          relationships: {
            appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } },
          },
        },
      }),
    })
  ).data;
}

async function uploadOperation(operation, data) {
  const headers = Object.fromEntries(
    (operation.requestHeaders ?? [])
      .filter((header) => header.name && header.value)
      .map((header) => [header.name, header.value]),
  );
  const offset = Number(operation.offset);
  const length = Number(operation.length);
  const response = await fetch(operation.url, {
    method: operation.method,
    headers,
    body: data.subarray(offset, offset + length),
  });
  if (!response.ok) {
    throw new Error(`Screenshot upload failed: ${response.status} ${response.statusText}.`);
  }
}

async function uploadScreenshot(setId, filePath) {
  const data = fs.readFileSync(filePath);
  const screenshot = await reserveScreenshot(
    setId,
    path.basename(filePath),
    data.length,
  );
  for (const operation of screenshot.attributes.uploadOperations ?? []) {
    await uploadOperation(operation, data);
  }
  await request(`/v1/appScreenshots/${screenshot.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appScreenshots",
        id: screenshot.id,
        attributes: {
          sourceFileChecksum: crypto.createHash("md5").update(data).digest("hex"),
          uploaded: true,
        },
      },
    }),
  });
  return screenshot.id;
}

async function waitForComplete(setId, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await request(`/v1/appScreenshotSets/${setId}/appScreenshots?limit=10`);
    if (
      response.data.length === IOS_SCREENSHOT_FILES.length &&
      response.data.every(
        (item) => item.attributes.assetDeliveryState?.state === "COMPLETE",
      )
    ) {
      return response.data;
    }
    const failed = response.data.find(
      (item) => item.attributes.assetDeliveryState?.state === "FAILED",
    );
    if (failed) throw new Error(`App Store rejected ${failed.attributes.fileName}.`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Timed out waiting for App Store screenshot processing.");
}

const git = readCleanMain(repoRoot);
const easBuild = findExactFinishedEasBuild(readEasBuilds(mobileRoot), {
  version: versionString,
  buildNumber,
});
const source = verifyBuildCoversMain(repoRoot, easBuild, git.head);
const files = IOS_SCREENSHOT_FILES.map((fileName) => path.join(screenshotDir, fileName));
validateScreenshotFiles({ files, width: manifest.width, height: manifest.height });
validateScreenshotManifest(manifest, {
  version: versionString,
  buildNumber,
  gitCommit: source.buildCommit,
  displayType,
});
for (const file of files) {
  const fileName = path.basename(file);
  if (manifest.files[fileName] !== sha256File(file)) {
    throw new Error(`${fileName} changed after the screenshot manifest was stamped.`);
  }
}
const iapReviewFile = path.join(mobileRoot, IOS_IAP_REVIEW_SCREENSHOT);
if (manifest.iapReviewScreenshot.sha256 !== sha256File(iapReviewFile)) {
  throw new Error("The iOS purchase review image changed after manifest stamping.");
}

const version = await findVersion();
assertEditableVersionState(version.attributes.appStoreState);
const assignedBuild = await findAssignedBuild(version.id);
if (String(assignedBuild.attributes.version) !== String(buildNumber)) {
  throw new Error(
    `App Store version uses build ${assignedBuild.attributes.version}, not ${buildNumber}.`,
  );
}
const localization = await findLocalization(version.id);
const existingSet = await findScreenshotSet(localization.id);

let uploaded = [];
let setId = existingSet?.id ?? null;
if (execute) {
  if (existingSet) {
    await request(`/v1/appScreenshotSets/${existingSet.id}`, { method: "DELETE" });
  }
  const set = await createScreenshotSet(localization.id);
  setId = set.id;
  for (const file of files) await uploadScreenshot(set.id, file);
  uploaded = await waitForComplete(set.id);
}

console.log(
  JSON.stringify(
    {
      validated: true,
      execute,
      version: versionString,
      buildNumber,
      gitCommit: source.buildCommit,
      releaseArtifactOnlyChanges: source.releaseArtifactOnly,
      screenshots: execute
        ? uploaded.map((item) => ({
            id: item.id,
            fileName: item.attributes.fileName,
            state: item.attributes.assetDeliveryState.state,
          }))
        : IOS_SCREENSHOT_FILES,
      setId,
      nextStep: execute
        ? "All screenshots are complete in App Store Connect."
        : "Dry run only. Re-run with --execute true to replace the remote screenshot set.",
    },
    null,
    2,
  ),
);

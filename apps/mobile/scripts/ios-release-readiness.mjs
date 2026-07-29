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
  IOS_IAP_REVIEW_SCREENSHOT,
  md5File,
  sha256File,
  validateRemoteScreenshotAssets,
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
const versionString = args.get("--version") || expo.version;
const screenshotDir = path.resolve(
  args.get("--screenshots") || path.join(mobileRoot, "store", "app-store", "iphone-6-7"),
);
const manifestPath = path.join(screenshotDir, "manifest.json");
let manifest = null;
let manifestError = null;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  manifestError = error;
}
const targetBuild =
  args.get("--build-number") ||
  (manifest?.buildNumber === undefined ? null : String(manifest.buildNumber));
const { request } = createAppStoreConnectClient({
  keyId: args.get("--key-id") || appStoreConnectDefaults.keyId,
  issuerId: args.get("--issuer-id") || appStoreConnectDefaults.issuerId,
});

const checks = [];
const blockers = [];
const context = { version: versionString, targetBuild };

if (manifestError) {
  blockers.push(
    `스크린샷 manifest: ${manifestError instanceof Error ? manifestError.message : String(manifestError)}`,
  );
}
if (!targetBuild) blockers.push("대상 iOS 빌드 번호가 없습니다.");

async function check(label, action) {
  try {
    const value = await action();
    checks.push(label);
    return value;
  } catch (error) {
    blockers.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const git = await check("Git main 동기화", () => readCleanMain(repoRoot));
const easBuild = targetBuild
  ? await check("정확한 EAS iOS 빌드", () =>
      findExactFinishedEasBuild(readEasBuilds(mobileRoot), {
        version: versionString,
        buildNumber: targetBuild,
      }),
    )
  : null;
const source =
  git && easBuild
    ? await check("빌드 이후 앱 코드 불변", () =>
        verifyBuildCoversMain(repoRoot, easBuild, git.head),
      )
    : null;

await check("현재 빌드 스크린샷", () => {
  if (!manifest) throw new Error("Screenshot manifest is unavailable.");
  if (!source) throw new Error("Build source validation did not pass.");
  const files = IOS_SCREENSHOT_FILES.map((fileName) => path.join(screenshotDir, fileName));
  validateScreenshotFiles({ files, width: manifest.width, height: manifest.height });
  validateScreenshotManifest(manifest, {
    version: versionString,
    buildNumber: targetBuild,
    gitCommit: source.buildCommit,
    displayType: "APP_IPHONE_67",
  });
  for (const file of files) {
    const fileName = path.basename(file);
    if (manifest.files[fileName] !== sha256File(file)) {
      throw new Error(`${fileName} does not match its stamped hash.`);
    }
  }
  const iapReviewFile = path.join(mobileRoot, IOS_IAP_REVIEW_SCREENSHOT);
  if (manifest.iapReviewScreenshot.sha256 !== sha256File(iapReviewFile)) {
    throw new Error("The iOS purchase review image does not match its stamped hash.");
  }
  context.screenshotsCapturedAt = manifest.capturedAt;
  context.qaConfirmedAt = manifest.qaConfirmedAt;
});

const version = await check("App Store 버전", async () => {
  const response = await request(`/v1/apps/${appId}/appStoreVersions?limit=20`);
  const item = response.data.find(
    (candidate) =>
      candidate.attributes.platform === "IOS" &&
      candidate.attributes.versionString === versionString,
  );
  if (!item) throw new Error(`Version ${versionString} was not found.`);
  context.appStoreState = item.attributes.appStoreState;
  return item;
});

const assignedBuild = version
  ? await check("App Store 선택 빌드", async () => {
      const response = await request(`/v1/appStoreVersions/${version.id}/build`);
      if (!response.data) throw new Error("No build is assigned.");
      if (String(response.data.attributes.version) !== String(targetBuild)) {
        throw new Error(
          `Assigned build ${response.data.attributes.version} does not match ${targetBuild}.`,
        );
      }
      return response.data;
    })
  : null;

if (version && version.attributes.appStoreState === "PENDING_DEVELOPER_RELEASE") {
  if (!assignedBuild || !source || assignedBuild.attributes.version !== targetBuild) {
    blockers.push("승인된 이전 버전을 철회한 뒤 새 빌드를 선택해야 합니다.");
  }
}

await check("App Store 스크린샷 처리 완료", async () => {
  if (!version) throw new Error("App Store version is unavailable.");
  const localizations = await request(
    `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=20`,
  );
  const localization = localizations.data.find((item) => item.attributes.locale === "ko");
  if (!localization) throw new Error("Korean localization is missing.");
  const sets = await request(
    `/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets?limit=20`,
  );
  const set = sets.data.find(
    (item) => item.attributes.screenshotDisplayType === "APP_IPHONE_67",
  );
  if (!set) throw new Error("6.7-inch iPhone screenshot set is missing.");
  const screenshots = await request(
    `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=10`,
  );
  const checksums = Object.fromEntries(
    IOS_SCREENSHOT_FILES.map((fileName) => [
      fileName,
      md5File(path.join(screenshotDir, fileName)),
    ]),
  );
  validateRemoteScreenshotAssets(screenshots.data, {
    checksums,
    width: manifest?.width ?? 1290,
    height: manifest?.height ?? 2796,
  });
  context.remoteScreenshotCount = screenshots.data.length;
});

await check("iOS 인앱결제 상품", async () => {
  const query = new URLSearchParams({
    "filter[productId]": "petflow_ai_summary_1",
    limit: "10",
  });
  const response = await request(`/v1/apps/${appId}/inAppPurchasesV2?${query}`);
  const purchase = response.data[0];
  if (!purchase) throw new Error("petflow_ai_summary_1 is missing.");
  if (purchase.attributes.inAppPurchaseType !== "CONSUMABLE") {
    throw new Error(`Unexpected type ${purchase.attributes.inAppPurchaseType}.`);
  }
  if (![
    "READY_TO_SUBMIT",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "APPROVED",
  ].includes(purchase.attributes.state)) {
    throw new Error(`Product state is ${purchase.attributes.state}.`);
  }
  const versions = await request(`/v2/inAppPurchases/${purchase.id}/versions?limit=50`);
  if (!versions.data.length) throw new Error("In-app purchase metadata version is missing.");
  const reviewScreenshot = await request(
    `/v2/inAppPurchases/${purchase.id}/appStoreReviewScreenshot`,
  );
  if (reviewScreenshot.data?.attributes?.assetDeliveryState?.state !== "COMPLETE") {
    throw new Error("In-app purchase review screenshot is not complete.");
  }
  const iapReviewFile = path.join(mobileRoot, IOS_IAP_REVIEW_SCREENSHOT);
  if (reviewScreenshot.data.attributes.sourceFileChecksum !== md5File(iapReviewFile)) {
    throw new Error("The remote purchase review screenshot is not from this build.");
  }
  const prices = await request(
    `/v1/inAppPurchasePriceSchedules/${purchase.id}/manualPrices?limit=50`,
  );
  if (!prices.data.length) throw new Error("In-app purchase price is missing.");
  context.inAppPurchaseState = purchase.attributes.state;
});

await check("운영 서버", async () => {
  const response = await fetch("https://pf-two-eta.vercel.app/api/health", {
    cache: "no-store",
  });
  const health = await response.json();
  if (
    !response.ok ||
    health.status !== "ok" ||
    health.database !== "connected" ||
    health.billing !== "configured"
  ) {
    throw new Error(JSON.stringify(health));
  }
  context.serverVersion = health.version;
});

console.log(
  JSON.stringify(
    {
      ok: blockers.length === 0,
      checks,
      blockers,
      context,
      manualFinalStep:
        "The first in-app purchase must be selected with this app version and submitted on appstoreconnect.apple.com.",
    },
    null,
    2,
  ),
);
if (blockers.length) process.exitCode = 1;

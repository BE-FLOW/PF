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
  selectExactValidBuild,
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

const metadata = {
  description: `PetFlow는 보호자가 반려동물의 식욕, 활력, 증상과 병원에서 들은 안내를 짧게 기록하고 다음 상담에 보여주기 좋게 정리하는 앱입니다.

짧은 글과 사진·영상으로 관찰을 남기면 기록이 날짜순 건강 흐름에 자동으로 연결됩니다. 필요한 기간을 골라 병원에 전달할 사실 요약을 만들 수 있습니다.

주요 기능
- 계정 기반 반려동물 관리
- 날짜별 건강 기록과 사진·영상 첨부
- 예방접종 기록과 다음 접종일 관리
- 병원에 보여줄 건강 흐름과 사실 요약
- 첫 1회 무료 AI 병원 전달 요약
- 인앱결제로 한 번씩 추가하는 AI 요약
- 기록 수정·삭제와 즉시 계정 탈퇴

PetFlow는 진단이나 처방을 제공하지 않습니다. AI 요약은 로그인 사용자가 고른 기록을 정리한 수의사 검토용 초안이며, 수의사의 확인을 대신하지 않습니다.`,
  keywords:
    "반려동물,강아지,고양이,건강기록,병원공유,진료메모,펫케어,건강흐름,예방접종,사진기록",
  marketingUrl: "https://pf-two-eta.vercel.app",
  promotionalText:
    "관찰한 변화를 짧게 남기고, 병원에 보여줄 건강 흐름과 사실 요약으로 정리해요.",
  supportUrl: "https://pf-two-eta.vercel.app",
};

const appInfoMetadata = {
  subtitle: "반려동물 건강 기록과 병원 공유",
  privacyPolicyUrl: "https://pf-two-eta.vercel.app/privacy",
};

const reviewNotes = `PetFlow provides one complimentary AI Hospital Summary per account. Additional summaries are sold only through Apple's consumable in-app purchase "AI Hospital Summary - 1 Use". It is not a subscription and does not renew.

There is no participation code, redeemable code, account tier, or external checkout in the iOS app. Each completed Apple transaction is verified by the server before one summary credit is granted. "Check Payment Status" refreshes delayed transaction delivery for the signed-in PetFlow account; it does not grant access from a client-side flag.

Review steps:
1. Sign in with the review account in App Review Information.
2. Add or select a pet and save a health record.
3. Open Health Flow and select records in the calendar.
4. Tap AI Hospital Summary. The first use is complimentary.
5. After the complimentary use, the app displays the localized App Store price before presenting Apple's purchase sheet.

The AI output is clearly labeled as an unreviewed draft. It organizes only the owner's observations and does not provide diagnosis, prescriptions, medication names, dosage, or treatment plans. Original records, editing, deletion, and basic sharing remain available without a purchase.`;

const args = parseArgs();
const appId = args.get("--app-id") || process.env.ASC_APP_ID || appStoreConnectDefaults.appId;
const keyId = args.get("--key-id") || appStoreConnectDefaults.keyId;
const issuerId = args.get("--issuer-id") || appStoreConnectDefaults.issuerId;
const locale = args.get("--locale") || "ko";
const versionString = args.get("--version") || expo.version;
const execute = args.get("--execute") === "true";
const screenshotDir = path.resolve(
  args.get("--screenshots") || path.join(mobileRoot, "store", "app-store", "iphone-6-7"),
);
const manifestPath = path.join(screenshotDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const buildNumber = args.get("--build-number") || String(manifest.buildNumber);
const { request } = createAppStoreConnectClient({ keyId, issuerId });

function screenshotFiles() {
  return IOS_SCREENSHOT_FILES.map((fileName) => path.join(screenshotDir, fileName));
}

function verifyLocalScreenshots(expectedCommit) {
  const files = screenshotFiles();
  validateScreenshotFiles({
    files,
    width: manifest.width,
    height: manifest.height,
  });
  validateScreenshotManifest(manifest, {
    version: versionString,
    buildNumber,
    gitCommit: expectedCommit,
    displayType: "APP_IPHONE_67",
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
  return files;
}

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

async function findBuild() {
  const response = await request(
    `/v1/builds?filter[app]=${encodeURIComponent(appId)}&limit=200&sort=-uploadedDate`,
  );
  return selectExactValidBuild(response.data, buildNumber);
}

async function findLocalization(versionId) {
  const response = await request(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=20`,
  );
  const localization = response.data.find((item) => item.attributes.locale === locale);
  if (localization || !execute) return localization;
  return (
    await request("/v1/appStoreVersionLocalizations", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "appStoreVersionLocalizations",
          attributes: { locale },
          relationships: {
            appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
          },
        },
      }),
    })
  ).data;
}

async function findAppInfoLocalization() {
  const appInfos = await request(`/v1/apps/${appId}/appInfos?limit=10`);
  const appInfo = appInfos.data[0];
  if (!appInfo) throw new Error("No App Store app info found.");
  const response = await request(
    `/v1/appInfos/${appInfo.id}/appInfoLocalizations?limit=20`,
  );
  const localization = response.data.find((item) => item.attributes.locale === locale);
  if (!localization) throw new Error(`No app info localization found for ${locale}.`);
  return localization;
}

async function findReviewDetail(versionId) {
  const response = await request(`/v1/appStoreVersions/${versionId}/appStoreReviewDetail`);
  if (!response?.data?.id) throw new Error("No App Store review detail found.");
  return response.data;
}

async function verifyInAppPurchase() {
  const query = new URLSearchParams({
    "filter[productId]": "petflow_ai_summary_1",
    limit: "10",
  });
  const response = await request(`/v1/apps/${appId}/inAppPurchasesV2?${query}`);
  const purchase = response.data[0];
  if (!purchase) throw new Error("The iOS AI summary in-app purchase is missing.");
  if (purchase.attributes.inAppPurchaseType !== "CONSUMABLE") {
    throw new Error("The iOS AI summary product must be consumable.");
  }
  if (![
    "READY_TO_SUBMIT",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "APPROVED",
  ].includes(purchase.attributes.state)) {
    throw new Error(`The iOS in-app purchase is ${purchase.attributes.state}.`);
  }
  return purchase;
}

async function patchResource(pathname, type, id, attributes) {
  return (
    await request(pathname, {
      method: "PATCH",
      body: JSON.stringify({ data: { type, id, attributes } }),
    })
  ).data;
}

const git = readCleanMain(repoRoot);
const easBuild = findExactFinishedEasBuild(readEasBuilds(mobileRoot), {
  version: versionString,
  buildNumber,
});
const source = verifyBuildCoversMain(repoRoot, easBuild, git.head);
verifyLocalScreenshots(source.buildCommit);

const app = await request(`/v1/apps/${appId}`);
const version = await findVersion();
assertEditableVersionState(version.attributes.appStoreState);
const build = await findBuild();
const localization = await findLocalization(version.id);
const appInfoLocalization = await findAppInfoLocalization();
const reviewDetail = await findReviewDetail(version.id);
const purchase = await verifyInAppPurchase();

if (execute) {
  if (!localization) throw new Error(`Could not create App Store localization ${locale}.`);
  await request(`/v1/appStoreVersions/${version.id}/relationships/build`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "builds", id: build.id } }),
  });
  await patchResource(
    `/v1/appStoreVersionLocalizations/${localization.id}`,
    "appStoreVersionLocalizations",
    localization.id,
    metadata,
  );
  await patchResource(
    `/v1/appInfoLocalizations/${appInfoLocalization.id}`,
    "appInfoLocalizations",
    appInfoLocalization.id,
    appInfoMetadata,
  );
  await patchResource(
    `/v1/appStoreReviewDetails/${reviewDetail.id}`,
    "appStoreReviewDetails",
    reviewDetail.id,
    { notes: reviewNotes },
  );
}

console.log(
  JSON.stringify(
    {
      validated: true,
      execute,
      app: {
        id: app.data.id,
        name: app.data.attributes.name,
        bundleId: app.data.attributes.bundleId,
      },
      version: {
        id: version.id,
        versionString,
        state: version.attributes.appStoreState,
      },
      build: {
        id: build.id,
        buildNumber,
        easBuildId: easBuild.id,
        gitCommit: source.buildCommit,
        releaseArtifactOnlyChanges: source.releaseArtifactOnly,
      },
      screenshots: {
        manifest: manifestPath,
        count: IOS_SCREENSHOT_FILES.length,
        capturedAt: manifest.capturedAt,
      },
      inAppPurchase: {
        id: purchase.id,
        productId: purchase.attributes.productId,
        state: purchase.attributes.state,
      },
      nextStep: execute
        ? "Upload the validated screenshots, then add the first in-app purchase and submit through App Store Connect."
        : "Dry run only. Re-run with --execute true after reviewing this exact target.",
    },
    null,
    2,
  ),
);

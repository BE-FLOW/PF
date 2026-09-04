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
const listingPath = path.join(mobileRoot, "store", "ko-KR", "listing.md");
const listingSource = fs.readFileSync(listingPath, "utf8");

function listingSection(title) {
  const heading = `## ${title}`;
  const headingStart = listingSource.indexOf(heading);
  const bodyStart = listingSource.indexOf("\n", headingStart) + 1;
  const nextHeading = listingSource.indexOf("\n## ", bodyStart);
  const value =
    headingStart >= 0 && bodyStart > 0
      ? listingSource.slice(
          bodyStart,
          nextHeading >= 0 ? nextHeading : listingSource.length,
        ).trim()
      : "";
  if (!value) {
    throw new Error(`Store listing section ${title} is missing.`);
  }
  return value;
}

const listingDescription = listingSection("설명");
const listingFeatures = listingSection("주요 기능");

const metadata = {
  description: `${listingDescription}\n\n주요 기능\n${listingFeatures}`,
  keywords: listingSection("키워드 후보").replace(/\s+/g, ""),
  marketingUrl: listingSection("지원 URL"),
  promotionalText: listingSection("한 줄 소개").replace(/\s+/g, " "),
  supportUrl: listingSection("지원 URL"),
};

const appInfoMetadata = {
  subtitle: listingSection("부제목 / 짧은 설명").replace(/\s+/g, " "),
  privacyPolicyUrl: listingSection("개인정보 처리방침 URL"),
};

const reviewNotes = `PetFlow is completely free in this release. The app does not initialize an in-app purchase SDK, query products, show prices, or provide purchase or restore controls. There is no external checkout, participation code, redeemable code, or paid account tier.

Signed-in users can create AI Hospital Summaries within a server-enforced daily fair-use limit. The app shows today's remaining uses and the exact reset time. Reaching the limit never blocks original records or the basic factual summary and sharing flow.

Review steps:
1. Sign in with the review account in App Review Information.
2. Add or select a pet and save a health record.
3. Optionally add vaccination, monthly preventive-care, or factual test records from the pet profile.
4. Open the 전달본 tab and select records in the calendar.
5. Tap 무료 병원 전달본 만들기 to create and share the free draft.

The AI output is clearly labeled as an unreviewed draft. AI only prioritizes server-generated factual observation lines and never invents diagnoses, prescriptions, medication names, dosage, or treatment plans. Test records and owner-reported hospital guidance remain factual records and are never presented as veterinarian-confirmed conclusions.`;

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
  buildProfile: "production",
  distribution: "STORE",
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
      nextStep: execute
        ? "Upload the validated screenshots, then submit the free build through App Store Connect."
        : "Dry run only. Re-run with --execute true after reviewing this exact target.",
    },
    null,
    2,
  ),
);

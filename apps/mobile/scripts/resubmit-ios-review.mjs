import fs from "node:fs";
import path from "node:path";
import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const defaults = {
  appId: appStoreConnectDefaults.appId,
  keyId: appStoreConnectDefaults.keyId,
  issuerId: appStoreConnectDefaults.issuerId,
  locale: "ko",
  versionString: "1.0",
  displayType: "APP_IPHONE_67",
  screenshotDir: path.join("store", "app-store", "iphone-6-7"),
};

const args = parseArgs();
const appId = args.get("--app-id") || process.env.ASC_APP_ID || defaults.appId;
const keyId = args.get("--key-id") || defaults.keyId;
const issuerId = args.get("--issuer-id") || defaults.issuerId;
const locale = args.get("--locale") || defaults.locale;
const versionString = args.get("--version") || defaults.versionString;
const displayType = args.get("--display-type") || defaults.displayType;
const screenshotDir = path.resolve(args.get("--dir") || defaults.screenshotDir);
const execute = args.get("--execute") === "true";
const manifestPath = path.join(screenshotDir, "manifest.json");

const { request } = createAppStoreConnectClient({ keyId, issuerId });

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Screenshot manifest not found: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
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

async function findAssignedBuild(versionId) {
  const response = await request(`/v1/appStoreVersions/${versionId}/build`);
  if (!response.data) throw new Error("No build is assigned to the App Store version.");
  return response.data;
}

async function findLocalization(versionId) {
  const response = await request(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=20`,
  );
  const localization = response.data.find((item) => item.attributes.locale === locale);
  if (!localization) throw new Error(`App Store localization ${locale} was not found.`);
  return localization;
}

async function verifyRemoteScreenshots(localizationId) {
  const sets = await request(
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=20`,
  );
  const set = sets.data.find(
    (item) => item.attributes.screenshotDisplayType === displayType,
  );
  if (!set) throw new Error(`Remote screenshot set ${displayType} was not found.`);

  const screenshots = await request(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=10`);
  if (!screenshots.data.length) throw new Error("The remote screenshot set is empty.");

  const incomplete = screenshots.data.filter(
    (item) => item.attributes.assetDeliveryState?.state !== "COMPLETE",
  );
  if (incomplete.length) {
    throw new Error(
      `Remote screenshots are not ready: ${incomplete
        .map((item) => item.attributes.fileName)
        .join(", ")}`,
    );
  }

  return { set, screenshots: screenshots.data };
}

async function findUnresolvedSubmission(versionId) {
  const submissions = await request(`/v1/apps/${appId}/reviewSubmissions?limit=20`);
  const unresolved = submissions.data.filter(
    (item) => item.attributes.state === "UNRESOLVED_ISSUES",
  );
  if (unresolved.length !== 1) {
    throw new Error(`Expected one unresolved submission; found ${unresolved.length}.`);
  }

  const submission = unresolved[0];
  const response = await request(
    `/v1/reviewSubmissions/${submission.id}/items?limit=50&include=appStoreVersion`,
  );
  const actionableItems = response.data.filter((item) =>
    ["REJECTED", "READY_FOR_REVIEW"].includes(item.attributes.state),
  );
  if (actionableItems.length !== 1) {
    throw new Error(`Expected one actionable item; found ${actionableItems.length}.`);
  }

  const item = actionableItems[0];
  if (item.relationships.appStoreVersion?.data?.id !== versionId) {
    throw new Error("The rejected item does not target the expected App Store version.");
  }
  return { submission, item };
}

async function poll(pathname, acceptedStates, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await request(pathname);
    if (acceptedStates.includes(response.data.attributes.state)) return response.data;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`Timed out waiting for ${acceptedStates.join(" or ")}.`);
}

async function pollSubmissionItem(submissionId, itemId, acceptedStates, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await request(
      `/v1/reviewSubmissions/${submissionId}/items?limit=50`,
    );
    const item = response.data.find((candidate) => candidate.id === itemId);
    if (item && acceptedStates.includes(item.attributes.state)) return item;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`Timed out waiting for review item ${acceptedStates.join(" or ")}.`);
}

const manifest = readManifest();
const app = await request(`/v1/apps/${appId}`);
const version = await findVersion();
const build = await findAssignedBuild(version.id);
const localization = await findLocalization(version.id);
const { set, screenshots } = await verifyRemoteScreenshots(localization.id);
const { submission, item } = await findUnresolvedSubmission(version.id);

if (String(manifest.version) !== version.attributes.versionString) {
  throw new Error("The screenshot manifest version does not match the App Store version.");
}
if (String(manifest.buildNumber) !== String(build.attributes.version)) {
  throw new Error("The screenshot manifest build does not match the assigned build.");
}
if (manifest.displayType !== displayType) {
  throw new Error("The screenshot manifest display type does not match the remote set.");
}

const target = {
  app: { id: app.data.id, name: app.data.attributes.name },
  version: {
    id: version.id,
    versionString: version.attributes.versionString,
    state: version.attributes.appStoreState,
  },
  build: { id: build.id, buildNumber: build.attributes.version },
  screenshots: {
    setId: set.id,
    displayType,
    count: screenshots.length,
    files: screenshots.map((screenshot) => screenshot.attributes.fileName).sort(),
  },
  submission: { id: submission.id, state: submission.attributes.state },
  item: { id: item.id, state: item.attributes.state },
};

if (!execute) {
  console.log(JSON.stringify({ validated: true, execute: false, target }, null, 2));
  process.exit(0);
}

if (item.attributes.state === "REJECTED") {
  await request(`/v1/reviewSubmissionItems/${item.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissionItems",
        id: item.id,
        attributes: { resolved: true },
      },
    }),
  });
}

const readyItem = await pollSubmissionItem(
  submission.id,
  item.id,
  ["READY_FOR_REVIEW"],
);

await request(`/v1/reviewSubmissions/${submission.id}`, {
  method: "PATCH",
  body: JSON.stringify({
    data: {
      type: "reviewSubmissions",
      id: submission.id,
      attributes: { submitted: true },
    },
  }),
});

const submitted = await poll(
  `/v1/reviewSubmissions/${submission.id}`,
  ["WAITING_FOR_REVIEW", "IN_REVIEW"],
);

console.log(
  JSON.stringify(
    {
      submitted: true,
      target,
      final: {
        itemState: readyItem.attributes.state,
        submissionState: submitted.attributes.state,
        submittedDate: submitted.attributes.submittedDate,
      },
    },
    null,
    2,
  ),
);

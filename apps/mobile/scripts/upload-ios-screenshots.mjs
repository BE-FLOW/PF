import crypto from "node:crypto";
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
  screenshotDisplayType: "APP_IPHONE_67",
  screenshotDir: path.join("store", "app-store", "iphone-6-7"),
};

const args = parseArgs();

const appId = args.get("--app-id") || process.env.ASC_APP_ID || defaults.appId;
const keyId = args.get("--key-id") || defaults.keyId;
const issuerId = args.get("--issuer-id") || defaults.issuerId;
const locale = args.get("--locale") || defaults.locale;
const versionString = args.get("--version") || defaults.versionString;
const screenshotDisplayType =
  args.get("--display-type") || defaults.screenshotDisplayType;
const screenshotDir = path.resolve(args.get("--dir") || defaults.screenshotDir);

const { request } = createAppStoreConnectClient({ keyId, issuerId });

async function findAppStoreVersion() {
  const response = await request(`/v1/apps/${appId}/appStoreVersions?limit=10`);
  const version =
    response.data.find((item) => item.attributes.versionString === versionString) ??
    response.data.find((item) => item.attributes.appStoreState === "PREPARE_FOR_SUBMISSION");
  if (!version) throw new Error(`No App Store version found for ${versionString}.`);
  return version;
}

async function findLocalization(versionId) {
  const response = await request(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=20`,
  );
  const localization = response.data.find((item) => item.attributes.locale === locale);
  if (!localization) throw new Error(`No localization found for ${locale}. Run prepare:ios:app-store first.`);
  return localization;
}

async function deleteExistingSet(localizationId) {
  const response = await request(
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=20`,
  );
  const existing = response.data.find(
    (item) => item.attributes.screenshotDisplayType === screenshotDisplayType,
  );
  if (!existing) return null;

  await request(`/v1/appScreenshotSets/${existing.id}`, { method: "DELETE" });
  return existing.id;
}

async function createScreenshotSet(localizationId) {
  const response = await request("/v1/appScreenshotSets", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId },
          },
        },
      },
    }),
  });
  return response.data;
}

async function reserveScreenshot(setId, fileName, fileSize) {
  const response = await request("/v1/appScreenshots", {
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
  });
  return response.data;
}

async function uploadOperation(operation, data) {
  const headers = {};
  for (const header of operation.requestHeaders ?? []) {
    if (header.name && header.value) headers[header.name] = header.value;
  }
  const offset = Number(operation.offset);
  const length = Number(operation.length);
  const chunk = data.subarray(offset, offset + length);
  const response = await fetch(operation.url, {
    method: operation.method,
    headers,
    body: chunk,
  });
  if (!response.ok) {
    throw new Error(`Screenshot chunk upload failed: ${response.status} ${response.statusText}`);
  }
}

async function commitScreenshot(screenshotId, data) {
  const checksum = crypto.createHash("md5").update(data).digest("hex");
  await request(`/v1/appScreenshots/${screenshotId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appScreenshots",
        id: screenshotId,
        attributes: {
          sourceFileChecksum: checksum,
          uploaded: true,
        },
      },
    }),
  });
}

async function uploadScreenshot(setId, filePath) {
  const data = fs.readFileSync(filePath);
  const reservation = await reserveScreenshot(setId, path.basename(filePath), data.length);
  const operations = reservation.attributes.uploadOperations ?? [];
  for (const operation of operations) {
    await uploadOperation(operation, data);
  }
  await commitScreenshot(reservation.id, data);
  return {
    id: reservation.id,
    fileName: path.basename(filePath),
    fileSize: data.length,
  };
}

const files = fs
  .readdirSync(screenshotDir)
  .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
  .sort()
  .map((fileName) => path.join(screenshotDir, fileName));

if (!files.length) throw new Error(`No PNG screenshots found in ${screenshotDir}.`);

const version = await findAppStoreVersion();
const localization = await findLocalization(version.id);
const deletedSetId = await deleteExistingSet(localization.id);
const set = await createScreenshotSet(localization.id);
const uploaded = [];

for (const file of files) {
  uploaded.push(await uploadScreenshot(set.id, file));
}

console.log(
  JSON.stringify(
    {
      version: version.attributes.versionString,
      locale,
      screenshotDisplayType,
      replacedSet: deletedSetId,
      setId: set.id,
      uploaded,
    },
    null,
    2,
  ),
);

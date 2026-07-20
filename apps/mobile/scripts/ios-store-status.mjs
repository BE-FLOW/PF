import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  hasStatus,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const args = parseArgs();
const appId = args.get("--app-id") || process.env.ASC_APP_ID || appStoreConnectDefaults.appId;
const versionString = args.get("--version") || "1.0";
const keyId = args.get("--key-id") || appStoreConnectDefaults.keyId;
const issuerId = args.get("--issuer-id") || appStoreConnectDefaults.issuerId;
const { request } = createAppStoreConnectClient({ keyId, issuerId });

const app = await request(`/v1/apps/${appId}`);
const versions = await request(`/v1/apps/${appId}/appStoreVersions?limit=20`);
const version = versions.data.find(
  (item) => item.attributes.versionString === versionString,
);

if (!version) {
  throw new Error(`App Store version ${versionString} was not found.`);
}

let build = null;
try {
  const response = await request(`/v1/appStoreVersions/${version.id}/build`);
  build = response.data;
} catch (error) {
  if (!hasStatus(error, 404)) throw error;
}

console.log(
  JSON.stringify(
    {
      app: {
        id: app.data.id,
        name: app.data.attributes.name,
        bundleId: app.data.attributes.bundleId,
      },
      version: {
        id: version.id,
        versionString: version.attributes.versionString,
        state: version.attributes.appStoreState,
        releaseType: version.attributes.releaseType,
        earliestReleaseDate: version.attributes.earliestReleaseDate,
      },
      build: build
        ? {
            id: build.id,
            buildNumber: build.attributes.version,
            processingState: build.attributes.processingState,
            uploadedDate: build.attributes.uploadedDate,
          }
        : null,
    },
    null,
    2,
  ),
);

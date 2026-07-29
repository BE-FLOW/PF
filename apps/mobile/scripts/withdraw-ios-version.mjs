import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  hasStatus,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const args = parseArgs();
const appId = args.get("--app-id") || process.env.ASC_APP_ID || appStoreConnectDefaults.appId;
const versionString = args.get("--version") || "1.0";
const expectedBuild = args.get("--expected-build");
const execute = args.get("--execute") === "true";
const confirmation = args.get("--confirm");
const { request } = createAppStoreConnectClient({
  keyId: args.get("--key-id") || appStoreConnectDefaults.keyId,
  issuerId: args.get("--issuer-id") || appStoreConnectDefaults.issuerId,
});

if (!expectedBuild) throw new Error("--expected-build is required.");

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

async function assignedBuild(versionId) {
  const response = await request(`/v1/appStoreVersions/${versionId}/build`);
  return response.data;
}

async function submission(versionId) {
  try {
    return (
      await request(`/v1/appStoreVersions/${versionId}/appStoreVersionSubmission`)
    ).data;
  } catch (error) {
    if (hasStatus(error, 404)) return null;
    throw error;
  }
}

async function waitForDeveloperRejected(versionId, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await request(`/v1/appStoreVersions/${versionId}`);
    if (response.data.attributes.appStoreState === "DEVELOPER_REJECTED") {
      return response.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Timed out waiting for DEVELOPER_REJECTED.");
}

const version = await findVersion();
const build = await assignedBuild(version.id);
if (!build || String(build.attributes.version) !== String(expectedBuild)) {
  throw new Error(
    `Assigned build is ${build?.attributes?.version ?? "none"}, not ${expectedBuild}.`,
  );
}

const state = version.attributes.appStoreState;
if (state === "DEVELOPER_REJECTED") {
  console.log(
    JSON.stringify({ execute, alreadyWithdrawn: true, version: versionString, build: expectedBuild }, null, 2),
  );
  process.exit(0);
}
if (state !== "PENDING_DEVELOPER_RELEASE") {
  throw new Error(`Refusing to withdraw App Store version in state ${state}.`);
}

const versionSubmission = await submission(version.id);
if (!versionSubmission) throw new Error("No App Store version submission was found.");

const requiredConfirmation = `WITHDRAW_${versionString}_BUILD_${expectedBuild}`;
if (execute && confirmation !== requiredConfirmation) {
  throw new Error(`Use --confirm ${requiredConfirmation} with --execute true.`);
}

if (execute) {
  await request(`/v1/appStoreVersionSubmissions/${versionSubmission.id}`, {
    method: "DELETE",
  });
  await waitForDeveloperRejected(version.id);
}

console.log(
  JSON.stringify(
    {
      validated: true,
      execute,
      version: { id: version.id, versionString, state },
      build: { id: build.id, buildNumber: build.attributes.version },
      submission: { id: versionSubmission.id },
      nextStep: execute
        ? "The old approved build was withdrawn. Assign the validated new build next."
        : `Dry run only. To withdraw exactly this build, add --execute true --confirm ${requiredConfirmation}.`,
    },
    null,
    2,
  ),
);

import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  hasStatus,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const defaults = {
  appId: appStoreConnectDefaults.appId,
  groupName: "PetFlow 보호자 테스트",
  keyId: appStoreConnectDefaults.keyId,
  issuerId: appStoreConnectDefaults.issuerId,
};

const args = parseArgs();

const appId = args.get("--app-id") || process.env.ASC_APP_ID || defaults.appId;
const groupName =
  args.get("--group") || process.env.ASC_EXTERNAL_GROUP_NAME || defaults.groupName;
const buildNumber = args.get("--build-number") || process.env.ASC_BUILD_NUMBER;
const keyId = args.get("--key-id") || defaults.keyId;
const issuerId = args.get("--issuer-id") || defaults.issuerId;

const { request } = createAppStoreConnectClient({ keyId, issuerId });

async function findLatestBuild() {
  const filter = buildNumber ? `&filter[version]=${encodeURIComponent(buildNumber)}` : "";
  const data = await request(
    `/v1/builds?filter[app]=${appId}${filter}&sort=-uploadedDate&limit=10`,
  );
  const build = data.data.find((item) => !item.attributes.expired);
  return build ?? null;
}

async function waitForValidBuild() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    const build = await findLatestBuild();
    if (!build) {
      console.log(
        buildNumber
          ? `Waiting for App Store Connect processing: build ${buildNumber} is not listed yet.`
          : "Waiting for App Store Connect processing: no uploaded build is listed yet.",
      );
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      continue;
    }
    if (build.attributes.processingState === "VALID") {
      return build;
    }
    console.log(
      `Waiting for App Store Connect processing: build ${build.attributes.version} is ${build.attributes.processingState}.`,
    );
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  throw new Error("Timed out waiting for App Store Connect build processing.");
}

async function findExternalGroup() {
  const data = await request(`/v1/betaGroups?filter[app]=${appId}&limit=100`);
  const group = data.data.find(
    (item) => item.attributes.name === groupName && item.attributes.isInternalGroup === false,
  );
  if (!group) {
    throw new Error(`External TestFlight group not found: ${groupName}`);
  }
  return group;
}

async function attachBuildToGroup(buildId, groupId) {
  const current = await request(`/v1/betaGroups/${groupId}/relationships/builds?limit=100`);
  if (current.data.some((item) => item.id === buildId)) {
    return "already-attached";
  }
  try {
    await request(`/v1/betaGroups/${groupId}/relationships/builds`, {
      method: "POST",
      body: JSON.stringify({ data: [{ type: "builds", id: buildId }] }),
    });
  } catch (error) {
    if (!hasStatus(error, 409)) throw error;
    return "already-attached";
  }
  return "attached";
}

async function ensureBetaReviewSubmission(buildId) {
  const existing = await request(`/v1/builds/${buildId}/betaAppReviewSubmission`);
  if (existing.data?.id) {
    return existing.data.attributes?.betaReviewState || "existing";
  }
  let created;
  try {
    created = await request("/v1/betaAppReviewSubmissions", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "betaAppReviewSubmissions",
          relationships: { build: { data: { type: "builds", id: buildId } } },
        },
      }),
    });
  } catch (error) {
    if (!hasStatus(error, 409)) throw error;
    const current = await request(`/v1/builds/${buildId}/betaAppReviewSubmission`);
    return current.data?.attributes?.betaReviewState || "existing";
  }
  return created.data.attributes?.betaReviewState || "submitted";
}

const build = await waitForValidBuild();
const group = await findExternalGroup();
const attachState = await attachBuildToGroup(build.id, group.id);
const reviewState = await ensureBetaReviewSubmission(build.id);

console.log(
  JSON.stringify(
    {
      buildId: build.id,
      buildNumber: build.attributes.version,
      processingState: build.attributes.processingState,
      externalGroup: group.attributes.name,
      publicLink: group.attributes.publicLink,
      attachState,
      betaReviewState: reviewState,
    },
    null,
    2,
  ),
);

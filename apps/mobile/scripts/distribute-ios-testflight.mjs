import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const defaults = {
  appId: "6786073387",
  groupName: "PetFlow 보호자 테스트",
  keyId: process.env.ASC_API_KEY_ID || "955FL4G6H5",
  issuerId:
    process.env.ASC_API_ISSUER_ID || "d70bd04a-60bd-4b23-a5a8-a296063e5767",
};

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    args.set(key, "true");
    continue;
  }
  args.set(key, value);
  index += 1;
}

const appId = args.get("--app-id") || process.env.ASC_APP_ID || defaults.appId;
const groupName =
  args.get("--group") || process.env.ASC_EXTERNAL_GROUP_NAME || defaults.groupName;
const buildNumber = args.get("--build-number") || process.env.ASC_BUILD_NUMBER;
const keyId = args.get("--key-id") || defaults.keyId;
const issuerId = args.get("--issuer-id") || defaults.issuerId;

const keyPath = findKeyPath(keyId);
const privateKey = fs.readFileSync(keyPath, "utf8");

function findKeyPath(id) {
  const candidates = [
    process.env.ASC_API_KEY_PATH,
    path.join(os.homedir(), "Downloads", `AuthKey_${id}.p8`),
    path.join(os.homedir(), "AppData", "Local", "PetFlow", "apple", `AuthKey_${id}.p8`),
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `App Store Connect API key not found. Set ASC_API_KEY_PATH to AuthKey_${id}.p8.`,
    );
  }
  return found;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now - 60,
    exp: now + 10 * 60,
    aud: "appstoreconnect-v1",
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

async function request(pathname, options = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${createToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}: ${text}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

function hasStatus(error, status) {
  return error && typeof error === "object" && error.status === status;
}

async function findLatestBuild() {
  const filter = buildNumber ? `&filter[version]=${encodeURIComponent(buildNumber)}` : "";
  const data = await request(
    `/v1/builds?filter[app]=${appId}${filter}&sort=-uploadedDate&limit=10`,
  );
  const build = data.data.find((item) => !item.attributes.expired);
  if (!build) {
    throw new Error("No uploaded App Store Connect build found for PetFlow.");
  }
  return build;
}

async function waitForValidBuild() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    const build = await findLatestBuild();
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

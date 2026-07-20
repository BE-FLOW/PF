import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const appStoreConnectDefaults = Object.freeze({
  appId: "6786073387",
  keyId: process.env.ASC_API_KEY_ID || "955FL4G6H5",
  issuerId:
    process.env.ASC_API_ISSUER_ID || "d70bd04a-60bd-4b23-a5a8-a296063e5767",
});

export function parseArgs(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args.set(key, "true");
      continue;
    }

    args.set(key, value);
    index += 1;
  }
  return args;
}

export function findKeyPath(keyId) {
  const candidates = [
    process.env.ASC_API_KEY_PATH,
    path.join(os.homedir(), "Downloads", `AuthKey_${keyId}.p8`),
    path.join(
      os.homedir(),
      "AppData",
      "Local",
      "PetFlow",
      "apple",
      `AuthKey_${keyId}.p8`,
    ),
  ].filter(Boolean);

  const keyPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!keyPath) {
    throw new Error(
      `App Store Connect API key not found. Set ASC_API_KEY_PATH to AuthKey_${keyId}.p8.`,
    );
  }
  return keyPath;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createToken({ keyId, issuerId, privateKey }) {
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

export function createAppStoreConnectClient({
  keyId = appStoreConnectDefaults.keyId,
  issuerId = appStoreConnectDefaults.issuerId,
  keyPath = findKeyPath(keyId),
} = {}) {
  const privateKey = fs.readFileSync(keyPath, "utf8");

  async function request(pathname, options = {}) {
    const response = await fetch(`https://api.appstoreconnect.apple.com${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${createToken({ keyId, issuerId, privateKey })}`,
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

  return { request };
}

export function hasStatus(error, status) {
  return error && typeof error === "object" && error.status === status;
}

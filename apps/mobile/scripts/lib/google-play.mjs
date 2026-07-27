import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tokenUrl = "https://oauth2.googleapis.com/token";
const apiBaseUrl =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";
const publisherScope = "https://www.googleapis.com/auth/androidpublisher";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const googlePlayDefaults = Object.freeze({
  packageName: "com.beflow.petflow",
  credentialsPath: path.resolve(
    scriptDirectory,
    "../../credentials/google-play-service-account.json",
  ),
});

export function parseArgs(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) continue;
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      args.set(key, value);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function readServiceAccount(credentialsPath) {
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google Play service account file not found: ${credentialsPath}`,
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(credentialsPath, "utf8"),
  );
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Google Play service account credentials are incomplete.");
  }
  return serviceAccount;
}

export function hasStatus(error, status) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  );
}

export function createGooglePlayClient({
  credentialsPath = googlePlayDefaults.credentialsPath,
} = {}) {
  const serviceAccount = readServiceAccount(credentialsPath);
  let cachedToken = null;
  let tokenExpiresAt = 0;

  async function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && tokenExpiresAt - now > 60) return cachedToken;

    const header = base64Url(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    );
    const payload = base64Url(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: publisherScope,
        aud: tokenUrl,
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsignedAssertion = `${header}.${payload}`;
    const signature = crypto
      .sign("RSA-SHA256", Buffer.from(unsignedAssertion), {
        key: serviceAccount.private_key,
      })
      .toString("base64url");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsignedAssertion}.${signature}`,
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.access_token) {
      throw new Error(
        body.error_description ||
          body.error ||
          "Google Play access token could not be issued.",
      );
    }

    cachedToken = body.access_token;
    tokenExpiresAt = now + Number(body.expires_in || 3600);
    return cachedToken;
  }

  async function request(endpoint, init = {}) {
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        body?.error?.message ||
        `Google Play API request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.details = body?.error?.details ?? null;
      throw error;
    }
    return body;
  }

  return { request };
}

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isDummyEmail } from "./dummy-account-policy.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
const envFile = resolve(process.cwd(), envFileArg?.split("=")[1] ?? ".env.local");

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listDummyUsers(client) {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const pageUsers = data.users ?? [];
    users.push(...pageUsers.filter((user) => user.email && isDummyEmail(user.email)));

    if (pageUsers.length < perPage) break;
    page += 1;
  }

  return users;
}

async function removeUserStorage(client, userId) {
  const [{ data: mediaRows, error: mediaError }, { data: petRows, error: petError }] =
    await Promise.all([
      client
        .from("health_report_media")
        .select("storage_path")
        .eq("user_id", userId),
      client.from("pets").select("photo_path").eq("user_id", userId),
    ]);

  if (mediaError) throw mediaError;
  if (petError) throw petError;

  const mediaPaths = (mediaRows ?? [])
    .map((row) => row.storage_path)
    .filter(Boolean);
  const photoPaths = (petRows ?? [])
    .map((row) => row.photo_path)
    .filter(Boolean);

  if (mediaPaths.length) {
    const { error } = await client.storage.from("petflow-report-media").remove(mediaPaths);
    if (error) throw error;
  }
  if (photoPaths.length) {
    const { error } = await client.storage.from("petflow-pet-photos").remove(photoPaths);
    if (error) throw error;
  }

  return { mediaFiles: mediaPaths.length, petPhotos: photoPaths.length };
}

async function main() {
  loadEnv(envFile);
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const dummyUsers = await listDummyUsers(client);

  const result = {
    mode: apply ? "apply" : "dry-run",
    dummyAuthUsers: dummyUsers.length,
    removed: {
      dummyAuthUsers: 0,
      mediaFiles: 0,
      petPhotos: 0,
    },
  };

  if (apply) {
    for (const user of dummyUsers) {
      const storage = await removeUserStorage(client, user.id);
      const { error } = await client.auth.admin.deleteUser(user.id);
      if (error) throw error;
      result.removed.dummyAuthUsers += 1;
      result.removed.mediaFiles += storage.mediaFiles;
      result.removed.petPhotos += storage.petPhotos;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

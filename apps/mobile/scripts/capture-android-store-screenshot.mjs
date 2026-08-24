import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  GOOGLE_PLAY_SCREENSHOT_FILES,
  GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS,
} from "./lib/google-play-screenshot-guard.mjs";
import { parseArgs } from "./lib/app-store-connect.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const expo = require(path.join(mobileRoot, "app.config.js")).expo;
const sharp = require("sharp");
const args = parseArgs();
const setName = args.get("--set");
const fileName = args.get("--file");
const buildNumber = args.get("--build-number");
const serialArg = args.get("--serial");
const execute = args.get("--execute") === "true";
const overwrite = args.get("--overwrite") === "true";
const noPersonalData = args.get("--confirm-no-personal-data") === "true";

const sets = new Map([
  ["phone", GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS[0]],
  ["tablet-7", GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS[1]],
  ["tablet-10", GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS[2]],
]);
const definition = sets.get(setName);
if (!definition) throw new Error("--set must be phone, tablet-7, or tablet-10.");
if (!GOOGLE_PLAY_SCREENSHOT_FILES.includes(fileName)) {
  throw new Error(`--file must be one of: ${GOOGLE_PLAY_SCREENSHOT_FILES.join(", ")}.`);
}
if (!/^\d+$/.test(buildNumber ?? "")) throw new Error("--build-number is required.");
if (execute && !overwrite) {
  throw new Error("Use --overwrite true only after reviewing the current app screen.");
}
if (execute && !noPersonalData) {
  throw new Error("Use --confirm-no-personal-data true with a dedicated QA account.");
}

const sdkRoot =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  (process.platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
    : path.join(os.homedir(), "Android", "Sdk"));
const adb = path.join(
  sdkRoot,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
if (!fs.existsSync(adb)) throw new Error(`adb was not found at ${adb}.`);

function adbResult(commandArgs, options = {}) {
  const result = spawnSync(adb, commandArgs, {
    encoding: options.binary ? null : "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `adb ${commandArgs.join(" ")} failed: ${String(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout;
}

const deviceRows = String(adbResult(["devices"]))
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter((row) => row.length >= 2 && row[1] === "device");
const serial = serialArg || (deviceRows.length === 1 ? deviceRows[0][0] : null);
if (!serial) {
  throw new Error(`Expected one online Android device, found ${deviceRows.length}; use --serial.`);
}
const onDevice = (...commandArgs) => adbResult(["-s", serial, ...commandArgs]);
const onDeviceBinary = (...commandArgs) =>
  adbResult(["-s", serial, ...commandArgs], { binary: true });
const avdName = String(onDevice("emu", "avd", "name"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line && line !== "OK");
if (avdName !== definition.avdName) {
  throw new Error(`Expected ${definition.avdName}, found ${avdName || "an unknown device"}.`);
}
if (String(onDevice("shell", "getprop", "sys.boot_completed")).trim() !== "1") {
  throw new Error("The emulator has not finished booting.");
}

const packageDetails = String(
  onDevice("shell", "dumpsys", "package", expo.android.package),
);
const versionName = packageDetails.match(/\bversionName=([^\s]+)/)?.[1];
const versionCode = packageDetails.match(/\bversionCode=(\d+)/)?.[1];
if (versionName !== expo.version || versionCode !== String(buildNumber)) {
  throw new Error(
    `Installed ${expo.android.package} is ${versionName ?? "missing"} (${versionCode ?? "missing"}), expected ${expo.version} (${buildNumber}).`,
  );
}
const foreground = String(onDevice("shell", "dumpsys", "window", "windows"));
if (!foreground.includes(expo.android.package)) {
  throw new Error(`Bring ${expo.android.package} to the foreground before capturing.`);
}

const destination = path.join(
  mobileRoot,
  ...definition.relativeDirectory.split("/"),
  fileName,
);
if (!execute) {
  console.log(
    JSON.stringify(
      {
        validated: true,
        execute: false,
        serial,
        avdName,
        versionName,
        versionCode,
        target: { width: definition.width, height: definition.height, destination },
        nextStep:
          "Review the visible screen, then re-run with --execute true --overwrite true --confirm-no-personal-data true.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

onDevice("shell", "settings", "put", "system", "accelerometer_rotation", "0");
onDevice("shell", "settings", "put", "system", "user_rotation", String(definition.rotation));
onDevice("shell", "wm", "size", `${definition.width}x${definition.height}`);
onDevice("shell", "wm", "density", String(definition.density));
await new Promise((resolve) => setTimeout(resolve, 1500));

const rawScreenshot = onDeviceBinary("exec-out", "screencap", "-p");
const normalized = await sharp(rawScreenshot)
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9, palette: false, colours: 256 })
  .toBuffer();
const metadata = await sharp(normalized).metadata();
if (
  metadata.width !== definition.width ||
  metadata.height !== definition.height ||
  metadata.hasAlpha
) {
  throw new Error(
    `Captured ${metadata.width}x${metadata.height}, alpha=${metadata.hasAlpha}; expected ${definition.width}x${definition.height} without alpha.`,
  );
}
fs.writeFileSync(destination, normalized);
console.log(
  JSON.stringify(
    {
      captured: true,
      serial,
      avdName,
      versionName,
      versionCode,
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha,
      destination,
      nextStep: "Review this image before capturing the next named screen.",
    },
    null,
    2,
  ),
);

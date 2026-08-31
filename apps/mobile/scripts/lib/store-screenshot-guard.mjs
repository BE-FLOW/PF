import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  "version",
  "buildNumber",
  "gitCommit",
  "platform",
  "displayType",
  "width",
  "height",
  "capturedAt",
  "source",
  "qaConfirmedAt",
  "qaConfirmation",
  "files",
]);

function ensurePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Screenshot ${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

export function readPngMetadata(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (
    buffer.length < 33 ||
    buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR" ||
    buffer.readUInt32BE(8) !== 13
  ) {
    throw new Error(`${path.basename(filePath)} is not a valid PNG file.`);
  }

  const colorType = buffer.readUInt8(25);
  if (![0, 2, 3, 4, 6].includes(colorType)) {
    throw new Error(`${path.basename(filePath)} has an invalid PNG color type.`);
  }
  let hasTransparencyChunk = false;
  let hasEndChunk = false;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > buffer.length) {
      throw new Error(`${path.basename(filePath)} has a truncated PNG chunk.`);
    }
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (chunkType === "tRNS") hasTransparencyChunk = true;
    offset = chunkEnd;
    if (chunkType === "IEND") {
      hasEndChunk = true;
      break;
    }
  }
  if (!hasEndChunk) {
    throw new Error(`${path.basename(filePath)} has no PNG end chunk.`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6 || hasTransparencyChunk,
  };
}

export function readPngSize(filePath) {
  const { width, height } = readPngMetadata(filePath);
  return { width, height };
}

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function expectedScreenshotQaConfirmation(platform, buildNumber) {
  if (platform === "ios") {
    return `IOS_SCREENSHOTS_BUILD_${buildNumber}_QA_PASSED`;
  }
  if (platform === "android") {
    return `ANDROID_BUILD_${buildNumber}_QA_PASSED`;
  }
  throw new Error(`Unsupported screenshot platform ${platform}.`);
}

export function validateScreenshotFiles({
  files,
  expectedFileNames,
  width,
  height,
}) {
  const names = files.map((file) => path.basename(file)).sort();
  const expected = [...expectedFileNames].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected screenshots ${expected.join(", ")}; found ${names.join(", ") || "none"}.`,
    );
  }
  if (!Number.isSafeInteger(Number(width)) || Number(width) < 1) {
    throw new Error(`Screenshot width ${width} is invalid.`);
  }
  if (!Number.isSafeInteger(Number(height)) || Number(height) < 1) {
    throw new Error(`Screenshot height ${height} is invalid.`);
  }

  for (const file of files) {
    const metadata = readPngMetadata(file);
    if (metadata.width !== Number(width) || metadata.height !== Number(height)) {
      throw new Error(
        `${path.basename(file)} is ${metadata.width}x${metadata.height}; expected ${width}x${height}.`,
      );
    }
    if (metadata.hasAlpha) {
      throw new Error(
        `${path.basename(file)} contains alpha transparency; store screenshots must be opaque.`,
      );
    }
  }
}

export function validateScreenshotManifest(manifest, expected) {
  ensurePlainObject(manifest, "Screenshot manifest");
  const missing = REQUIRED_MANIFEST_FIELDS.filter(
    (key) => manifest[key] === undefined || manifest[key] === "",
  );
  if (missing.length) {
    throw new Error(`Screenshot manifest is missing: ${missing.join(", ")}.`);
  }

  const comparisons = [
    ["version", String(manifest.version), String(expected.version)],
    ["buildNumber", String(manifest.buildNumber), String(expected.buildNumber)],
    ["gitCommit", manifest.gitCommit, expected.gitCommit],
    ["platform", manifest.platform, expected.platform],
    ["displayType", manifest.displayType, expected.displayType],
    ["width", Number(manifest.width), Number(expected.width)],
    ["height", Number(manifest.height), Number(expected.height)],
  ];
  for (const [label, actual, target] of comparisons) {
    if (actual !== target) {
      throw new Error(`Screenshot ${label} ${actual} does not match ${target}.`);
    }
  }

  if (typeof manifest.source !== "string" || !manifest.source.trim()) {
    throw new Error("Screenshot source must identify the capture device.");
  }
  const capturedAt = parseTimestamp(manifest.capturedAt, "capturedAt");
  const qaConfirmedAt = parseTimestamp(manifest.qaConfirmedAt, "qaConfirmedAt");
  if (qaConfirmedAt < capturedAt) {
    throw new Error("Screenshot QA confirmation predates the capture.");
  }

  const qaConfirmation = expectedScreenshotQaConfirmation(
    expected.platform,
    expected.buildNumber,
  );
  if (manifest.qaConfirmation !== qaConfirmation) {
    throw new Error(`Screenshot QA confirmation must be ${qaConfirmation}.`);
  }

  ensurePlainObject(manifest.files, "Screenshot manifest files");
  const actualFileNames = Object.keys(manifest.files).sort();
  const expectedFileNames = [...expected.expectedFileNames].sort();
  if (JSON.stringify(actualFileNames) !== JSON.stringify(expectedFileNames)) {
    throw new Error(
      `Screenshot manifest files must be exactly: ${expectedFileNames.join(", ")}.`,
    );
  }
  for (const fileName of expectedFileNames) {
    if (!/^[a-f0-9]{64}$/.test(manifest.files[fileName] ?? "")) {
      throw new Error(`Screenshot manifest has no valid SHA-256 for ${fileName}.`);
    }
  }
}

export function readScreenshotManifest(directory) {
  const manifestPath = path.join(directory, "manifest.json");
  try {
    return {
      manifestPath,
      manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    };
  } catch (error) {
    throw new Error(
      `Could not read screenshot manifest ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function validateStampedScreenshotSet({ directory, expected }) {
  const { manifest, manifestPath } = readScreenshotManifest(directory);
  const files = expected.expectedFileNames.map((fileName) =>
    path.join(directory, fileName),
  );
  validateScreenshotFiles({
    files,
    expectedFileNames: expected.expectedFileNames,
    width: expected.width,
    height: expected.height,
  });
  validateScreenshotManifest(manifest, expected);

  const hashes = Object.fromEntries(
    files.map((file) => [path.basename(file), sha256File(file)]),
  );
  for (const [fileName, hash] of Object.entries(hashes)) {
    if (manifest.files[fileName] !== hash) {
      throw new Error(`${fileName} changed after the screenshot manifest was stamped.`);
    }
  }
  return { directory, files, hashes, manifest, manifestPath };
}

export function assertScreenshotCapturedAfterBuild(manifest, easBuild, files = []) {
  const buildCompletedAt = Date.parse(easBuild.completedAt ?? easBuild.updatedAt ?? "");
  if (!Number.isFinite(buildCompletedAt)) {
    throw new Error("The EAS build has no valid completion timestamp.");
  }
  const capturedAt = parseTimestamp(manifest.capturedAt, "capturedAt");
  if (capturedAt < buildCompletedAt) {
    throw new Error(
      `Screenshots captured at ${manifest.capturedAt} predate EAS build completion.`,
    );
  }
  const staleFiles = files.filter((file) => fs.statSync(file).mtimeMs < buildCompletedAt);
  if (staleFiles.length) {
    throw new Error(
      `Screenshot files predate EAS build completion: ${staleFiles
        .map((file) => path.basename(file))
        .join(", ")}.`,
    );
  }
}

export function assertDistinctScreenshotSets(stampedSets) {
  const signatures = new Map();
  for (const stamped of stampedSets) {
    const signature = Object.entries(stamped.hashes)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([fileName, hash]) => `${fileName}:${hash}`)
      .join("|");
    const previous = signatures.get(signature);
    if (previous) {
      throw new Error(
        `Screenshot sets ${previous} and ${stamped.manifest.displayType} are byte-identical. Capture each device class separately.`,
      );
    }
    signatures.set(signature, stamped.manifest.displayType);
  }
}

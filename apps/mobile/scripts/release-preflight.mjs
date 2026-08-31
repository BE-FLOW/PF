import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  appStoreConnectDefaults,
  findKeyPath,
  parseArgs,
} from "./lib/app-store-connect.mjs";
import {
  googlePlayFeatureGraphic,
  googlePlayScreenshotSets,
  validateGooglePlayFeatureGraphic,
  validateGooglePlayScreenshotSets,
} from "./lib/google-play-screenshot-guard.mjs";
import { IOS_SCREENSHOT_FILES } from "./lib/ios-release-guard.mjs";
import {
  findExactFinishedEasBuild,
  readEasBuilds,
  verifyBuildCoversMain,
} from "./lib/release-source.mjs";
import {
  assertScreenshotCapturedAfterBuild,
  readScreenshotManifest,
  validateStampedScreenshotSet,
} from "./lib/store-screenshot-guard.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const require = createRequire(import.meta.url);
const args = parseArgs();
const platform = args.get("--platform") || "all";
const allowDirty = args.has("--allow-dirty");
const skipDeployment = args.has("--skip-deployment");
const supportedPlatforms = new Set(["all", "android", "ios"]);

if (!supportedPlatforms.has(platform)) {
  throw new Error("--platform must be android, ios, or all.");
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "package.json"), "utf8"),
);
const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));
const appConfig = require(path.join(mobileRoot, "app.config.js"));
const expo = appConfig.expo;
const checks = [];
const errors = [];
const context = { platform };

function run(command, commandArgs, cwd = repoRoot) {
  const npxCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js",
  );
  const useNodeNpx = command === "npx" && fs.existsSync(npxCli);
  const executable = useNodeNpx ? process.execPath : command;
  const executableArgs = useNodeNpx ? [npxCli, ...commandArgs] : commandArgs;
  const result = spawnSync(executable, executableArgs, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (
      result.stderr ||
      result.stdout ||
      result.error?.message ||
      "command failed"
    ).trim();
    throw new Error(detail);
  }
  return result.stdout.trim();
}

function record(label, action) {
  try {
    const value = action();
    checks.push(label);
    return value;
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function recordAsync(label, action) {
  try {
    const value = await action();
    checks.push(label);
    return value;
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureFiles(relativePaths) {
  const missing = relativePaths.filter(
    (relativePath) => !fs.existsSync(path.join(mobileRoot, relativePath)),
  );
  ensure(!missing.length, `missing files: ${missing.join(", ")}`);
}

function ensureLatestProductionStoreBuild(builds, easBuild) {
  ensure(easBuild.buildProfile === "production", "screenshot build is not production");
  ensure(easBuild.distribution === "STORE", "screenshot build is not a store build");
  const latest = builds
    .filter(
      (build) =>
        build.status === "FINISHED" &&
        build.buildProfile === "production" &&
        build.distribution === "STORE",
    )
    .toSorted(
      (left, right) =>
        Date.parse(right.completedAt ?? right.updatedAt ?? right.createdAt ?? 0) -
        Date.parse(left.completedAt ?? left.updatedAt ?? left.createdAt ?? 0),
    )[0];
  ensure(latest?.id === easBuild.id, "screenshot manifest does not target the latest store build");
}

function readEasEnvironmentVariableNames(environment, scope) {
  const output = run(
    "npx",
    [
      "eas-cli",
      "env:list",
      environment,
      "--scope",
      scope,
      "--format",
      "short",
    ],
    mobileRoot,
  );
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)=/)?.[1] ?? null)
    .filter(Boolean);
}

record("앱 버전과 식별자", () => {
  const expectedPackageVersion = /^\d+\.\d+$/.test(expo.version)
    ? `${expo.version}.0`
    : expo.version;
  ensure(
    packageJson.version === expectedPackageVersion,
    `package ${packageJson.version} does not match Expo ${expo.version}`,
  );
  ensure(expo.android?.package === "com.beflow.petflow", "unexpected Android package");
  ensure(
    expo.ios?.bundleIdentifier === "com.beflow.petflow",
    "unexpected iOS bundle identifier",
  );
  ensure(
    expo.extra?.apiBaseUrl === "https://pf-two-eta.vercel.app",
    `unexpected production API URL: ${expo.extra?.apiBaseUrl ?? "missing"}`,
  );
  ensure(easJson.cli?.appVersionSource === "remote", "EAS remote versioning is required");
  ensure(easJson.build?.production?.autoIncrement === true, "EAS autoIncrement is required");
  context.appVersion = expo.version;
  context.apiBaseUrl = expo.extra.apiBaseUrl;
});

record("공통 앱 자산", () => {
  ensureFiles([
    "assets/icon.png",
    "assets/brand-icon.png",
    "assets/fonts/Pretendard-LICENSE.txt",
  ]);
});

record("무료 공개 런타임", () => {
  ensure(
    !packageJson.dependencies?.["react-native-purchases"],
    "react-native-purchases must not be bundled in the free release",
  );
  ensure(
    !fs.existsSync(path.join(mobileRoot, "src/lib/billing.ts")),
    "mobile billing runtime must not exist in the free release",
  );
  ensure(
    !expo.android?.permissions?.includes("com.android.vending.BILLING"),
    "Android BILLING permission must not be requested",
  );
  ensure(
    expo.android?.blockedPermissions?.includes("com.android.vending.BILLING"),
    "Android BILLING permission removal guard is missing",
  );
  ensure(expo.plugins?.includes("expo-font"), "expo-font config plugin is missing");
  context.releaseMode = "free";
});

record("EAS 업로드 제외 규칙", () => {
  const ignoreRules = fs
    .readFileSync(path.join(repoRoot, ".easignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const requiredRules = [
    ".env*",
    "apps/mobile/credentials/",
    "apps/mobile/credentials.json",
    "apps/mobile/google-service-account*.json",
    "*.jks",
    "*.keystore",
    "*.mobileprovision",
    "*.p12",
    "*.p8",
    "*.pem",
  ];
  const missingRules = requiredRules.filter((rule) => !ignoreRules.includes(rule));
  ensure(!missingRules.length, `unsafe EAS archive rules: ${missingRules.join(", ")}`);
});

if (platform === "all" || platform === "android") {
  record("Android 자산과 제출 키", () => {
    ensureFiles([
      "assets/adaptive-icon.png",
      "store/google-play/app-icon-512.png",
      "store/google-play/feature-graphic-1024x500.png",
      "store/google-play/screenshots-phone/01-home-score.png",
      "store/google-play/screenshots-phone/02-health-check.png",
      "store/google-play/screenshots-phone/03-health-flow.png",
      "store/google-play/screenshots-phone/04-account-pets.png",
      "store/google-play/screenshots-phone/05-report-summary.png",
      "credentials/google-play-service-account.json",
    ]);
    ensure(easJson.submit?.closed?.android?.track === "alpha", "closed track must be alpha");
    ensure(
      easJson.submit?.production?.android?.track === "production",
      "production track must be production",
    );
    const credential = JSON.parse(
      fs.readFileSync(
        path.join(mobileRoot, "credentials/google-play-service-account.json"),
        "utf8",
      ),
    );
    ensure(credential.type === "service_account", "invalid Google service account type");
    ensure(Boolean(credential.client_email), "Google service account email is missing");
    ensure(Boolean(credential.private_key), "Google service account private key is missing");
  });
}

if (platform === "all" || platform === "ios") {
  record("iOS 자산과 제출 키", () => {
    ensureFiles([
      "store/app-store/app-icon-1024.png",
      "store/app-store/iphone-6-7/01-home-score.png",
      "store/app-store/iphone-6-7/02-health-check.png",
      "store/app-store/iphone-6-7/03-health-flow.png",
      "store/app-store/iphone-6-7/04-account-pets.png",
      "store/app-store/iphone-6-7/05-report-summary.png",
    ]);
    ensure(
      easJson.submit?.production?.ios?.ascAppId === appStoreConnectDefaults.appId,
      "unexpected App Store Connect app ID",
    );
    findKeyPath(appStoreConnectDefaults.keyId);
  });
}

function validateIosReleaseScreenshots(currentCommit) {
  ensure(currentCommit, "current Git commit is unavailable");
  const directory = path.join(mobileRoot, "store", "app-store", "iphone-6-7");
  const { manifest } = readScreenshotManifest(directory);
  const buildNumber = String(manifest.buildNumber ?? "");
  ensure(buildNumber, "iOS screenshot build number is missing");
  const stamped = validateStampedScreenshotSet({
    directory,
    expected: {
      version: expo.version,
      buildNumber,
      gitCommit: manifest.gitCommit,
      platform: "ios",
      displayType: "APP_IPHONE_67",
      width: 1290,
      height: 2796,
      expectedFileNames: IOS_SCREENSHOT_FILES,
    },
  });
  const builds = readEasBuilds(mobileRoot, "ios");
  const easBuild = findExactFinishedEasBuild(builds, {
    version: expo.version,
    buildNumber,
    platform: "ios",
    buildProfile: "production",
    distribution: "STORE",
  });
  ensureLatestProductionStoreBuild(builds, easBuild);
  const source = verifyBuildCoversMain(repoRoot, easBuild, currentCommit);
  ensure(
    stamped.manifest.gitCommit === source.buildCommit,
    "iOS screenshot manifest does not match the selected EAS build commit",
  );
  assertScreenshotCapturedAfterBuild(stamped.manifest, easBuild, stamped.files);
  return { buildNumber, easBuild, source, stampedSets: [stamped] };
}

function validateAndroidReleaseScreenshots(currentCommit) {
  ensure(currentCommit, "current Git commit is unavailable");
  const featureGraphic = googlePlayFeatureGraphic(mobileRoot);
  const manifests = googlePlayScreenshotSets(mobileRoot).map(
    ({ directory }) => readScreenshotManifest(directory).manifest,
  );
  manifests.push(readScreenshotManifest(featureGraphic.directory).manifest);
  const buildNumbers = new Set(
    manifests.map((manifest) => String(manifest.buildNumber ?? "")),
  );
  const gitCommits = new Set(manifests.map((manifest) => manifest.gitCommit ?? ""));
  ensure(
    buildNumbers.size === 1 && !buildNumbers.has(""),
    "Google Play screenshot manifests must use one build number",
  );
  ensure(
    gitCommits.size === 1 && !gitCommits.has(""),
    "Google Play screenshot manifests must use one build commit",
  );
  const [buildNumber] = buildNumbers;
  const [manifestCommit] = gitCommits;
  const stampedSets = validateGooglePlayScreenshotSets(mobileRoot, {
    version: expo.version,
    buildNumber,
    gitCommit: manifestCommit,
  });
  const stampedFeatureGraphic = validateGooglePlayFeatureGraphic(mobileRoot, {
    version: expo.version,
    buildNumber,
    gitCommit: manifestCommit,
  });
  const builds = readEasBuilds(mobileRoot, "android");
  const easBuild = findExactFinishedEasBuild(builds, {
    version: expo.version,
    buildNumber,
    platform: "android",
    buildProfile: "production",
    distribution: "STORE",
  });
  ensureLatestProductionStoreBuild(builds, easBuild);
  const source = verifyBuildCoversMain(repoRoot, easBuild, currentCommit);
  ensure(
    manifestCommit === source.buildCommit,
    "Google Play screenshot manifests do not match the selected EAS build commit",
  );
  for (const stamped of stampedSets) {
    assertScreenshotCapturedAfterBuild(stamped.manifest, easBuild, stamped.files);
  }
  assertScreenshotCapturedAfterBuild(
    stampedFeatureGraphic.manifest,
    easBuild,
    stampedFeatureGraphic.files,
  );
  return {
    buildNumber,
    easBuild,
    source,
    stampedSets,
    stampedFeatureGraphic,
  };
}

const branch = record("main 브랜치", () => {
  const value = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  ensure(value === "main", `release must run from main, found ${value}`);
  return value;
});
context.branch = branch;

record("Git 작업 트리", () => {
  const status = run("git", ["status", "--porcelain"]);
  ensure(allowDirty || !status, "uncommitted changes are present");
});

record("origin/main 동기화", () => {
  run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"]);
  const originMain = run("git", ["rev-parse", "origin/main"]);
  ensure(head === originMain, "local main and origin/main differ");
  context.commit = head;
});

record("Expo 계정", () => {
  const account = run("npx", ["eas-cli", "whoami"], mobileRoot);
  ensure(Boolean(account), "EAS account is not connected");
  context.easAccount = account.split(/\r?\n/)[0];
});

record("무료 공개 EAS 환경", () => {
  const variableNames = [
    ...readEasEnvironmentVariableNames("production", "project"),
    ...readEasEnvironmentVariableNames("production", "account"),
  ];
  const billingVariables = variableNames.filter((name) =>
    /REVENUECAT|PURCHASE|BILLING/.test(name),
  );
  ensure(
    billingVariables.length === 0,
    `billing variables remain in EAS production: ${billingVariables.join(", ")}`,
  );
  context.easProductionBillingVariables = 0;
});

if (platform === "all" || platform === "android") {
  record("Android 원격 버전", () => {
    const output = run(
      "npx",
      [
        "eas-cli",
        "build:version:get",
        "--platform",
        "android",
        "--profile",
        "production",
        "--non-interactive",
      ],
      mobileRoot,
    );
    context.androidRemoteVersion = output.split(/\r?\n/).filter(Boolean).at(-1);
  });
}

if (platform === "all" || platform === "ios") {
  record("iOS 원격 버전", () => {
    const output = run(
      "npx",
      [
        "eas-cli",
        "build:version:get",
        "--platform",
        "ios",
        "--profile",
        "production",
        "--non-interactive",
      ],
      mobileRoot,
    );
    context.iosRemoteVersion = output.split(/\r?\n/).filter(Boolean).at(-1);
  });
}

if (platform === "all" || platform === "android") {
  record("Google Play 현재 빌드 스크린샷", () => {
    const validated = validateAndroidReleaseScreenshots(context.commit);
    context.androidScreenshotBuild = validated.buildNumber;
    context.androidScreenshotCommit = validated.source.buildCommit;
    context.androidScreenshotSets = validated.stampedSets.length;
    context.androidFeatureGraphic = true;
  });
}

if (platform === "all" || platform === "ios") {
  record("App Store 현재 빌드 스크린샷", () => {
    const validated = validateIosReleaseScreenshots(context.commit);
    context.iosScreenshotBuild = validated.buildNumber;
    context.iosScreenshotCommit = validated.source.buildCommit;
    context.iosScreenshotSets = validated.stampedSets.length;
  });
}

if (!skipDeployment && context.apiBaseUrl && context.commit) {
  await recordAsync("웹·DB 배포 커밋", async () => {
    const healthUrl = new URL("/api/health", context.apiBaseUrl);
    const response = await fetch(healthUrl, { cache: "no-store" });
    const health = await response.json();
    ensure(response.ok && health.status === "ok", "production health check failed");
    ensure(health.database === "connected", `database is ${health.database}`);
    ensure(
      health.releaseMode === "free",
      `release mode is ${health.releaseMode ?? "unknown"}`,
    );
    ensure(
      health.freeReleaseSchema === "ready",
      `free-release schema is ${health.freeReleaseSchema ?? "unknown"}`,
    );
    ensure(
      health.freeAi?.enabled === true &&
        health.freeAi?.generationConfigured === true &&
        Number.isSafeInteger(health.freeAi?.dailyLimit) &&
        health.freeAi.dailyLimit >= 1 &&
        Number.isSafeInteger(health.freeAi?.dailyAttemptLimit) &&
        health.freeAi.dailyAttemptLimit >= health.freeAi.dailyLimit,
      "free AI fair-use configuration is invalid",
    );
    ensure(
      /^[0-9a-f]{12}$/i.test(health.version ?? "") &&
        context.commit.startsWith(health.version),
      `deployed ${health.version} does not match ${context.commit.slice(0, 12)}`,
    );
    for (const billingPath of [
      "/api/billing/events",
      "/api/billing/sync",
      "/api/billing/revenuecat/webhook",
    ]) {
      const billingResponse = await fetch(
        new URL(billingPath, context.apiBaseUrl),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      ensure(
        billingResponse.status === 410,
        `${billingPath} returned ${billingResponse.status}; expected 410`,
      );
    }
    context.deployedVersion = health.version;
    context.freeAiDailyLimit = health.freeAi.dailyLimit;
    context.billingRoutesDisabled = true;
  });
}

const result = {
  ok: errors.length === 0,
  checks,
  context,
  ...(errors.length ? { errors } : {}),
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

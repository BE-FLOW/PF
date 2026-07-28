import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..", "..");
const require = createRequire(import.meta.url);
const expo = require(path.join(mobileRoot, "app.config.js")).expo;
const args = parseArgs();
const versionString = args.get("--version") || expo.version;
const appId = args.get("--app-id") || appStoreConnectDefaults.appId;
const keyId = args.get("--key-id") || appStoreConnectDefaults.keyId;
const issuerId = args.get("--issuer-id") || appStoreConnectDefaults.issuerId;

function run(command, commandArgs, cwd = repoRoot) {
  const npxCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js",
  );
  const useNodeNpx = command === "npx";
  const result = spawnSync(
    useNodeNpx ? process.execPath : command,
    useNodeNpx ? [npxCli, ...commandArgs] : commandArgs,
    {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || result.error?.message || "command failed").trim(),
    );
  }

  return result.stdout.trim();
}

const worktree = run("git", ["status", "--porcelain"]);
if (worktree) {
  throw new Error("출시 전 Git 작업 트리를 커밋해 주세요.");
}

run("git", ["fetch", "--quiet", "origin", "main"]);
const head = run("git", ["rev-parse", "HEAD"]);
const originMain = run("git", ["rev-parse", "origin/main"]);
if (head !== originMain) {
  throw new Error("현재 main과 origin/main이 다릅니다.");
}

const { request } = createAppStoreConnectClient({ keyId, issuerId });
const versions = await request(`/v1/apps/${appId}/appStoreVersions?limit=20`);
const version = versions.data.find(
  (item) => item.attributes.versionString === versionString,
);
if (!version) {
  throw new Error(`App Store 버전 ${versionString}을 찾지 못했습니다.`);
}

const buildResponse = await request(`/v1/appStoreVersions/${version.id}/build`);
const storeBuild = buildResponse.data;
if (!storeBuild) {
  throw new Error(`App Store 버전 ${versionString}에 선택된 빌드가 없습니다.`);
}

const easBuilds = JSON.parse(
  run(
    "npx",
    [
      "eas-cli",
      "build:list",
      "--platform",
      "ios",
      "--limit",
      "50",
      "--json",
      "--non-interactive",
    ],
    mobileRoot,
  ),
);
const easBuild = easBuilds.find(
  (item) =>
    item.appVersion === versionString &&
    item.appBuildVersion === storeBuild.attributes.version &&
    item.status === "FINISHED",
);
if (!easBuild) {
  throw new Error(
    `App Store 빌드 ${storeBuild.attributes.version}과 일치하는 EAS 빌드를 찾지 못했습니다.`,
  );
}

const matchesCurrentMain = easBuild.gitCommitHash === head;
const result = {
  ok: matchesCurrentMain,
  appStore: {
    version: versionString,
    state: version.attributes.appStoreState,
    buildNumber: storeBuild.attributes.version,
  },
  eas: {
    buildId: easBuild.id,
    commit: easBuild.gitCommitHash,
    commitMessage: easBuild.gitCommitMessage,
  },
  git: {
    currentMain: head,
  },
};

console.log(JSON.stringify(result, null, 2));

if (!matchesCurrentMain) {
  throw new Error(
    `출시 중단: App Store 빌드 ${storeBuild.attributes.version}은 현재 main에서 만든 빌드가 아닙니다.`,
  );
}

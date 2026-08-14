import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertRuntimeCoveredByBuild } from "./ios-release-guard.mjs";

export function runCommand(command, args, cwd) {
  const npxCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js",
  );
  const useNodeNpx = command === "npx" && fs.existsSync(npxCli);
  const result = spawnSync(
    useNodeNpx ? process.execPath : command,
    useNodeNpx ? [npxCli, ...args] : args,
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

export function readCleanMain(repoRoot) {
  const branch = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (branch !== "main") throw new Error(`Release must run from main, found ${branch}.`);
  const status = runCommand("git", ["status", "--porcelain"], repoRoot);
  if (status) throw new Error("Commit all release changes before continuing.");
  runCommand("git", ["fetch", "--quiet", "origin", "main"], repoRoot);
  const head = runCommand("git", ["rev-parse", "HEAD"], repoRoot);
  const originMain = runCommand("git", ["rev-parse", "origin/main"], repoRoot);
  if (head !== originMain) throw new Error("Local main and origin/main differ.");
  return { head, originMain };
}

export function readEasBuilds(mobileRoot, platform = "ios") {
  return JSON.parse(
    runCommand(
      "npx",
      [
        "eas-cli",
        "build:list",
        "--platform",
        platform,
        "--limit",
        "50",
        "--json",
        "--non-interactive",
      ],
      mobileRoot,
    ),
  );
}

export function findExactFinishedEasBuild(
  builds,
  { version, buildNumber },
) {
  const matches = builds.filter(
    (build) =>
      build.appVersion === version &&
      String(build.appBuildVersion) === String(buildNumber) &&
      build.status === "FINISHED",
  );
  if (matches.length === 0) {
    throw new Error(
      `EAS iOS ${version} (${buildNumber}): expected a finished build, found none.`,
    );
  }
  if (matches.length === 1) return matches[0];

  const signatures = new Set(
    matches.map((build) =>
      JSON.stringify({
        gitCommitHash: build.gitCommitHash ?? null,
        fingerprint: build.fingerprint?.hash ?? null,
        distribution: build.distribution ?? null,
        buildProfile: build.buildProfile ?? null,
        sdkVersion: build.sdkVersion ?? null,
      }),
    ),
  );
  const hasVerifiableSource = matches.every(
    (build) => build.gitCommitHash && build.fingerprint?.hash,
  );
  if (!hasVerifiableSource || signatures.size !== 1) {
    throw new Error(
      `EAS iOS ${version} (${buildNumber}): found ${matches.length} conflicting finished builds.`,
    );
  }

  return matches.toSorted(
    (left, right) =>
      Date.parse(right.completedAt ?? right.updatedAt ?? right.createdAt ?? 0) -
      Date.parse(left.completedAt ?? left.updatedAt ?? left.createdAt ?? 0),
  )[0];
}

export function verifyBuildCoversMain(repoRoot, easBuild, currentCommit) {
  const buildCommit = easBuild.gitCommitHash;
  if (!buildCommit) throw new Error("The EAS build has no Git commit hash.");
  const ancestorResult = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", buildCommit, currentCommit],
    { cwd: repoRoot, windowsHide: true },
  );
  const buildIsAncestor = ancestorResult.status === 0;
  const changedPaths = buildIsAncestor
    ? runCommand(
        "git",
        ["diff", "--name-only", `${buildCommit}..${currentCommit}`],
        repoRoot,
      )
        .split(/\r?\n/)
        .filter(Boolean)
    : [];
  return {
    buildCommit,
    changedPaths,
    ...assertRuntimeCoveredByBuild({
      buildCommit,
      currentCommit,
      buildIsAncestor,
      changedPaths,
    }),
  };
}

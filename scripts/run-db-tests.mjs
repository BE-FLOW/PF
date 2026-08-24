import { spawnSync } from "node:child_process";
import net from "node:net";

const localDatabasePort = 54322;

function localDatabaseIsReachable() {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: localDatabasePort,
    });
    const finish = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(750);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function windowsDockerIsAvailable() {
  if (process.platform !== "win32") return false;
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

if (
  process.platform !== "win32" ||
  (windowsDockerIsAvailable() && (await localDatabaseIsReachable()))
) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", [
      "/d",
      "/s",
      "/c",
      "npx supabase test db",
    ]);
  }
  run("npx", ["supabase", "test", "db"]);
}

const distro = process.env.PETFLOW_WSL_DISTRO?.trim() || "Ubuntu";
const pathResult = spawnSync(
  "wsl.exe",
  [
    "-d",
    distro,
    "-u",
    "root",
    "--",
    "wslpath",
    "-a",
    process.cwd().replaceAll("\\", "/"),
  ],
  { encoding: "utf8" },
);
if (pathResult.error) throw pathResult.error;
if (pathResult.status !== 0 || !pathResult.stdout.trim()) {
  throw new Error(`Could not resolve the PetFlow workspace in WSL ${distro}.`);
}
const wslWorkspace = pathResult.stdout.trim();
const quotedWorkspace = `'${wslWorkspace.replaceAll("'", `'"'"'`)}'`;
console.log(
  `Local Supabase is not reachable from Windows; running pgTAP in WSL ${distro}.`,
);
run("wsl.exe", [
  "-d",
  distro,
  "-u",
  "root",
  "--",
  "bash",
  "-lc",
  `cd ${quotedWorkspace} && npx supabase test db`,
]);

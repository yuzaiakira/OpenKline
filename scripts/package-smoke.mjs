import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "openkline-package-smoke-"));

try {
  execFileSync("npm", ["pack", "--pack-destination", directory, "--ignore-scripts"], {
    cwd: root,
    env: { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" },
    stdio: "inherit",
  });
  const archive = readdirSync(directory).find((entry) => entry.endsWith(".tgz"));
  if (archive === undefined) throw new Error("npm pack did not produce an archive");

  execFileSync("npm", ["init", "--yes"], { cwd: directory, stdio: "ignore" });
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", join(directory, archive)], {
    cwd: directory,
    env: { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" },
    stdio: "inherit",
  });
  execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    "import { Chart, createChart, RestDatafeed, WebSocketDatafeed } from 'openkline'; if (!Chart || !createChart || !RestDatafeed || !WebSocketDatafeed) process.exit(1);",
  ], { cwd: directory, stdio: "inherit" });
  console.log(JSON.stringify({ package: "openkline", installedFrom: archive, consumer: "ESM" }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const required = [
  "dist/src/index.js",
  "dist/src/index.d.ts",
  "dist/src/klinescript/worker.js",
  "dist/src/screener/worker.js",
];
const problems = [];
for (const file of required) if (!existsSync(join(root, file))) problems.push(`missing required artifact: ${file}`);
if (packageJson.license !== undefined) problems.push("root package must not claim an effective license before approval");
if (Object.keys(packageJson.dependencies ?? {}).length > 0) problems.push("root package has unexpected runtime dependencies");
if (readFileSync(join(root, "dist/src/index.js"), "utf8").match(/binance|alpaca|oanda|api\.key|hosted/i)) problems.push("provider-specific text leaked into the root entry");

const dryRun = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? "/tmp/openkline-npm-cache" },
}))[0];
const files = dryRun.files.map((file) => file.path);
for (const file of files) {
  if (file.startsWith("examples/") || file.startsWith("src/") || file.startsWith("tests/") || file.startsWith("scripts/")) problems.push(`unintended package path: ${file}`);
}
for (const file of ["dist/src/index.js", "dist/src/index.d.ts", "dist/src/klinescript/worker.js", "dist/src/screener/worker.js"]) {
  if (!files.includes(file)) problems.push(`required package file is absent from npm pack output: ${file}`);
}

const result = {
  schemaVersion: 1,
  status: problems.length === 0 ? "PASS" : "FAIL",
  package: packageJson.name,
  version: packageJson.version,
  files: files.length,
  packageSize: dryRun.size,
  unpackedSize: dryRun.unpackedSize,
  sha: dryRun.shasum,
  problems,
  notes: [
    "This verifies local pack contents and does not publish or select a release version/channel.",
    "License approval, third-party notices, and owner release authorization remain separate gates.",
  ],
};
writeFileSync(join(root, "docs/audits/distribution-check.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (problems.length > 0) process.exitCode = 1;

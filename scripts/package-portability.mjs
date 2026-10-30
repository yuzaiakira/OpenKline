import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findProviderSpecificText } from "./package-portability-policy.mjs";

const root = process.cwd();
const coreManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const reactManifest = JSON.parse(readFileSync(join(root, "packages/react/package.json"), "utf8"));

if (Object.keys(coreManifest.dependencies ?? {}).length !== 0) throw new Error("core package has runtime dependencies");
if (Object.keys(reactManifest.dependencies ?? {}).length !== 0) throw new Error("React package has runtime dependencies");
if (coreManifest.sideEffects !== false || reactManifest.sideEffects !== false) throw new Error("package tree-shaking metadata must declare sideEffects=false");
if (typeof coreManifest.exports?.["."]?.import !== "string" || typeof coreManifest.exports?.["."]?.types !== "string") throw new Error("core ESM/type exports are incomplete");
if (typeof reactManifest.exports?.["."]?.import !== "string" || typeof reactManifest.exports?.["."]?.types !== "string") throw new Error("React ESM/type exports are incomplete");

const coreFiles = walk(join(root, "dist/src"));
const vendorMatches = findProviderSpecificText(coreFiles.map((file) => ({ path: relative(root, file), contents: readFileSync(file, "utf8") })));
if (vendorMatches.length > 0) throw new Error(`core build contains provider-specific text: ${vendorMatches.join(", ")}`);

const requiredArtifacts = [
  "dist/src/index.js",
  "dist/src/index.d.ts",
  "dist/src/klinescript/worker.js",
  "dist/src/screener/worker.js",
  "packages/react/dist/index.js",
  "packages/react/dist/index.d.ts",
];
for (const artifact of requiredArtifacts) if (statSync(join(root, artifact)).isFile() !== true) throw new Error(`missing package artifact: ${artifact}`);

const imported = await import("../dist/src/index.js");
for (const name of ["createChart", "RestDatafeed", "WebSocketDatafeed", "createDeterministicScreenerUniverse"]) {
  if (typeof imported[name] !== "function") throw new Error(`public ESM export is unavailable: ${name}`);
}

const npmVersion = execFileSync("npm", ["--version"], { cwd: root, encoding: "utf8" }).trim();
const sizes = Object.fromEntries(requiredArtifacts.map((artifact) => [artifact, statSync(join(root, artifact)).size]));
console.log(JSON.stringify({
  status: "pass",
  node: process.version,
  npm: npmVersion,
  coreRuntimeDependencies: Object.keys(coreManifest.dependencies ?? {}).length,
  reactRuntimeDependencies: Object.keys(reactManifest.dependencies ?? {}).length,
  treeShaking: { coreSideEffects: coreManifest.sideEffects, reactSideEffects: reactManifest.sideEffects },
  sizes,
  workers: ["dist/src/klinescript/worker.js", "dist/src/screener/worker.js"],
  notes: [
    "This gate verifies package metadata, public ESM imports, declarations, worker artifacts, and provider-neutral core text",
    "It does not replace a bundler-specific tree-shaking analysis or cross-browser verification",
  ],
}, null, 2));

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && /\.(?:js|d\.ts|map)$/.test(entry.name)) files.push(path);
  }
  return files;
}

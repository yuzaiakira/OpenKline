import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  { directory: root, name: "openkline", allowReadme: true },
  { directory: join(root, "packages", "react"), name: "@openkline/react", allowReadme: false },
];

function readManifest(directory) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function pack(directory) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: directory,
    env: { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" },
    encoding: "utf8",
  });
  const entries = JSON.parse(output);
  if (!Array.isArray(entries) || entries.length !== 1) throw new Error(`Unexpected npm pack output for ${directory}`);
  return entries[0];
}

const results = packages.map(({ directory, name, allowReadme }) => {
  const manifest = readManifest(directory);
  if (manifest.name !== name) throw new Error(`Unexpected package name in ${directory}: ${manifest.name}`);
  if (Object.keys(manifest.dependencies ?? {}).length > 0) throw new Error(`${name} must not have runtime dependencies without a new package audit`);
  if (manifest.bundledDependencies !== undefined || manifest.bundleDependencies !== undefined) {
    throw new Error(`${name} must not declare bundled dependencies`);
  }
  if (manifest.license !== undefined) throw new Error(`${name} must not claim a license before owner approval`);
  if (!manifest.exports?.["."]?.import || !manifest.exports?.["."]?.types) {
    throw new Error(`${name} must expose ESM and declarations through the package root`);
  }
  const packed = pack(directory);
  const names = packed.files.map((file) => file.path);
  for (const file of names) {
    const allowed = file === "package.json" || (allowReadme && file === "README.md") || file.startsWith("dist/");
    if (!allowed) throw new Error(`${name} archive contains an unexpected file: ${file}`);
    if (/^(?:node_modules|\.env|artifacts|src)\//.test(file) || /(?:^|\/)(?:id_rsa|\.npmrc)$/i.test(file)) {
      throw new Error(`${name} archive contains a prohibited path: ${file}`);
    }
  }
  return {
    name,
    version: manifest.version,
    files: names.length,
    size: packed.size,
    unpackedSize: packed.unpackedSize,
    peerDependencies: manifest.peerDependencies ?? {},
    runtimeDependencies: manifest.dependencies ?? {},
    license: manifest.license ?? null,
  };
});

console.log(JSON.stringify({
  status: "pass",
  licenseStatus: "pending-owner-approval",
  packages: results,
}, null, 2));

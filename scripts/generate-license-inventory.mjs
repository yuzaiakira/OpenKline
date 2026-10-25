import { readFileSync, writeFileSync } from "node:fs";

const manifests = [
  ["package-lock.json", "root-dev"],
  ["examples/nextjs-app-router/package-lock.json", "next-example-prod"],
];
const entries = [];

for (const [file, scope] of manifests) {
  const lock = JSON.parse(readFileSync(file, "utf8"));
  for (const [key, packageInfo] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith("node_modules/")) continue;
    const name = key.slice("node_modules/".length);
    const local = name === "openkline" || name === "@openkline/react";
    entries.push({
      name,
      version: packageInfo.version ?? (local ? "0.1.0" : null),
      scope: local ? "local-workspace" : scope,
      license: packageInfo.license ?? null,
      resolved: packageInfo.resolved ?? null,
      integrity: packageInfo.integrity ?? null,
      licenseStatus: local ? "pending-project-license" : packageInfo.license ? "metadata-present" : "missing-metadata",
      shippedInRootPackage: false,
    });
  }
}

entries.sort((left, right) => left.name.localeCompare(right.name) || String(left.version).localeCompare(String(right.version)));
const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: manifests.map(([file]) => file),
  notes: [
    "License metadata is evidence for review, not a legal conclusion.",
    "The root openkline package has no runtime dependencies; root entries are development-only.",
    "The Next.js example lockfile is a development/example consumer tree and is not included in the root npm tarball.",
  ],
  entries,
};
writeFileSync("docs/audits/license-inventory.json", `${JSON.stringify(inventory, null, 2)}\n`);

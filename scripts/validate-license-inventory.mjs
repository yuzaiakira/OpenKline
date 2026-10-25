import { readFileSync } from "node:fs";

const inventory = JSON.parse(readFileSync("docs/audits/license-inventory.json", "utf8"));
const sources = [
  ["package-lock.json", "root-dev"],
  ["examples/nextjs-app-router/package-lock.json", "next-example-prod"],
];
const expected = [];

for (const [file, scope] of sources) {
  const lock = JSON.parse(readFileSync(file, "utf8"));
  for (const [key, packageInfo] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith("node_modules/")) continue;
    const name = key.slice("node_modules/".length);
    const local = name === "openkline" || name === "@openkline/react";
    expected.push({
      name,
      version: packageInfo.version ?? (local ? "0.1.0" : null),
      scope: local ? "local-workspace" : scope,
      license: packageInfo.license ?? null,
      resolved: packageInfo.resolved ?? null,
      integrity: packageInfo.integrity ?? null,
      local,
    });
  }
}

const actual = inventory.entries ?? [];
const keyOf = (entry) => `${entry.scope}:${entry.name}@${entry.version}`;
const actualByKey = new Map(actual.map((entry) => [keyOf(entry), entry]));
const expectedKeys = new Set(expected.map(keyOf));
const problems = [];

if (inventory.schemaVersion !== 1) problems.push(`unsupported schemaVersion: ${inventory.schemaVersion}`);
if (actual.length !== expected.length) problems.push(`entry count ${actual.length} does not match lockfile count ${expected.length}`);

for (const entry of expected) {
  const actualEntry = actualByKey.get(keyOf(entry));
  if (!actualEntry) {
    problems.push(`missing inventory entry: ${keyOf(entry)}`);
    continue;
  }
  for (const field of ["license", "resolved", "integrity"]) {
    if ((actualEntry[field] ?? null) !== entry[field]) {
      problems.push(`${keyOf(entry)} has stale ${field}`);
    }
  }
  if (entry.local) {
    if (actualEntry.licenseStatus !== "pending-project-license") {
      problems.push(`${keyOf(entry)} must remain pending-project-license`);
    }
  } else {
    if (actualEntry.licenseStatus !== (entry.license ? "metadata-present" : "missing-metadata")) {
      problems.push(`${keyOf(entry)} has inconsistent licenseStatus`);
    }
    if (entry.resolved === null || entry.integrity === null) {
      problems.push(`${keyOf(entry)} is missing lockfile provenance or integrity`);
    }
  }
}

for (const entry of actual) {
  if (!expectedKeys.has(keyOf(entry))) problems.push(`unexpected inventory entry: ${keyOf(entry)}`);
}

if (problems.length > 0) {
  console.error("[license-inventory] validation failed");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const scopes = actual.reduce((groups, entry) => {
  (groups[entry.scope] ??= []).push(entry);
  return groups;
}, {});
console.log(JSON.stringify({
  status: "pass",
  entries: actual.length,
  rootDevelopmentEntries: scopes["root-dev"]?.length ?? 0,
  nextExampleEntries: scopes["next-example-prod"]?.length ?? 0,
  localWorkspaceEntries: scopes["local-workspace"]?.length ?? 0,
  pendingProjectLicense: actual.filter((entry) => entry.licenseStatus === "pending-project-license").map((entry) => entry.name),
}, null, 2));

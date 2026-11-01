import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildInventory } from "./public-api-inventory.mjs";
import { compareDeclarationSurfaces, compareRootExports } from "./api-compatibility-ast.mjs";

const root = process.cwd();
const baseline = JSON.parse(readFileSync(join(root, "docs/audits/public-api-baseline.json"), "utf8"));
const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

function gitSource(commit, path) {
  return execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8" });
}

function currentSource(path) {
  return readFileSync(join(root, path), "utf8");
}

function strictDelta(inventory) {
  const keyOf = (entry) => `${entry.package}:${entry.kind}:${entry.name}`;
  const before = new Map(baseline.surface.map((entry) => [keyOf(entry), entry]));
  const after = new Map(inventory.surface.map((entry) => [keyOf(entry), entry]));
  const removed = [];
  const changed = [];
  const added = [];
  for (const [key, entry] of before) {
    const next = after.get(key);
    if (next === undefined) removed.push(key);
    else if (next.signatureHash !== entry.signatureHash) changed.push(key);
  }
  for (const [key] of after) if (!before.has(key)) added.push(key);
  return { removed, changed, added };
}

const inventory = buildInventory();
const baselineCommit = baseline.baselineCommit;
const chart = compareDeclarationSurfaces(
  gitSource(baselineCommit, "src/chart.ts"),
  currentSource("src/chart.ts"),
  "Chart",
  "class",
);
const workspace = compareDeclarationSurfaces(
  gitSource(baselineCommit, "src/workspace.ts"),
  currentSource("src/workspace.ts"),
  "WorkspaceDocument",
  "interface",
);
const workspaceRestore = compareDeclarationSurfaces(
  gitSource(baselineCommit, "src/workspace.ts"),
  currentSource("src/workspace.ts"),
  "WorkspaceRestoreOptions",
  "interface",
);
const rootExports = compareRootExports(gitSource(baselineCommit, "src/index.ts"), currentSource("src/index.ts"));
const delta = strictDelta(inventory);
const findings = [
  ...chart.removed.map((entry) => ({ surface: "Chart", ...entry })),
  ...chart.changed.map((entry) => ({ surface: "Chart", ...entry })),
  ...workspace.removed.map((entry) => ({ surface: "WorkspaceDocument", ...entry })),
  ...workspace.changed.map((entry) => ({ surface: "WorkspaceDocument", ...entry })),
  ...workspaceRestore.removed.map((entry) => ({ surface: "WorkspaceRestoreOptions", ...entry })),
  ...workspaceRestore.changed.map((entry) => ({ surface: "WorkspaceRestoreOptions", ...entry })),
  ...rootExports.removed.map((entry) => ({ surface: "root exports", category: "removed-export", ...entry, breaking: true })),
  ...rootExports.changed.map((entry) => ({ surface: "root exports", category: "re-export-module-changed", ...entry, breaking: true })),
];

const report = {
  schemaVersion: 1,
  status: findings.length === 0 ? "PASS_ADDITIVE_REVIEW_REQUIRED" : "FAIL_BREAKING_FINDINGS",
  baselineCommit,
  currentCommit,
  strictChecker: {
    command: "npm run api:check",
    removed: delta.removed,
    changed: delta.changed,
    additiveSurfaceCount: delta.added.length,
    policy: "Intentional additive public-surface updates require an owner-reviewed baseline adoption record before rewriting docs/audits/public-api-baseline.json.",
  },
  declarations: { Chart: chart, WorkspaceDocument: workspace, WorkspaceRestoreOptions: workspaceRestore },
  rootExports: {
    added: rootExports.added,
    removed: rootExports.removed,
    changed: rootExports.changed,
  },
  findings,
  decision: findings.length === 0
    ? "No structural removals or incompatible member changes were found. Review additive API and serialization changes before approving a new baseline."
    : "Breaking or uncertain structural changes require owner and maintainer review before any baseline update.",
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
if (findings.length > 0) process.exitCode = 1;

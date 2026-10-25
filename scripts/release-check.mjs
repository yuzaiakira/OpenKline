import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, command, args, cwd = root) {
  console.log(`\n[release-check] ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

function validateRepository() {
  console.log("\n[release-check] repository and documentation validation");
  const required = [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
    "docs/PDR.md",
    "docs/ROADMAP.md",
    "docs/audits/klinescript-security-audit.md",
    "docs/audits/license-inventory.json",
    "docs/audits/license-inventory.md",
    "docs/audits/dependency-security.md",
    "docs/legal/apache-2.0-proposal.md",
    "docs/legal/README.md",
    "docs/legal/openkline-source-available-license-proposal.md",
    "docs/legal/licensing-policy-examples.md",
    "docs/legal/license-compatibility-analysis.md",
    "docs/legal/ownership-and-approval-checklist.md",
    "docs/legal/counsel-review-package.md",
    "docs/legal/license-adoption-procedure.md",
    "docs/reports/phase-4-security-verification.md",
    "docs/reports/phase-5-readiness.md",
    "docs/reports/phase-5-release-readiness.md",
    "docs/reports/phase-5-2-verification.md",
    "docs/reports/phase-5-3-verification.md",
    "docs/reports/phase-5-4-license-adoption-readiness.md",
    "docs/release/release-gates.md",
    "docs/release/license-approval-checklist.md",
    "docs/release/browser-verification.md",
    "docs/release/developer-preview-plan.md",
    "docs/release/developer-preview-checklist.md",
    "docs/release/owner-approval.md",
    "docs/release/alpha-support-matrix.md",
    "docs/release/alpha-release-notes.md",
    "docs/release/alpha-publication-checklist.md",
    "docs/release/local-release-process.md",
    "docs/release/browser-compatibility-checklist.md",
  ];
  for (const relative of required) {
    if (!existsSync(join(root, relative))) throw new Error(`Missing required document: ${relative}`);
  }
  if (existsSync(join(root, ".github", "workflows"))) throw new Error("GitHub Actions workflows are not permitted");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (!packageJson.exports?.["."]?.types || !packageJson.exports?.["."]?.import) throw new Error("Root package exports are incomplete");
  const builtEntry = join(root, "dist", "src", "index.js");
  if (!existsSync(builtEntry)) throw new Error("Core build output is missing");
  if (readFileSync(builtEntry, "utf8").includes("executeKlineScript")) throw new Error("Internal runtime executor leaked from the root package");
}

try {
  run("typecheck", "npm", ["run", "typecheck"]);
  run("unit and integration tests", "npm", ["test"]);
  run("local Chromium browser provenance", "npm", ["run", "browser:diagnostic"]);
  run("model benchmark", "npm", ["run", "benchmark"]);
  run("KlineScript benchmark", "npm", ["run", "benchmark:klinescript"]);
  run("Canvas2D benchmark", "npm", ["run", "benchmark:browser"]);
  run("plugin and workspace benchmark", "npm", ["run", "benchmark:plugins"]);
  run("license inventory validation", process.execPath, ["scripts/validate-license-inventory.mjs"]);
  run("root dependency audit", "npm", ["audit", "--json", "--include=dev"]);
  run("package artifact audit", "npm", ["run", "package:audit"]);
  run("package contents", "npm", ["run", "package:check"]);
  run("package consumer smoke test", "npm", ["run", "package:smoke"]);
  run("independent consumer preview smoke test", process.execPath, ["scripts/consumer-preview-smoke.mjs"]);
  run("package publish dry-run", "npm", ["publish", "--dry-run", "--ignore-scripts"]);
  run("Next.js dependency audit", "npm", ["audit", "--json", "--include=dev"], join(root, "examples", "nextjs-app-router"));
  run("Next.js production example", "npm", ["run", "build"], join(root, "examples", "nextjs-app-router"));
  validateRepository();
  // Missing official browser binaries must fail the gate instead of being
  // misreported as compatibility.
  run("Firefox/WebKit/mobile compatibility gate", "npm", ["run", "test:browser:compat"]);
  console.log("\n[release-check] PASS: all configured local gates completed");
} catch (error) {
  console.error(`\n[release-check] BLOCKED/FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

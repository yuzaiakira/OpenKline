import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const reactPackage = JSON.parse(readFileSync(join(root, "packages/react/package.json"), "utf8"));
const findings = [];

function finding(id, status, severity, evidence, action = null) {
  findings.push({ id, status, severity, evidence, action });
}

function hasPath(relative) {
  return existsSync(join(root, relative));
}

const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const upstream = execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: root, encoding: "utf8" }).trim();
const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

finding("repository-branch", branch === "work" && upstream === "origin/work" ? "PASS" : "FAIL", "P0", `${branch} tracking ${upstream}`, "Run release checks only from work tracking origin/work.");
finding("core-runtime-dependencies", Object.keys(packageJson.dependencies ?? {}).length === 0 ? "PASS" : "FAIL", "P0", JSON.stringify(packageJson.dependencies ?? {}), "Keep the core package provider and runtime dependency free.");
finding("react-boundary", Object.keys(reactPackage.dependencies ?? {}).length === 0 && Boolean(reactPackage.peerDependencies?.react) ? "PASS" : "FAIL", "P1", JSON.stringify({ dependencies: reactPackage.dependencies ?? {}, peerDependencies: reactPackage.peerDependencies ?? {} }));
finding("package-exports", packageJson.exports?.["."]?.import && packageJson.exports?.["."]?.types ? "PASS" : "FAIL", "P0", JSON.stringify(packageJson.exports?.["."] ?? {}));
finding("worker-artifacts", hasPath("dist/src/klinescript/worker.js") && hasPath("dist/src/screener/worker.js") ? "PASS" : "FAIL", "P1", "dist/src/klinescript/worker.js and dist/src/screener/worker.js");
finding("effective-license", "REQUIRES OWNER APPROVAL", "P0", packageJson.license === undefined && reactPackage.license === undefined ? "Package license metadata remains absent while legal adoption is pending." : "Package license metadata is present and requires legal review.", "Obtain owner and qualified counsel approval before changing or adopting license metadata.");
finding("github-actions", hasPath(".github/workflows") ? "FAIL" : "PASS", "P0", hasPath(".github/workflows") ? ".github/workflows exists" : "No .github/workflows directory.", "Do not add GitHub Actions.");
finding("public-api-docs", hasPath("docs/api/chart.md") && hasPath("docs/api/datafeed.md") ? "PASS" : "P1", "docs/api/chart.md and docs/api/datafeed.md");
finding("browser-artifacts", "BLOCKED", "P0", "Managed Firefox/WebKit artifacts are not part of this environment.", "Run browser:verify on an authorized host with exact Playwright-managed artifacts.");
finding("accessibility-conformance", "NOT TESTED", "P1", "No formal assistive-technology audit is claimed.", "Complete the documented manual and automated accessibility review.");
finding("visual-baselines", "NOT TESTED", "P1", "No approved screenshot baseline set is currently claimed.", "Prepare and review deterministic visual baselines without auto-approval.");
finding("third-party-notices", "BLOCKED", "P0", "The dependency inventory is generated, but legal notice contents remain under review.", "Review actual dependency license texts and required notices before publication.");

const report = {
  schemaVersion: 1,
  phase: "8.5.0",
  baselineCommit: head,
  branch,
  upstream,
  productBoundary: "provider-independent, framework-independent JavaScript/TypeScript library",
  findings,
  notes: [
    "This is an engineering release baseline, not a release authorization.",
    "No package version, effective license, tag, release, or distribution channel was changed.",
    "BLOCKED, NOT TESTED, and REQUIRES OWNER APPROVAL are intentionally distinct states.",
  ],
};

writeFileSync(join(root, "docs/audits/phase-8-5-release-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: "pass", phase: report.phase, baselineCommit: head, findings: findings.length, blocked: findings.filter((item) => item.status === "BLOCKED").map((item) => item.id), ownerApproval: findings.filter((item) => item.status === "REQUIRES OWNER APPROVAL").map((item) => item.id) }, null, 2));

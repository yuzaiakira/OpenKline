import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidenceDirectory = join(root, "docs", "evidence", "browser", "phase-8-6-1");
const requiredFiles = ["README.md", "browser-matrix.json", "manifest.json", "test-cases.json"];
const expectedSourceCommit = "19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa";
const expectedProjects = ["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"];
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(evidenceDirectory, name), "utf8"));
  } catch (error) {
    fail(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

const actualFiles = (() => {
  try {
    return readdirSync(evidenceDirectory).sort();
  } catch (error) {
    fail(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
})();
assert(JSON.stringify(actualFiles) === JSON.stringify(requiredFiles), `unexpected evidence files: ${actualFiles.join(", ")}`);

const manifest = readJson("manifest.json");
const matrix = readJson("browser-matrix.json");
const testCases = readJson("test-cases.json");
const textFiles = requiredFiles.map((name) => {
  try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
});

for (const document of [manifest, matrix, testCases]) {
  assert(document?.schemaVersion === 1, "all JSON evidence documents must use schemaVersion 1");
  assert(document?.sourceCommit === expectedSourceCommit, "all evidence documents must name the tested source commit");
}
assert(manifest?.phase === "8.6.1", "manifest phase must be 8.6.1");
assert(manifest?.playwright?.testPackageVersion === "1.64.1", "Playwright test package version mismatch");
assert(manifest?.playwright?.cliVersion === "1.64.1", "Playwright CLI version mismatch");
assert(manifest?.container?.image === "mcr.microsoft.com/playwright:v1.64.1-noble", "official container image mismatch");
assert(manifest?.container?.digest === "sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea", "official container digest mismatch");
assert(manifest?.container?.digestVerifiedOnHost === true, "container digest was not host-verified");
assert(manifest?.execution?.notCloudWorkspace === true, "trusted-machine provenance is missing");
assert(manifest?.execution?.physicalDeviceTesting === false, "physical-device limitation is missing");
assert(manifest?.archives?.remainOnTrustedMachineOnly === true, "archive handling policy is missing");
assert(manifest?.archives?.publishedToGitHub === false, "archives must not be published to GitHub");
assert(manifest?.results?.status === "verified" && manifest?.results?.exitCode === 0, "manifest result status is not verified");

const matrixProjects = matrix?.projects?.map((project) => project.project) ?? [];
assert(JSON.stringify(matrixProjects) === JSON.stringify(expectedProjects), "browser project list mismatch");
assert(matrix?.projects?.every((project) => project.status === "available" && project.distribution === "Playwright-managed"), "every browser must be Playwright-managed and available");
assert(matrix?.overall?.expected === 70 && matrix?.overall?.unexpected === 0 && matrix?.overall?.skipped === 0 && matrix?.overall?.flaky === 0 && matrix?.overall?.status === "verified", "overall browser totals mismatch");

const keys = new Set();
let recordCount = 0;
for (const project of expectedProjects) {
  const records = testCases?.byBrowser?.[project];
  const totals = matrix?.perProjectTotals?.[project];
  assert(Array.isArray(records), `${project}: test records are missing`);
  assert(records?.length === 14, `${project}: expected 14 test records`);
  assert(totals?.total === 14 && totals?.passed === 14 && totals?.failed === 0 && totals?.skipped === 0 && totals?.flaky === 0, `${project}: totals mismatch`);
  for (const record of records ?? []) {
    const key = `${project}\0${record.file}\0${record.title}`;
    assert(!keys.has(key), `duplicate test record: ${key}`);
    keys.add(key);
    assert(record.outcome === "expected" && record.resultStatus === "passed", `non-passing test record: ${key}`);
    assert(Number.isFinite(record.durationMs) && record.durationMs >= 0, `invalid test duration: ${key}`);
    recordCount += 1;
  }
}
assert(testCases?.totalRecords === 70 && recordCount === 70 && keys.size === 70, "test record count or uniqueness mismatch");

for (const [name, artifact] of Object.entries(manifest?.sourceArtifactHashes ?? {})) {
  assert(validSha(artifact?.sha256), `invalid source artifact SHA-256: ${name}`);
  assert(Number.isInteger(artifact?.bytes) && artifact.bytes >= 0, `invalid source artifact byte count: ${name}`);
}
for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
  if (archive && typeof archive === "object" && "sha256" in archive) assert(validSha(archive.sha256), `invalid archive SHA-256: ${name}`);
}

const forbiddenPatterns = [
  /\/home\//,
  /\/Users\//,
  /\/root\//,
  /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/,
  /(?:ghp_|github_pat_|AKIA[0-9A-Z]{16})/,
  /Authorization:\s*Bearer/i,
  /password\s*=/i,
  /secret\s*=/i,
];
for (const [index, text] of textFiles.entries()) {
  for (const pattern of forbiddenPatterns) assert(!pattern.test(text), `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
}

const result = {
  schemaVersion: 1,
  status: failures.length === 0 ? "PASS" : "FAIL",
  sourceCommit: expectedSourceCommit,
  files: actualFiles,
  testRecords: recordCount,
  perProject: Object.fromEntries(expectedProjects.map((project) => [project, testCases?.byBrowser?.[project]?.length ?? 0])),
  totals: matrix?.overall ?? null,
  archiveHashes: Object.values(manifest?.archives ?? {}).filter((value) => value && typeof value === "object" && "sha256" in value).map((value) => value.sha256),
  sanitization: failures.some((failure) => failure.includes("sanitization")) ? "FAIL" : "PASS",
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;

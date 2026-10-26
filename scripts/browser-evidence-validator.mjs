import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const REQUIRED_EVIDENCE_FILES = ["README.md", "browser-matrix.json", "manifest.json", "test-cases.json"];
export const REQUIRED_PROJECTS = ["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"];

const OFFICIAL_PLAYWRIGHT = {
  testPackageVersion: "1.64.1",
  cliVersion: "1.64.1",
  image: "mcr.microsoft.com/playwright:v1.64.1-noble",
  digest: "sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea",
};

export const EVIDENCE_PACK_POLICIES = Object.freeze({
  "8.6.1": Object.freeze({
    directory: "phase-8-6-1",
    phase: "8.6.1",
    expectedSourceCommit: "19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa",
  }),
  "8.8.1": Object.freeze({
    directory: "phase-8-8-1",
    phase: "8.8.1",
    expectedSourceCommit: "2aabccf184e3c791c18ac3daa4bbeef89d89ed63",
    expectedArchiveSha256: "ade5be7fb4fb598d2db79b59c489673244c73315f6e060f059f2880687634bbe",
  }),
});

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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function readJson(path, failures, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function assert(condition, failures, message) {
  if (!condition) failures.push(message);
}

function validateProjectTotals({ project, totals, records, failures }) {
  assert(isRecord(totals), failures, `${project}: per-project totals are missing`);
  assert(Array.isArray(records), failures, `${project}: test records are missing`);
  assert(records?.length === 14, failures, `${project}: expected 14 test records`);
  assert(totals?.total === 14 && totals?.passed === 14 && totals?.failed === 0 && totals?.skipped === 0 && totals?.flaky === 0, failures, `${project}: totals mismatch`);
}

function validateStudioSupplemental(manifest, matrix, failures) {
  const probe = manifest?.studioSupplementalProbe;
  if (probe === undefined) return;
  assert(isRecord(probe), failures, "manifest studio supplemental probe must be an object");
  assert(probe?.occurred === true, failures, "manifest studio supplemental probe must record that it occurred");
  assert(probe?.reliableFiveBrowserStudioMatrix === false, failures, "Studio supplemental probe must not be promoted to a reliable matrix");
  assert(probe?.permanentConfigsModified === false, failures, "Studio supplemental probe must not modify permanent configs");
  assert(isRecord(probe?.details), failures, "Studio supplemental probe details are missing");
  const stats = probe?.details?.stats;
  assert(stats?.expected === 75 && stats?.unexpected === 30 && stats?.skipped === 0 && stats?.flaky === 0, failures, "Studio supplemental aggregate totals mismatch");
  const projectTotals = probe?.details?.perProjectPassedFailed;
  for (const project of REQUIRED_PROJECTS) {
    const total = projectTotals?.[project];
    assert(total?.total === 21 && total?.passed + total?.failed === 21, failures, `Studio supplemental ${project} totals mismatch`);
  }
  assert(matrix?.studioSupplemental?.reliableFiveBrowserStudioMatrix === false, failures, "matrix must preserve the Studio supplemental limitation");
  assert(matrix?.studioSupplemental?.managedBrowserProbeExitCode === 1, failures, "matrix must preserve the Studio supplemental non-zero exit code");
}

function validateBrowserMatrix(matrix, manifest, testCases, policy, failures) {
  assert(isRecord(matrix), failures, "browser-matrix.json must contain an object");
  assert(matrix?.schemaVersion === 1, failures, "browser-matrix.json must use schemaVersion 1");
  assert(matrix?.sourceCommit === policy.expectedSourceCommit, failures, "browser matrix source SHA does not match its pack policy");
  assert(matrix?.playwrightVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "browser matrix Playwright version mismatch");
  assert(matrix?.containerImage === OFFICIAL_PLAYWRIGHT.image, failures, "browser matrix container image mismatch");
  assert(matrix?.containerDigest === OFFICIAL_PLAYWRIGHT.digest, failures, "browser matrix container digest mismatch");
  assert(Array.isArray(matrix?.projects), failures, "browser matrix projects are missing");
  assert(JSON.stringify(matrix?.projects?.map((project) => project.project)) === JSON.stringify(REQUIRED_PROJECTS), failures, "browser project list mismatch");

  const expectedBrowserNames = {
    chromium: "chromium",
    firefox: "firefox",
    webkit: "webkit",
    "mobile-chrome": "chromium",
    "mobile-safari": "webkit",
  };
  for (const project of matrix?.projects ?? []) {
    assert(project?.browserName === expectedBrowserNames[project.project], failures, `${project?.project}: browser name mismatch`);
    assert(project?.distribution === "Playwright-managed" && project?.status === "available", failures, `${project?.project}: browser provenance/status mismatch`);
    assert(typeof project?.browserVersion === "string" && project.browserVersion.length > 0, failures, `${project?.project}: browser version is missing`);
    assert(typeof project?.executablePathInContainer === "string" && project.executablePathInContainer.startsWith("/ms-playwright/"), failures, `${project?.project}: managed executable path is missing`);
    assert(typeof project?.userAgent === "string" && project.userAgent.length > 0, failures, `${project?.project}: user agent is missing`);
    const expectedEmulation = project.project.startsWith("mobile-") ? project.project : null;
    assert(project?.deviceEmulation === expectedEmulation, failures, `${project?.project}: device emulation mismatch`);
  }

  assert(isRecord(matrix?.perProjectTotals), failures, "per-project totals are missing");
  const keys = new Set();
  let recordCount = 0;
  for (const project of REQUIRED_PROJECTS) {
    const records = testCases?.byBrowser?.[project];
    validateProjectTotals({ project, totals: matrix?.perProjectTotals?.[project], records, failures });
    for (const record of records ?? []) {
      const key = `${project}\0${record?.file}\0${record?.title}`;
      assert(!keys.has(key), failures, `duplicate test record: ${key}`);
      keys.add(key);
      assert(typeof record?.file === "string" && record.file.length > 0, failures, `${key}: test file is missing`);
      assert(typeof record?.title === "string" && record.title.length > 0, failures, `${key}: test title is missing`);
      assert(record?.outcome === "expected" && record?.resultStatus === "passed", failures, `non-passing test record: ${key}`);
      assert(finiteNonNegative(record?.durationMs), failures, `invalid test duration: ${key}`);
      recordCount += 1;
    }
  }
  assert(testCases?.totalRecords === 70 && recordCount === 70 && keys.size === 70, failures, "test record count or uniqueness mismatch");
  assert(matrix?.overall?.expected === 70 && matrix?.overall?.unexpected === 0 && matrix?.overall?.skipped === 0 && matrix?.overall?.flaky === 0 && matrix?.overall?.status === "verified", failures, "overall browser totals mismatch");
  assert(manifest?.results?.stats?.expected === matrix?.overall?.expected, failures, "manifest and matrix expected totals differ");
  assert(manifest?.results?.stats?.unexpected === matrix?.overall?.unexpected, failures, "manifest and matrix unexpected totals differ");
  return { recordCount, projects: Object.fromEntries(REQUIRED_PROJECTS.map((project) => [project, testCases?.byBrowser?.[project]?.length ?? 0])) };
}

export function validateEvidencePack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify(REQUIRED_EVIDENCE_FILES), failures, `unexpected evidence files: ${actualFiles.join(", ")}`);

  const manifest = readJson(join(evidenceDirectory, "manifest.json"), failures, "manifest.json");
  const matrix = readJson(join(evidenceDirectory, "browser-matrix.json"), failures, "browser-matrix.json");
  const testCases = readJson(join(evidenceDirectory, "test-cases.json"), failures, "test-cases.json");
  const textFiles = REQUIRED_EVIDENCE_FILES.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  for (const [name, document] of [["manifest.json", manifest], ["browser-matrix.json", matrix], ["test-cases.json", testCases]]) {
    assert(isRecord(document), failures, `${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `${name} must use schemaVersion 1`);
    assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `${name} source SHA does not match its pack policy`);
  }
  assert(manifest?.phase === policy.phase, failures, `manifest phase must be ${policy.phase}`);
  assert(manifest?.evidenceKind === "trusted-machine-portable-browser-matrix", failures, "evidence kind mismatch");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Playwright browser path mismatch");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "official container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "trusted-host provenance is missing");
  assert(manifest?.execution?.notCloudWorkspace === true, failures, "trusted-host provenance must not claim cloud execution");
  assert(manifest?.execution?.cloudVerification === "not-used-for-this-evidence", failures, "cloud verification boundary is missing");
  assert(manifest?.execution?.localDiagnosticLane === "not-used-for-this-evidence", failures, "local diagnostic boundary is missing");
  assert(manifest?.execution?.physicalDeviceTesting === false, failures, "physical-device limitation is missing");
  assert(typeof manifest?.execution?.mobileSafariNote === "string" && /emulation/i.test(manifest.execution.mobileSafariNote), failures, "mobile Safari emulation limitation is missing");
  assert(manifest?.results?.status === "verified" && manifest?.results?.exitCode === 0, failures, "manifest result status is not verified");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true, failures, "archive handling policy is missing");
  assert(manifest?.archives?.publishedToGitHub === false, failures, "archives must not be published to GitHub");

  for (const [name, artifact] of Object.entries(manifest?.sourceArtifactHashes ?? {})) {
    assert(validSha(artifact?.sha256), failures, `invalid source artifact SHA-256: ${name}`);
    assert(Number.isInteger(artifact?.bytes) && artifact.bytes >= 0, failures, `invalid source artifact byte count: ${name}`);
  }
  const archiveHashes = [];
  for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
    if (isRecord(archive) && "sha256" in archive) {
      assert(validSha(archive.sha256), failures, `invalid archive SHA-256: ${name}`);
      archiveHashes.push(archive.sha256);
    }
  }
  if (policy.expectedArchiveSha256 !== undefined) {
    assert(archiveHashes.includes(policy.expectedArchiveSha256), failures, `${policy.phase}: expected trusted archive SHA-256 is missing`);
  }

  const matrixSummary = validateBrowserMatrix(matrix, manifest, testCases, policy, failures);
  validateStudioSupplemental(manifest, matrix, failures);
  for (const [index, text] of textFiles.entries()) {
    for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${REQUIRED_EVIDENCE_FILES[index]}`);
  }

  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: matrixSummary.recordCount,
    perProject: matrixSummary.projects,
    totals: matrix?.overall ?? null,
    archiveHashes,
    sanitization: failures.some((failure) => failure.includes("sanitization")) ? "FAIL" : "PASS",
    failures,
  };
}

export function validateAllEvidencePacks({ evidenceRoot, policies = Object.values(EVIDENCE_PACK_POLICIES) }) {
  const packs = policies.map((policy) => validateEvidencePack({ evidenceRoot, policy }));
  return {
    schemaVersion: 1,
    status: packs.every((pack) => pack.status === "PASS") ? "PASS" : "FAIL",
    packs,
    failures: packs.flatMap((pack) => pack.failures.map((failure) => `${pack.phase}: ${failure}`)),
  };
}

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const REQUIRED_EVIDENCE_FILES = ["README.md", "browser-matrix.json", "manifest.json", "test-cases.json"];
export const REQUIRED_PROJECTS = ["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"];
export const REQUIRED_PHASE_883_EVIDENCE_FILES = [
  "README.md",
  "manifest.json",
  "standalone-matrix.json",
  "standalone-test-cases.json",
  "studio-failures.json",
  "studio-matrix.json",
  "studio-test-cases.json",
];
export const REQUIRED_PHASE_885_EVIDENCE_FILES = [
  "README.md",
  "manifest.json",
  "regression-comparison.json",
  "standalone-matrix.json",
  "standalone-test-cases.json",
  "studio-failures.json",
  "studio-matrix.json",
  "studio-test-cases.json",
];
export const STUDIO_PROJECTS = ["studio-chromium", "studio-firefox", "studio-webkit", "studio-mobile-chrome", "studio-mobile-safari"];

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
    requiredFiles: REQUIRED_EVIDENCE_FILES,
  }),
  "8.8.1": Object.freeze({
    directory: "phase-8-8-1",
    phase: "8.8.1",
    expectedSourceCommit: "2aabccf184e3c791c18ac3daa4bbeef89d89ed63",
    expectedArchiveSha256: "ade5be7fb4fb598d2db79b59c489673244c73315f6e060f059f2880687634bbe",
    requiredFiles: REQUIRED_EVIDENCE_FILES,
  }),
  "8.8.3": Object.freeze({
    directory: "phase-8-8-3",
    phase: "8.8.3",
    expectedSourceCommit: "8a62e324cf0bcb25c79d380d25269ddda33c3deb",
    requiredFiles: REQUIRED_PHASE_883_EVIDENCE_FILES,
  }),
  "8.8.5": Object.freeze({
    directory: "phase-8-8-5",
    phase: "8.8.5",
    expectedSourceCommit: "241026e3b1eb3cebd0bbb78dd17daea8028b3203",
    expectedPreviousSourceCommit: "8a62e324cf0bcb25c79d380d25269ddda33c3deb",
    requiredFiles: REQUIRED_PHASE_885_EVIDENCE_FILES,
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
  if (policy.phase === "8.8.3") return validatePhase883Pack({ evidenceRoot, policy });
  if (policy.phase === "8.8.5") return validatePhase885Pack({ evidenceRoot, policy });
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requiredFiles = policy.requiredFiles ?? REQUIRED_EVIDENCE_FILES;
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected evidence files: ${actualFiles.join(", ")}`);

  const manifest = readJson(join(evidenceDirectory, "manifest.json"), failures, "manifest.json");
  const matrix = readJson(join(evidenceDirectory, "browser-matrix.json"), failures, "browser-matrix.json");
  const testCases = readJson(join(evidenceDirectory, "test-cases.json"), failures, "test-cases.json");
  const textFiles = requiredFiles.map((name) => {
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
    for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
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

function validatePhase883Pack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  const requiredFiles = policy.requiredFiles ?? REQUIRED_PHASE_883_EVIDENCE_FILES;
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected evidence files: ${actualFiles.join(", ")}`);

  const read = (name) => readJson(join(evidenceDirectory, name), failures, name);
  const manifest = read("manifest.json");
  const standaloneMatrix = read("standalone-matrix.json");
  const standaloneCases = read("standalone-test-cases.json");
  const studioFailures = read("studio-failures.json");
  const studioMatrix = read("studio-matrix.json");
  const studioCases = read("studio-test-cases.json");
  const textFiles = requiredFiles.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  for (const [name, document] of [
    ["manifest.json", manifest],
    ["standalone-matrix.json", standaloneMatrix],
    ["standalone-test-cases.json", standaloneCases],
    ["studio-failures.json", studioFailures],
    ["studio-matrix.json", studioMatrix],
    ["studio-test-cases.json", studioCases],
  ]) {
    assert(isRecord(document), failures, `${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `${name} must use schemaVersion 1`);
    assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `${name} source SHA does not match its pack policy`);
  }

  assert(manifest?.phase === policy.phase, failures, "manifest phase must be 8.8.3");
  assert(manifest?.evidenceKind === "trusted-machine-standalone-and-studio-browser-matrix", failures, "Phase 8.8.3 evidence kind mismatch");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.3 Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Phase 8.8.3 Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Phase 8.8.3 Playwright browser path mismatch");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "Phase 8.8.3 official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "Phase 8.8.3 container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "Phase 8.8.3 container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "Phase 8.8.3 trusted-host provenance is missing");
  assert(manifest?.execution?.notCloudWorkspace === true, failures, "Phase 8.8.3 provenance must not claim cloud execution");
  assert(manifest?.execution?.cloudVerification === "not-used-for-this-evidence", failures, "Phase 8.8.3 cloud boundary is missing");
  assert(manifest?.execution?.physicalDeviceTesting === false, failures, "Phase 8.8.3 physical-device limitation is missing");
  assert(manifest?.execution?.productFixesImplementedOnManjaro === false, failures, "Phase 8.8.3 trusted host must not claim product fixes");
  assert(manifest?.execution?.originWorkModified === false, failures, "Phase 8.8.3 trusted host must not claim origin/work modifications");
  assert(manifest?.standaloneResults?.status === "verified" && manifest?.standaloneResults?.exitCode === 0, failures, "Phase 8.8.3 standalone result is not verified");
  assert(manifest?.standaloneResults?.stats?.expected === 70 && manifest?.standaloneResults?.stats?.unexpected === 0 && manifest?.standaloneResults?.stats?.skipped === 0 && manifest?.standaloneResults?.stats?.flaky === 0, failures, "Phase 8.8.3 standalone totals mismatch");
  assert(manifest?.studioResults?.status === "FAIL" && manifest?.studioResults?.exitCode === 1, failures, "Phase 8.8.3 Studio result must preserve compatibility failure");
  assert(manifest?.studioResults?.stats?.expected === 75 && manifest?.studioResults?.stats?.unexpected === 30 && manifest?.studioResults?.stats?.skipped === 0 && manifest?.studioResults?.stats?.flaky === 0, failures, "Phase 8.8.3 Studio totals mismatch");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true, failures, "Phase 8.8.3 archive handling policy is missing");
  assert(manifest?.archives?.publishedToGitHub === false, failures, "Phase 8.8.3 archives must not be published to GitHub");

  for (const [group, artifacts] of Object.entries(manifest?.sourceArtifactHashes ?? {})) {
    assert(isRecord(artifacts), failures, `Phase 8.8.3 source artifacts ${group} are missing`);
    for (const [name, artifact] of Object.entries(artifacts ?? {})) {
      assert(validSha(artifact?.sha256), failures, `invalid Phase 8.8.3 source artifact SHA-256: ${group}/${name}`);
      assert(Number.isInteger(artifact?.bytes) && artifact.bytes >= 0, failures, `invalid Phase 8.8.3 source artifact byte count: ${group}/${name}`);
    }
  }
  for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
    if (isRecord(archive) && "sha256" in archive) assert(validSha(archive.sha256), failures, `invalid Phase 8.8.3 archive SHA-256: ${name}`);
  }

  const expectedBrowserNames = { chromium: "chromium", firefox: "firefox", webkit: "webkit", "mobile-chrome": "chromium", "mobile-safari": "webkit" };
  const expectedStudioBrowserNames = { "studio-chromium": "chromium", "studio-firefox": "firefox", "studio-webkit": "webkit", "studio-mobile-chrome": "chromium", "studio-mobile-safari": "webkit" };
  function validateProjects(projects, names, browserNames, label) {
    assert(Array.isArray(projects), failures, `${label} projects are missing`);
    assert(JSON.stringify(projects?.map((project) => project.project)) === JSON.stringify(names), failures, `${label} project list mismatch`);
    for (const project of projects ?? []) {
      assert(project?.browserName === browserNames[project.project], failures, `${label} ${project?.project}: browser name mismatch`);
      assert(project?.distribution === "Playwright-managed" && project?.status === "available", failures, `${label} ${project?.project}: browser provenance/status mismatch`);
      assert(typeof project?.browserVersion === "string" && project.browserVersion.length > 0, failures, `${label} ${project?.project}: browser version is missing`);
      assert(typeof project?.executablePathInContainer === "string" && project.executablePathInContainer.startsWith("/ms-playwright/"), failures, `${label} ${project?.project}: managed executable path is missing`);
      assert(typeof project?.userAgent === "string" && project.userAgent.length > 0, failures, `${label} ${project?.project}: user agent is missing`);
    }
  }
  validateProjects(standaloneMatrix?.projects, REQUIRED_PROJECTS, expectedBrowserNames, "standalone");
  validateProjects(studioMatrix?.projects, STUDIO_PROJECTS, expectedStudioBrowserNames, "Studio");
  assert(standaloneMatrix?.kind === "standalone-portable-library", failures, "standalone matrix kind mismatch");
  assert(standaloneMatrix?.playwrightVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion && standaloneMatrix?.containerImage === OFFICIAL_PLAYWRIGHT.image && standaloneMatrix?.containerDigest === OFFICIAL_PLAYWRIGHT.digest, failures, "standalone matrix provenance mismatch");
  assert(studioMatrix?.kind === "studio-managed-browser-compatibility", failures, "Studio matrix kind mismatch");
  assert(studioMatrix?.playwrightVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion && studioMatrix?.containerImage === OFFICIAL_PLAYWRIGHT.image && studioMatrix?.containerDigest === OFFICIAL_PLAYWRIGHT.digest, failures, "Studio matrix provenance mismatch");
  assert(studioMatrix?.status === "FAIL" && studioMatrix?.exitCode === 1, failures, "Studio matrix must preserve FAIL status");
  assert(studioMatrix?.discoveryTotal === 105 && studioMatrix?.stats?.expected === 75 && studioMatrix?.stats?.unexpected === 30, failures, "Studio matrix aggregate totals mismatch");

  function validateStandaloneRecords() {
    const keys = new Set();
    let count = 0;
    for (const project of REQUIRED_PROJECTS) {
      const records = standaloneCases?.byBrowser?.[project];
      assert(Array.isArray(records) && records.length === 14, failures, `standalone ${project}: expected 14 records`);
      const totals = standaloneMatrix?.perProject?.[project];
      assert(totals?.passed === 14 && totals?.failed === 0 && totals?.skipped === 0 && totals?.flaky === 0 && totals?.total === 14, failures, `standalone ${project}: totals mismatch`);
      for (const record of records ?? []) {
        const key = `${project}\0${record?.file}\0${record?.title}`;
        assert(!keys.has(key), failures, `duplicate standalone test record: ${key}`); keys.add(key);
        assert(typeof record?.file === "string" && record.file.length > 0 && typeof record?.title === "string" && record.title.length > 0, failures, `${key}: standalone test identity is missing`);
        assert(record?.outcome === "expected" && record?.resultStatus === "passed", failures, `non-passing standalone test record: ${key}`);
        assert(finiteNonNegative(record?.durationMs), failures, `invalid standalone test duration: ${key}`); count += 1;
      }
    }
    assert(standaloneCases?.totalRecords === 70 && count === 70 && keys.size === 70, failures, "standalone test record count or uniqueness mismatch");
  }

  const failureClassifications = new Set(["timeout", "timeout-pointer-interception", "assertion-element-not-found", "assertion-element-hidden", "page-error-resizeobserver"]);
  function validateStudioRecords() {
    const keys = new Set();
    const failuresByKey = new Map();
    for (const failure of studioFailures?.failures ?? []) {
      const key = `${failure?.project}\0${failure?.file}\0${failure?.title}`;
      assert(!failuresByKey.has(key), failures, `duplicate Studio failure record: ${key}`); failuresByKey.set(key, failure);
      assert(STUDIO_PROJECTS.includes(failure?.project), failures, `unknown Studio failure project: ${key}`);
      assert(typeof failure?.file === "string" && typeof failure?.title === "string", failures, `Studio failure identity is missing: ${key}`);
      assert(failureClassifications.has(failure?.classification), failures, `unknown Studio failure classification: ${key}`);
      assert(typeof failure?.errorMessage === "string" && failure.errorMessage.length > 0, failures, `Studio failure error is missing: ${key}`);
      assert(typeof failure?.diagnosticSufficiency === "string" && failure.diagnosticSufficiency.length > 0, failures, `Studio failure diagnostic sufficiency is missing: ${key}`);
      assert(Array.isArray(failure?.reproductionSteps) && failure.reproductionSteps.length > 0, failures, `Studio failure reproduction steps are missing: ${key}`);
      assert(isRecord(failure?.observedFactVsHypothesis), failures, `Studio failure observation is missing: ${key}`);
    }
    assert(studioFailures?.failureCount === 30 && studioFailures?.failures?.length === 30, failures, "Studio failure ledger count mismatch");
    assert(isRecord(studioFailures?.classificationCounts), failures, "Studio failure classification counts are missing");
    assert(Object.values(studioFailures?.classificationCounts ?? {}).reduce((sum, value) => sum + value, 0) === 30, failures, "Studio failure classification counts do not reconcile");
    let count = 0; let passed = 0; let unexpected = 0;
    for (const project of STUDIO_PROJECTS) {
      const records = studioCases?.byBrowser?.[project];
      assert(Array.isArray(records) && records.length === 21, failures, `Studio ${project}: expected 21 records`);
      const totals = studioMatrix?.perProject?.[project];
      assert(totals?.passed + totals?.failed === 21 && totals?.total === 21, failures, `Studio ${project}: matrix totals mismatch`);
      for (const record of records ?? []) {
        const key = `${project}\0${record?.file}\0${record?.title}`;
        assert(!keys.has(key), failures, `duplicate Studio test record: ${key}`); keys.add(key);
        assert(typeof record?.file === "string" && record.file.length > 0 && typeof record?.title === "string" && record.title.length > 0, failures, `${key}: Studio test identity is missing`);
        assert(finiteNonNegative(record?.durationMs), failures, `invalid Studio test duration: ${key}`);
        if (record?.resultStatus === "passed") {
          assert(record?.outcome === "expected", failures, `passing Studio record has wrong outcome: ${key}`); passed += 1;
        } else {
          assert(record?.outcome === "unexpected" && (record?.resultStatus === "failed" || record?.resultStatus === "timedOut"), failures, `failed Studio record has invalid result status: ${key}`);
          assert(typeof record?.errorMessage === "string" && record.errorMessage.length > 0, failures, `failed Studio record error is missing: ${key}`);
          assert(failuresByKey.has(key), failures, `failed Studio record missing from failure ledger: ${key}`); unexpected += 1;
        }
        count += 1;
      }
    }
    for (const key of failuresByKey.keys()) assert(keys.has(key), failures, `failure ledger record missing from Studio test cases: ${key}`);
    assert(studioCases?.totalRecords === 105 && count === 105 && keys.size === 105, failures, "Studio test record count or uniqueness mismatch");
    assert(studioCases?.includesPassAndFail === true && passed === 75 && unexpected === 30, failures, "Studio pass/fail totals mismatch");
  }

  validateStandaloneRecords();
  validateStudioRecords();
  for (const [index, text] of textFiles.entries()) for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: 175,
    perProject: {
      standalone: Object.fromEntries(REQUIRED_PROJECTS.map((project) => [project, standaloneMatrix?.perProject?.[project]?.total ?? 0])),
      studio: Object.fromEntries(STUDIO_PROJECTS.map((project) => [project, studioMatrix?.perProject?.[project]?.total ?? 0])),
    },
    totals: { standaloneExpected: 70, standaloneUnexpected: 0, studioExpected: 75, studioUnexpected: 30 },
    archiveHashes: Object.values(manifest?.archives ?? {}).filter((archive) => isRecord(archive) && "sha256" in archive).map((archive) => archive.sha256),
    sanitization: failures.some((failure) => failure.includes("sanitization")) ? "FAIL" : "PASS",
    failures,
  };
}

function validatePhase885Pack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  const requiredFiles = policy.requiredFiles ?? REQUIRED_PHASE_885_EVIDENCE_FILES;
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected evidence files: ${actualFiles.join(", ")}`);

  const read = (name) => readJson(join(evidenceDirectory, name), failures, name);
  const manifest = read("manifest.json");
  const comparison = read("regression-comparison.json");
  const standaloneMatrix = read("standalone-matrix.json");
  const standaloneCases = read("standalone-test-cases.json");
  const studioFailures = read("studio-failures.json");
  const studioMatrix = read("studio-matrix.json");
  const studioCases = read("studio-test-cases.json");
  const previousStudioFailures = readJson(join(evidenceRoot, "phase-8-8-3", "studio-failures.json"), failures, "phase 8.8.3 studio-failures.json");
  const textFiles = requiredFiles.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  for (const [name, document] of [
    ["manifest.json", manifest],
    ["standalone-matrix.json", standaloneMatrix],
    ["standalone-test-cases.json", standaloneCases],
    ["studio-failures.json", studioFailures],
    ["studio-matrix.json", studioMatrix],
    ["studio-test-cases.json", studioCases],
  ]) {
    assert(isRecord(document), failures, `${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `${name} must use schemaVersion 1`);
    assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `${name} source SHA does not match its pack policy`);
  }

  assert(manifest?.phase === policy.phase, failures, "manifest phase must be 8.8.5");
  assert(manifest?.evidenceKind === "trusted-machine-standalone-and-studio-browser-matrix-regression-vs-8-8-3", failures, "Phase 8.8.5 evidence kind mismatch");
  assert(manifest?.baselinePhase883SourceCommit === policy.expectedPreviousSourceCommit, failures, "Phase 8.8.5 baseline source SHA mismatch");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.5 Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Phase 8.8.5 Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Phase 8.8.5 Playwright browser path mismatch");
  assert(manifest?.playwright?.browserBinaryPolicy === "Playwright-managed binaries only; no system-browser override is accepted by this workflow.", failures, "Phase 8.8.5 browser binary policy is missing");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "Phase 8.8.5 official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "Phase 8.8.5 container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "Phase 8.8.5 container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "Phase 8.8.5 trusted-host provenance is missing");
  assert(manifest?.execution?.notCloudWorkspace === true, failures, "Phase 8.8.5 provenance must not claim cloud execution");
  assert(manifest?.execution?.cloudVerification === "not-used-for-this-evidence", failures, "Phase 8.8.5 cloud boundary is missing");
  assert(manifest?.execution?.physicalDeviceTesting === false, failures, "Phase 8.8.5 physical-device limitation is missing");
  assert(manifest?.execution?.productFixesImplementedOnManjaro === false, failures, "Phase 8.8.5 trusted host must not claim product fixes");
  assert(manifest?.execution?.originWorkModified === false, failures, "Phase 8.8.5 trusted host must not claim origin/work modifications");
  assert(manifest?.execution?.originWorkAtVerificationTime === policy.expectedSourceCommit, failures, "Phase 8.8.5 verification source boundary is missing");

  assert(manifest?.standaloneResults?.status === "verified" && manifest?.standaloneResults?.exitCode === 0, failures, "Phase 8.8.5 standalone result is not verified");
  assert(manifest?.standaloneResults?.stats?.expected === 70 && manifest?.standaloneResults?.stats?.unexpected === 0 && manifest?.standaloneResults?.stats?.skipped === 0 && manifest?.standaloneResults?.stats?.flaky === 0, failures, "Phase 8.8.5 standalone totals mismatch");
  assert(manifest?.studioResults?.status === "FAIL" && manifest?.studioResults?.exitCode === 1, failures, "Phase 8.8.5 Studio result must preserve compatibility failure");
  assert(manifest?.studioResults?.stats?.expected === 79 && manifest?.studioResults?.stats?.unexpected === 31 && manifest?.studioResults?.stats?.skipped === 0 && manifest?.studioResults?.stats?.flaky === 0, failures, "Phase 8.8.5 Studio totals mismatch");
  assert(manifest?.studioResults?.testRecordCount === 110, failures, "Phase 8.8.5 Studio discovery total mismatch");
  assert(manifest?.studioResults?.comparisonToPhase883?.oldFailuresResolved === 0 && manifest?.studioResults?.comparisonToPhase883?.oldFailuresRemaining === 30 && manifest?.studioResults?.comparisonToPhase883?.newFailures === 1 && manifest?.studioResults?.comparisonToPhase883?.testsAdded === 5, failures, "Phase 8.8.5 Studio comparison summary mismatch");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true, failures, "Phase 8.8.5 archive handling policy is missing");
  assert(manifest?.archives?.publishedToGitHub === false, failures, "Phase 8.8.5 archives must not be published to GitHub");

  for (const [group, artifacts] of Object.entries(manifest?.sourceArtifactHashes ?? {})) {
    assert(isRecord(artifacts), failures, `Phase 8.8.5 source artifacts ${group} are missing`);
    for (const [name, artifact] of Object.entries(artifacts ?? {})) {
      assert(validSha(artifact?.sha256), failures, `invalid Phase 8.8.5 source artifact SHA-256: ${group}/${name}`);
      assert(Number.isInteger(artifact?.bytes) && artifact.bytes >= 0, failures, `invalid Phase 8.8.5 source artifact byte count: ${group}/${name}`);
    }
  }
  for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
    if (isRecord(archive) && "sha256" in archive) assert(validSha(archive.sha256), failures, `invalid Phase 8.8.5 archive SHA-256: ${name}`);
  }

  const expectedBrowserNames = { chromium: "chromium", firefox: "firefox", webkit: "webkit", "mobile-chrome": "chromium", "mobile-safari": "webkit" };
  const expectedStudioBrowserNames = { "studio-chromium": "chromium", "studio-firefox": "firefox", "studio-webkit": "webkit", "studio-mobile-chrome": "chromium", "studio-mobile-safari": "webkit" };
  function validateProjects(projects, names, browserNames, label) {
    assert(Array.isArray(projects), failures, `${label} projects are missing`);
    assert(JSON.stringify(projects?.map((project) => project.project)) === JSON.stringify(names), failures, `${label} project list mismatch`);
    for (const project of projects ?? []) {
      assert(project?.browserName === browserNames[project.project], failures, `${label} ${project?.project}: browser name mismatch`);
      assert(project?.distribution === "Playwright-managed" && project?.status === "available", failures, `${label} ${project?.project}: browser provenance/status mismatch`);
      assert(typeof project?.browserVersion === "string" && project.browserVersion.length > 0, failures, `${label} ${project?.project}: browser version is missing`);
      assert(typeof project?.executablePathInContainer === "string" && project.executablePathInContainer.startsWith("/ms-playwright/"), failures, `${label} ${project?.project}: managed executable path is missing`);
      assert(typeof project?.userAgent === "string" && project.userAgent.length > 0, failures, `${label} ${project?.project}: user agent is missing`);
      const expectedEmulation = (label === "standalone" ? project.project.startsWith("mobile-") : project.project.startsWith("studio-mobile-")) ? project.project : null;
      assert(project?.deviceEmulation === expectedEmulation, failures, `${label} ${project?.project}: device emulation mismatch`);
    }
  }
  validateProjects(standaloneMatrix?.browsers, REQUIRED_PROJECTS, expectedBrowserNames, "standalone");
  validateProjects(studioMatrix?.browsers, STUDIO_PROJECTS, expectedStudioBrowserNames, "Studio");
  assert(standaloneMatrix?.kind === "standalone-portable-five-browser", failures, "standalone matrix kind mismatch");
  assert(standaloneMatrix?.playwrightVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "standalone matrix Playwright version mismatch");
  assert(studioMatrix?.kind === "studio-compat-five-browser", failures, "Studio matrix kind mismatch");
  assert(studioMatrix?.playwrightVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Studio matrix Playwright version mismatch");
  assert(studioMatrix?.status === "FAIL" && studioMatrix?.exitCode === 1, failures, "Studio matrix must preserve FAIL status");
  assert(studioMatrix?.discoveredTestCount === 110 && studioMatrix?.stats?.expected === 79 && studioMatrix?.stats?.unexpected === 31 && studioMatrix?.stats?.skipped === 0 && studioMatrix?.stats?.flaky === 0, failures, "Studio matrix aggregate totals mismatch");
  assert(studioMatrix?.phase884RegressionTest?.included === true, failures, "Phase 8.8.4 regression test inclusion is missing");

  const fileIdentity = (file) => typeof file === "string" ? file.split("/").pop() : file;
  const testKey = (record) => `${record?.project}\0${fileIdentity(record?.file)}\0${record?.title}`;
  const validateStandaloneRecords = () => {
    const keys = new Set();
    let count = 0;
    for (const project of REQUIRED_PROJECTS) {
      const records = standaloneCases?.byBrowser?.[project];
      assert(Array.isArray(records) && records.length === 14, failures, `standalone ${project}: expected 14 records`);
      const totals = standaloneMatrix?.perProject?.[project];
      assert(totals?.passed === 14 && totals?.failed === 0 && totals?.skipped === 0 && totals?.flaky === 0 && totals?.total === 14, failures, `standalone ${project}: totals mismatch`);
      for (const record of records ?? []) {
        const key = `${project}\0${record?.file}\0${record?.title}`;
        assert(!keys.has(key), failures, `duplicate standalone test record: ${key}`); keys.add(key);
        assert(typeof record?.file === "string" && record.file.length > 0 && typeof record?.title === "string" && record.title.length > 0, failures, `${key}: standalone test identity is missing`);
        assert(record?.outcome === "expected" && record?.resultStatus === "passed", failures, `non-passing standalone test record: ${key}`);
        assert(finiteNonNegative(record?.durationMs), failures, `invalid standalone test duration: ${key}`); count += 1;
      }
    }
    assert(standaloneCases?.totalRecords === 70 && count === 70 && keys.size === 70, failures, "standalone test record count or uniqueness mismatch");
  };

  const failureClassifications = new Set(["timeout", "timeout-pointer-interception", "assertion-element-not-found", "assertion-element-hidden", "page-error-resizeobserver"]);
  const expectedFailureCounts = { timeout: 14, "assertion-element-not-found": 8, "timeout-pointer-interception": 2, "assertion-element-hidden": 1, "page-error-resizeobserver": 6 };
  const failureKeys = new Map();
  for (const failure of studioFailures?.failures ?? []) {
    const key = `${failure?.project}\0${fileIdentity(failure?.file)}\0${failure?.title}`;
    assert(!failureKeys.has(key), failures, `duplicate Phase 8.8.5 Studio failure record: ${key}`); failureKeys.set(key, failure);
    assert(STUDIO_PROJECTS.includes(failure?.project), failures, `unknown Phase 8.8.5 Studio failure project: ${key}`);
    assert(typeof failure?.file === "string" && typeof failure?.title === "string", failures, `Phase 8.8.5 Studio failure identity is missing: ${key}`);
    assert(failureClassifications.has(failure?.classification), failures, `unknown Phase 8.8.5 Studio failure classification: ${key}`);
    assert(typeof failure?.errorMessage === "string" && failure.errorMessage.length > 0, failures, `Phase 8.8.5 Studio failure error is missing: ${key}`);
    assert(failure?.observedFact === true, failures, `Phase 8.8.5 Studio failure observed-fact marker is missing: ${key}`);
    assert(failure?.phase883Outcome === "failed" || failure?.phase883Outcome === "new-test", failures, `Phase 8.8.5 Studio failure baseline outcome is missing: ${key}`);
    assert(typeof failure?.reproducible === "string" && failure.reproducible.length > 0, failures, `Phase 8.8.5 Studio failure reproducibility record is missing: ${key}`);
    assert(typeof failure?.browserVersion === "string" && failure.browserVersion.length > 0, failures, `Phase 8.8.5 Studio failure browser version is missing: ${key}`);
    assert(Array.isArray(failure?.localArtifactBasenames), failures, `Phase 8.8.5 Studio failure artifact record is missing: ${key}`);
    assert(finiteNonNegative(failure?.durationMs), failures, `Phase 8.8.5 Studio failure duration is invalid: ${key}`);
  }
  assert(studioFailures?.failureCount === 31 && studioFailures?.failures?.length === 31, failures, "Phase 8.8.5 Studio failure ledger count mismatch");
  assert(isRecord(studioFailures?.classificationCounts), failures, "Phase 8.8.5 Studio failure classification counts are missing");
  for (const [classification, count] of Object.entries(expectedFailureCounts)) assert(studioFailures?.classificationCounts?.[classification] === count, failures, `Phase 8.8.5 classification count mismatch: ${classification}`);
  assert(Object.keys(studioFailures?.classificationCounts ?? {}).length === Object.keys(expectedFailureCounts).length, failures, "Phase 8.8.5 has unexpected failure classifications");
  assert(Object.values(studioFailures?.classificationCounts ?? {}).reduce((sum, value) => sum + value, 0) === 31, failures, "Phase 8.8.5 failure classification counts do not reconcile");

  const studioKeys = new Set();
  let studioCount = 0;
  let studioPassed = 0;
  let studioUnexpected = 0;
  for (const project of STUDIO_PROJECTS) {
    const records = studioCases?.byBrowser?.[project];
    assert(Array.isArray(records) && records.length === 22, failures, `Studio ${project}: expected 22 records`);
    const totals = studioMatrix?.perProject?.[project];
    assert(totals?.passed + totals?.failed === 22 && totals?.total === 22, failures, `Studio ${project}: matrix totals mismatch`);
    for (const record of records ?? []) {
      const key = `${project}\0${fileIdentity(record?.file)}\0${record?.title}`;
      assert(!studioKeys.has(key), failures, `duplicate Phase 8.8.5 Studio test record: ${key}`); studioKeys.add(key);
      assert(typeof record?.file === "string" && record.file.length > 0 && typeof record?.title === "string" && record.title.length > 0, failures, `Studio test identity is missing: ${key}`);
      assert(finiteNonNegative(record?.durationMs), failures, `invalid Studio test duration: ${key}`);
      if (record?.resultStatus === "passed") {
        assert(record?.outcome === "expected", failures, `passing Studio record has wrong outcome: ${key}`); studioPassed += 1;
      } else {
        assert(record?.outcome === "unexpected" && (record?.resultStatus === "failed" || record?.resultStatus === "timedOut"), failures, `failed Studio record has invalid result status: ${key}`);
        assert(typeof record?.errorMessage === "string" && record.errorMessage.length > 0, failures, `failed Studio record error is missing: ${key}`);
        assert(failureKeys.has(key), failures, `failed Studio record missing from failure ledger: ${key}`); studioUnexpected += 1;
      }
      studioCount += 1;
    }
  }
  for (const key of failureKeys.keys()) assert(studioKeys.has(key), failures, `failure ledger record missing from Studio test cases: ${key}`);
  assert(studioCases?.totalRecords === 110 && studioCount === 110 && studioKeys.size === 110, failures, "Studio test record count or uniqueness mismatch");
  assert(studioCases?.includesPassAndFail === true && studioPassed === 79 && studioUnexpected === 31, failures, "Studio pass/fail totals mismatch");

  const expectedOldFailureKeys = new Set((previousStudioFailures?.failures ?? []).map(testKey));
  const comparisonKey = (record) => `${record?.project}\0${fileIdentity(record?.file)}\0${record?.title}`;
  assert(comparison?.phase === "8.8.5" && comparison?.comparedAgainstPhase === "8.8.3", failures, "regression comparison phase metadata mismatch");
  assert(comparison?.newSourceCommit === policy.expectedSourceCommit && comparison?.oldSourceCommit === policy.expectedPreviousSourceCommit, failures, "regression comparison source boundary mismatch");
  assert(comparison?.identityMatch === "project + file basename + test title", failures, "regression comparison identity rule mismatch");
  assert(comparison?.aggregate?.old?.passed === 75 && comparison?.aggregate?.old?.failed === 30 && comparison?.aggregate?.old?.total === 105, failures, "regression comparison old aggregate mismatch");
  assert(comparison?.aggregate?.new?.passed === 79 && comparison?.aggregate?.new?.failed === 31 && comparison?.aggregate?.new?.total === 110 && comparison?.aggregate?.new?.skipped === 0 && comparison?.aggregate?.new?.flaky === 0, failures, "regression comparison new aggregate mismatch");
  const expectedOldTotals = { "studio-chromium": [21, 0], "studio-firefox": [21, 0], "studio-webkit": [18, 3], "studio-mobile-chrome": [5, 16], "studio-mobile-safari": [10, 11] };
  for (const project of STUDIO_PROJECTS) {
    const [oldPassed, oldFailed] = expectedOldTotals[project];
    const oldTotals = comparison?.perProject?.[project]?.old;
    const newTotals = comparison?.perProject?.[project]?.new;
    assert(oldTotals?.passed === oldPassed && oldTotals?.failed === oldFailed && oldTotals?.total === 21, failures, `regression comparison old ${project} totals mismatch`);
    assert(newTotals?.passed === (studioMatrix?.perProject?.[project]?.passed ?? -1) && newTotals?.failed === (studioMatrix?.perProject?.[project]?.failed ?? -1) && newTotals?.total === 22, failures, `regression comparison new ${project} totals mismatch`);
    assert(comparison?.perProject?.[project]?.testsAdded === 1, failures, `regression comparison tests-added count mismatch: ${project}`);
  }
  const added = comparison?.testsAddedSincePreviousRevision ?? [];
  assert(added.length === 5 && new Set(added.map((record) => record?.project)).size === 5, failures, "regression comparison added-test records mismatch");
  assert(added.every((record) => record?.file === "multi-chart-studio.spec.ts" && record?.title === "mobile Studio keeps critical controls visible and hit-testable after responsive layout changes" && typeof record?.ok === "boolean" && (record?.resultStatus === "passed" || record?.resultStatus === "timedOut") && record.ok === (record.resultStatus === "passed")), failures, "regression comparison added-test identity or outcome mismatch");
  assert(added.filter((record) => record?.ok === false).length === 1 && added.find((record) => record?.project === "studio-mobile-chrome")?.ok === false, failures, "regression comparison new failure outcome mismatch");

  const resolved = comparison?.previouslyFailingNowPassing ?? [];
  const remaining = comparison?.previouslyFailingStillFailing ?? [];
  const newlyFailing = comparison?.newlyFailing ?? [];
  assert(comparison?.previouslyFailingNowPassing?.length === 0, failures, "Phase 8.8.5 must not claim an old failure resolved");
  assert(remaining.length === 30 && new Set(remaining.map(comparisonKey)).size === 30, failures, "Phase 8.8.5 remaining-old-failure list mismatch");
  assert(new Set(remaining.map(comparisonKey)).size === expectedOldFailureKeys.size && remaining.every((record) => expectedOldFailureKeys.has(comparisonKey(record)) && typeof record?.oldClassification === "string" && (record?.newStatus === "failed" || record?.newStatus === "timedOut")), failures, "Phase 8.8.5 old failure matching is inconsistent");
  assert(newlyFailing.length === 1 && newlyFailing[0]?.reason === "new-test" && !expectedOldFailureKeys.has(comparisonKey(newlyFailing[0])) && failureKeys.has(comparisonKey(newlyFailing[0])), failures, "Phase 8.8.5 new failure matching is inconsistent");
  assert(studioFailures?.failureCount === expectedOldFailureKeys.size + newlyFailing.length, failures, "Phase 8.8.5 failure reconciliation does not match prior plus new failures");

  for (const [index, text] of textFiles.entries()) for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: 180,
    perProject: {
      standalone: Object.fromEntries(REQUIRED_PROJECTS.map((project) => [project, standaloneMatrix?.perProject?.[project]?.total ?? 0])),
      studio: Object.fromEntries(STUDIO_PROJECTS.map((project) => [project, studioMatrix?.perProject?.[project]?.total ?? 0])),
    },
    totals: { standaloneExpected: 70, standaloneUnexpected: 0, studioExpected: 79, studioUnexpected: 31 },
    archiveHashes: Object.values(manifest?.archives ?? {}).filter((archive) => isRecord(archive) && "sha256" in archive).map((archive) => archive.sha256),
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

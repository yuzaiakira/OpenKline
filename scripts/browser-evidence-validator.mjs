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
export const REQUIRED_PHASE_887_EVIDENCE_FILES = [
  "README.md",
  "focused-failures.json",
  "focused-matrix.json",
  "focused-test-cases.json",
  "manifest.json",
  "regression-comparison.json",
  "root-cause-observations.json",
];
export const REQUIRED_PHASE_889_EVIDENCE_FILES = [
  "README.md",
  "manifest.json",
  "regression-comparison.json",
  "root-cause-observations.json",
  "targeted-failures.json",
  "targeted-matrix.json",
  "targeted-test-cases.json",
];
export const REQUIRED_PHASE_8811_EVIDENCE_FILES = [
  "README.md",
  "manifest.json",
  "regression-comparison.json",
  "root-cause-observations.json",
  "targeted-failures.json",
  "targeted-matrix.json",
  "targeted-test-cases.json",
];
export const REQUIRED_PHASE_8813_EVIDENCE_FILES = [
  "README.md",
  "manifest.json",
  "regression-comparison.json",
  "root-cause-observations.json",
  "targeted-failures.json",
  "targeted-matrix.json",
  "targeted-test-cases.json",
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
  "8.8.7": Object.freeze({
    directory: "phase-8-8-7",
    phase: "8.8.7",
    expectedSourceCommit: "d79abbabcc3e4c055310b2058f68f19dfb179d8a",
    expectedBehavioralSourceCommit: "796b930658353b22300955789efc90aa635b3327",
    expectedBaselineSourceCommit: "241026e3b1eb3cebd0bbb78dd17daea8028b3203",
    requiredFiles: REQUIRED_PHASE_887_EVIDENCE_FILES,
  }),
  "8.8.9": Object.freeze({
    directory: "phase-8-8-9",
    phase: "8.8.9",
    expectedSourceCommit: "112213abb8383e78511b63de2f891a8a49e97536",
    expectedBehavioralSourceCommit: "95cbf47aede8046b03fba9ce476ab5e211359989",
    expectedBaselineSourceCommit: "d79abbabcc3e4c055310b2058f68f19dfb179d8a",
    requiredFiles: REQUIRED_PHASE_889_EVIDENCE_FILES,
  }),
  "8.8.11": Object.freeze({
    directory: "phase-8-8-11",
    phase: "8.8.11",
    expectedSourceCommit: "0e84d13ca83b81866900571ad798ca69de90911f",
    expectedBehavioralSourceCommit: "e03d93722d743fda0c00e860ac1b41d07187214e",
    expectedBaselineSourceCommit: "112213abb8383e78511b63de2f891a8a49e97536",
    requiredFiles: REQUIRED_PHASE_8811_EVIDENCE_FILES,
  }),
  "8.8.13": Object.freeze({
    directory: "phase-8-8-13",
    phase: "8.8.13",
    expectedSourceCommit: "5062735097301ce22dd50f1f78f7f84cf96394e1",
    expectedBehavioralSourceCommit: "6e4dd92fd08dc50c23fead4f9c3c69b311aeddf5",
    expectedBaselineSourceCommit: "0e84d13ca83b81866900571ad798ca69de90911f",
    expectedArchiveSha256: "5da3924bf93794cfe641dff4854c32de8b43f6a7240c99e449922f5467c5721c",
    requiredFiles: REQUIRED_PHASE_8813_EVIDENCE_FILES,
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
  if (policy.phase === "8.8.7") return validatePhase887Pack({ evidenceRoot, policy });
  if (policy.phase === "8.8.9") return validatePhase889Pack({ evidenceRoot, policy });
  if (policy.phase === "8.8.11") return validatePhase8811Pack({ evidenceRoot, policy });
  if (policy.phase === "8.8.13") return validatePhase8813Pack({ evidenceRoot, policy });
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

function validatePhase889Pack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  const requiredFiles = policy.requiredFiles ?? REQUIRED_PHASE_889_EVIDENCE_FILES;
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected Phase 8.8.9 evidence files: ${actualFiles.join(", ")}`);

  const read = (name) => readJson(join(evidenceDirectory, name), failures, name);
  const manifest = read("manifest.json");
  const targetedMatrix = read("targeted-matrix.json");
  const targetedCases = read("targeted-test-cases.json");
  const targetedFailures = read("targeted-failures.json");
  const comparison = read("regression-comparison.json");
  const observations = read("root-cause-observations.json");
  const textFiles = requiredFiles.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  const sourceDocuments = [
    ["manifest.json", manifest],
    ["targeted-matrix.json", targetedMatrix],
  ];
  for (const [name, document] of sourceDocuments) {
    assert(isRecord(document), failures, `${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `${name} must use schemaVersion 1`);
    assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `${name} source SHA does not match Phase 8.8.9 policy`);
  }

  assert(manifest?.phase === policy.phase, failures, "Phase 8.8.9 manifest phase mismatch");
  assert(manifest?.evidenceKind === "trusted-machine-targeted-studio-diagnostics-priority-a-b-c", failures, "Phase 8.8.9 evidence kind mismatch");
  assert(manifest?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.9 behavioral source boundary is missing");
  assert(manifest?.baselinePhase887SourceCommit === policy.expectedBaselineSourceCommit, failures, "Phase 8.8.9 Phase 8.8.7 baseline boundary is missing");
  assert(manifest?.baselinePhase885SourceCommit === "241026e3b1eb3cebd0bbb78dd17daea8028b3203", failures, "Phase 8.8.9 Phase 8.8.5 baseline boundary is missing");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.9 Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Phase 8.8.9 Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Phase 8.8.9 Playwright browser path mismatch");
  assert(manifest?.playwright?.browserBinaryPolicy === "Playwright-managed binaries only; no system-browser override.", failures, "Phase 8.8.9 browser binary policy is missing");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "Phase 8.8.9 official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "Phase 8.8.9 container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "Phase 8.8.9 container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "Phase 8.8.9 trusted-host provenance is missing");
  assert(manifest?.execution?.notCloudWorkspace === true, failures, "Phase 8.8.9 provenance must not claim cloud execution");
  assert(manifest?.execution?.physicalDeviceTesting === false, failures, "Phase 8.8.9 physical-device limitation is missing");
  assert(manifest?.execution?.productFixesImplementedOnManjaro === false, failures, "Phase 8.8.9 trusted host must not claim product fixes");
  assert(manifest?.execution?.originWorkModified === false, failures, "Phase 8.8.9 trusted host must not claim origin/work modifications");
  assert(manifest?.execution?.fullMatrixExecuted === false && manifest?.execution?.standaloneMatrixExecuted === false && manifest?.execution?.extendedTargetedExecuted === false, failures, "Phase 8.8.9 execution scope must remain focused-only");
  assert(manifest?.execution?.fullMatrixDecision === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.9 full-matrix boundary is missing");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true && manifest?.archives?.publishedToGitHub === false, failures, "Phase 8.8.9 archive handling policy is missing");

  const expectedGroups = {
    PA: { total: 4, passed: 1, failed: 3 },
    PB: { total: 1, passed: 0, failed: 1 },
    PC: { total: 1, passed: 0, failed: 1 },
  };
  assert(targetedMatrix?.phase === policy.phase, failures, "Phase 8.8.9 targeted matrix phase mismatch");
  assert(JSON.stringify(targetedMatrix?.projects) === JSON.stringify(["studio-mobile-safari", "studio-mobile-chrome"]), failures, "Phase 8.8.9 project list mismatch");
  assert(targetedMatrix?.fullMatrixExecuted === false && targetedMatrix?.standaloneMatrixExecuted === false && targetedMatrix?.extendedTargetedExecuted === false, failures, "Phase 8.8.9 matrix must preserve incomplete execution scope");
  assert(targetedMatrix?.decision === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.9 matrix decision is missing");
  for (const [group, expected] of Object.entries(expectedGroups)) {
    const actual = targetedMatrix?.groups?.[group];
    assert(actual?.total === expected.total && actual?.passed === expected.passed && actual?.failed === expected.failed, failures, `Phase 8.8.9 ${group} totals mismatch`);
  }
  assert(targetedMatrix?.totals?.records === 6 && targetedMatrix?.totals?.passed === 1 && targetedMatrix?.totals?.failed === 5 && targetedMatrix?.totals?.uniqueIdentities === 6 && targetedMatrix?.totals?.uniquePassed === 1 && targetedMatrix?.totals?.uniqueFailed === 5, failures, "Phase 8.8.9 aggregate totals mismatch");

  const caseKey = (record) => `${record?.project}\0${record?.file}\0${record?.title}`;
  const cases = targetedCases?.cases ?? [];
  const caseKeys = new Set();
  const failedCaseKeys = new Set();
  let passedCount = 0;
  for (const record of cases) {
    const key = caseKey(record);
    assert(!caseKeys.has(key), failures, `duplicate Phase 8.8.9 targeted test record: ${key}`); caseKeys.add(key);
    assert(["PA", "PB", "PC"].includes(record?.group), failures, `unknown Phase 8.8.9 targeted group: ${key}`);
    assert(["studio-mobile-safari", "studio-mobile-chrome"].includes(record?.project), failures, `unknown Phase 8.8.9 targeted project: ${key}`);
    assert(typeof record?.file === "string" && record.file.length > 0 && typeof record?.title === "string" && record.title.length > 0, failures, `Phase 8.8.9 targeted identity is missing: ${key}`);
    assert(record?.status === "expected" || record?.status === "unexpected", failures, `invalid Phase 8.8.9 targeted status: ${key}`);
    assert(typeof record?.ok === "boolean" && finiteNonNegative(record?.durationMs), failures, `invalid Phase 8.8.9 targeted result metadata: ${key}`);
    if (record?.status === "expected") {
      passedCount += 1;
      assert(record.ok === true && record?.rootCauseClass === "pass", failures, `Phase 8.8.9 expected result is not a pass: ${key}`);
    } else {
      failedCaseKeys.add(key);
      assert(record.ok === false && typeof record?.errorMessage === "string" && record.errorMessage.length > 0 && typeof record?.rootCauseClass === "string", failures, `Phase 8.8.9 unexpected result lacks failure metadata: ${key}`);
    }
  }
  assert(cases.length === 6 && caseKeys.size === 6 && passedCount === 1, failures, "Phase 8.8.9 targeted record count or pass/fail totals mismatch");
  assert(targetedCases?.phase === policy.phase, failures, "Phase 8.8.9 targeted test-case phase mismatch");

  const failureRecords = targetedFailures?.failures ?? [];
  const failureKeys = new Set();
  for (const failure of failureRecords) {
    const key = caseKey(failure);
    assert(!failureKeys.has(key), failures, `duplicate Phase 8.8.9 failure record: ${key}`); failureKeys.add(key);
    assert(failedCaseKeys.has(key), failures, `Phase 8.8.9 failure has no matching unexpected case: ${key}`);
    assert(failure?.status === "unexpected" && finiteNonNegative(failure?.durationMs), failures, `invalid Phase 8.8.9 failure status/duration: ${key}`);
    assert(typeof failure?.errorMessage === "string" && failure.errorMessage.length > 0 && typeof failure?.rootCauseClass === "string", failures, `Phase 8.8.9 failure metadata is incomplete: ${key}`);
  }
  assert(targetedFailures?.phase === policy.phase && failureRecords.length === 5 && failureKeys.size === failedCaseKeys.size, failures, "Phase 8.8.9 failure ledger does not reconcile");

  assert(comparison?.phase === policy.phase && comparison?.compareAgainstPhase === "8.8.7", failures, "Phase 8.8.9 comparison metadata mismatch");
  assert(comparison?.currentSource === policy.expectedSourceCommit, failures, "Phase 8.8.9 comparison current source SHA mismatch");
  assert(comparison?.currentFocused?.records === 6 && comparison?.currentFocused?.passed === 1 && comparison?.currentFocused?.failed === 5, failures, "Phase 8.8.9 comparison focused totals mismatch");
  assert(comparison?.currentFullStudioTotals === null && comparison?.currentFullStudioNote === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.9 comparison must preserve incomplete full-matrix status");
  assert(Array.isArray(comparison?.previouslyFailingNowPassingFocusedOnly) && comparison.previouslyFailingNowPassingFocusedOnly.length === 1, failures, "Phase 8.8.9 focused resolution count mismatch");
  assert(Array.isArray(comparison?.newlyFailingTests) && comparison.newlyFailingTests.length === 0, failures, "Phase 8.8.9 must not claim newly failing tests");

  assert(observations?.phase === policy.phase && Array.isArray(observations?.observations) && observations.observations.length === 6, failures, "Phase 8.8.9 root-cause observation count mismatch");
  for (const observation of observations?.observations ?? []) {
    assert(typeof observation?.id === "string" && typeof observation?.project === "string" && typeof observation?.title === "string" && typeof observation?.officialResult === "string" && typeof observation?.class === "string" && typeof observation?.detail === "string", failures, `Phase 8.8.9 observation is incomplete: ${observation?.id}`);
    if (observation?.officialResult === "FAIL") assert(observation?.productClaimAllowed === false, failures, `Phase 8.8.9 failed observation allows an unsupported product claim: ${observation?.id}`);
  }

  for (const [index, text] of textFiles.entries()) for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: 6,
    perProject: { "studio-mobile-safari": 5, "studio-mobile-chrome": 1 },
    totals: { expected: 1, unexpected: 5, uniqueIdentities: 6 },
    archiveHashes: Object.values(manifest?.archives ?? {}).filter((archive) => isRecord(archive) && "sha256" in archive).map((archive) => archive.sha256),
    sanitization: failures.some((failure) => failure.includes("sanitization")) ? "FAIL" : "PASS",
    failures,
  };
}

function validatePhase8813Pack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  const requiredFiles = policy.requiredFiles ?? REQUIRED_PHASE_8813_EVIDENCE_FILES;
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected Phase 8.8.13 evidence files: ${actualFiles.join(", ")}`);

  const read = (name) => readJson(join(evidenceDirectory, name), failures, name);
  const manifest = read("manifest.json");
  const targetedMatrix = read("targeted-matrix.json");
  const targetedCases = read("targeted-test-cases.json");
  const targetedFailures = read("targeted-failures.json");
  const observations = read("root-cause-observations.json");
  const comparison = read("regression-comparison.json");
  const textFiles = requiredFiles.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  for (const [name, document] of [
    ["manifest.json", manifest],
    ["targeted-matrix.json", targetedMatrix],
    ["targeted-test-cases.json", targetedCases],
    ["targeted-failures.json", targetedFailures],
    ["root-cause-observations.json", observations],
    ["regression-comparison.json", comparison],
  ]) {
    assert(isRecord(document), failures, `Phase 8.8.13 ${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `Phase 8.8.13 ${name} must use schemaVersion 1`);
    if (name === "manifest.json" || name === "targeted-matrix.json") {
      assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `Phase 8.8.13 ${name} source SHA mismatch`);
    }
    assert(document?.phase === policy.phase, failures, `Phase 8.8.13 ${name} phase mismatch`);
  }

  assert(manifest?.evidenceKind === "trusted-machine-final-seven-targeted-diagnostics", failures, "Phase 8.8.13 evidence kind mismatch");
  assert(manifest?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.13 behavioral source boundary is missing");
  assert(manifest?.baselinePhase811SourceCommit === policy.expectedBaselineSourceCommit, failures, "Phase 8.8.13 Phase 8.8.11 baseline boundary is missing");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.13 Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Phase 8.8.13 Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Phase 8.8.13 Playwright browser path mismatch");
  assert(manifest?.playwright?.browserBinaryPolicy === "Playwright-managed binaries only; no system-browser override.", failures, "Phase 8.8.13 browser binary policy is missing");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "Phase 8.8.13 official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "Phase 8.8.13 container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "Phase 8.8.13 container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "Phase 8.8.13 trusted-host provenance is missing");
  assert(manifest?.execution?.cloudEnvironment === false, failures, "Phase 8.8.13 evidence must not claim cloud execution");
  assert(manifest?.execution?.productFixesImplementedOnManjaro === false, failures, "Phase 8.8.13 trusted host must not claim product fixes");
  assert(manifest?.execution?.originWorkModified === false, failures, "Phase 8.8.13 trusted host must not claim origin/work modifications");
  assert(manifest?.execution?.fullMatrixExecuted === false && manifest?.execution?.standaloneMatrixExecuted === false, failures, "Phase 8.8.13 must preserve the targeted-only execution boundary");
  assert(manifest?.execution?.fullMatrixDecision === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.13 full-matrix decision is missing");
  assert(manifest?.focusedResults?.records === 7 && manifest?.focusedResults?.passed === 1 && manifest?.focusedResults?.failed === 6, failures, "Phase 8.8.13 focused totals mismatch");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true && manifest?.archives?.publishedToGitHub === false, failures, "Phase 8.8.13 archive handling policy is missing");

  const archiveHashes = [];
  for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
    if (!isRecord(archive) || !("sha256" in archive)) continue;
    assert(validSha(archive.sha256), failures, `invalid Phase 8.8.13 archive SHA-256: ${name}`);
    archiveHashes.push(archive.sha256);
  }
  assert(archiveHashes.includes(policy.expectedArchiveSha256), failures, "Phase 8.8.13 focused archive SHA-256 is missing");

  const expectedCases = [
    ["F1", "studio-firefox", "Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes", "firefox-drawing-anchors-not-registered"],
    ["F1", "studio-firefox", "Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload", "firefox-drawing-anchors-not-registered"],
    ["F1", "studio-firefox", "Studio exposes deterministic replay playback controls and restores the workspace", "firefox-drawing-anchors-not-registered"],
    ["F2", "studio-webkit", "Studio paper trading is visibly simulated, fills causally, and stays chart-scoped", "pass"],
    ["F2", "studio-webkit", "Studio creates, pauses, persists, and removes a local alert", "alert-name-fill-not-applied-default-name-created"],
    ["F3", "studio-mobile-safari", "Studio paper trading is visibly simulated, fills causally, and stays chart-scoped", "paper-order-rejected-max-notional-quantity-fill-suspect"],
    ["F3", "studio-mobile-safari", "Studio creates, pauses, persists, and removes a local alert", "alert-name-fill-not-applied-default-name-created"],
  ];
  const identity = (record) => `${record?.project}\0${record?.title}`;
  const cases = targetedCases?.cases ?? [];
  const caseKeys = new Set();
  const failedKeys = new Set();
  assert(cases.length === expectedCases.length, failures, "Phase 8.8.13 targeted case count mismatch");
  for (const record of cases) {
    const key = identity(record);
    assert(!caseKeys.has(key), failures, `duplicate Phase 8.8.13 targeted identity: ${key}`);
    caseKeys.add(key);
    const expected = expectedCases.find((item) => item[1] === record?.project && item[2] === record?.title);
    assert(expected !== undefined, failures, `unexpected Phase 8.8.13 targeted identity: ${key}`);
    assert(typeof record?.group === "string" && typeof record?.status === "string" && typeof record?.ok === "boolean" && finiteNonNegative(record?.durationMs), failures, `Phase 8.8.13 targeted result metadata is incomplete: ${key}`);
    if (record?.status === "unexpected") {
      failedKeys.add(key);
      assert(record.ok === false && typeof record.errorMessage === "string" && record.errorMessage.length > 0, failures, `Phase 8.8.13 failed result metadata is incomplete: ${key}`);
      assert(record.rootCauseClass === expected?.[3], failures, `Phase 8.8.13 root-cause class mismatch: ${key}`);
    } else {
      assert(record?.status === "expected" && record.ok === true && record.errorMessage === "" && record.rootCauseClass === "pass", failures, `Phase 8.8.13 passing result metadata is invalid: ${key}`);
    }
    assert(record?.group === expected?.[0], failures, `Phase 8.8.13 group mismatch: ${key}`);
  }
  const expectedKeys = new Set(expectedCases.map((item) => `${item[1]}\0${item[2]}`));
  assert(caseKeys.size === expectedKeys.size && [...caseKeys].every((key) => expectedKeys.has(key)), failures, "Phase 8.8.13 targeted identities do not reconcile");
  assert(failedKeys.size === 6, failures, "Phase 8.8.13 must contain exactly six targeted failures");

  const failureRecords = targetedFailures?.failures ?? [];
  const failureKeys = new Set();
  for (const failure of failureRecords) {
    const key = identity(failure);
    assert(!failureKeys.has(key), failures, `duplicate Phase 8.8.13 failure identity: ${key}`);
    failureKeys.add(key);
    assert(failedKeys.has(key), failures, `Phase 8.8.13 failure has no matching failed case: ${key}`);
    assert(failure?.status === "unexpected" && failure?.ok === false && finiteNonNegative(failure?.durationMs), failures, `Phase 8.8.13 failure metadata is invalid: ${key}`);
    assert(typeof failure?.errorMessage === "string" && failure.errorMessage.length > 0 && typeof failure?.rootCauseClass === "string", failures, `Phase 8.8.13 failure identity metadata is incomplete: ${key}`);
    const diagnostics = failure?.diagnostics;
    assert(isRecord(diagnostics) && isRecord(diagnostics.viewport) && isRecord(diagnostics.scroll), failures, `Phase 8.8.13 diagnostics are incomplete: ${key}`);
    assert(Array.isArray(diagnostics.pageErrors) && Array.isArray(diagnostics.consoleErrors) && Array.isArray(diagnostics.pointerTrace), failures, `Phase 8.8.13 browser diagnostics are incomplete: ${key}`);
    assert(diagnostics.pointerTrace.length <= 60 && diagnostics.pageErrors.length <= 20 && diagnostics.consoleErrors.length <= 20, failures, `Phase 8.8.13 diagnostics are not bounded: ${key}`);
    assert(isRecord(diagnostics.targeted) && isRecord(diagnostics.targeted.drawing) && isRecord(diagnostics.targeted.paperTrading) && isRecord(diagnostics.targeted.alerts), failures, `Phase 8.8.13 targeted diagnostics are incomplete: ${key}`);
    assert(Array.isArray(diagnostics.targeted.drawing.canvasMetrics) && Array.isArray(diagnostics.targeted.drawing.summaries), failures, `Phase 8.8.13 drawing diagnostics are incomplete: ${key}`);
    assert(Array.isArray(diagnostics.targeted.paperTrading.rows) && Array.isArray(diagnostics.targeted.alerts.names) && Array.isArray(diagnostics.targeted.alerts.removeControls), failures, `Phase 8.8.13 form diagnostics are incomplete: ${key}`);
  }
  assert(failureRecords.length === 6 && failureKeys.size === 6, failures, "Phase 8.8.13 failure ledger count mismatch");
  assert([...failureKeys].every((key) => failedKeys.has(key)), failures, "Phase 8.8.13 failure ledger does not reconcile");

  assert(targetedMatrix?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.13 targeted matrix behavioral source mismatch");
  assert(JSON.stringify(targetedMatrix?.groups) === JSON.stringify({
    F1: { name: "Firefox drawing trio", total: 3, passed: 0, failed: 3 },
    F2: { name: "WebKit paper+alert", total: 2, passed: 1, failed: 1 },
    F3: { name: "Mobile Safari paper+alert", total: 2, passed: 0, failed: 2 },
  }), failures, "Phase 8.8.13 targeted group totals mismatch");
  assert(targetedMatrix?.totals?.records === 7 && targetedMatrix?.totals?.passed === 1 && targetedMatrix?.totals?.failed === 6, failures, "Phase 8.8.13 targeted aggregate totals mismatch");
  assert(targetedMatrix?.fullMatrixExecuted === false && targetedMatrix?.standaloneMatrixExecuted === false && targetedMatrix?.decision === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.13 matrix boundary is missing");

  assert(Array.isArray(observations?.observations) && observations.observations.length === 4, failures, "Phase 8.8.13 root-cause observations are incomplete");
  for (const observation of observations?.observations ?? []) {
    assert(typeof observation?.id === "string" && typeof observation?.class === "string" && typeof observation?.detail === "string" && (observation?.officialResult === "PASS" || observation?.officialResult === "FAIL"), failures, `Phase 8.8.13 observation metadata is incomplete: ${observation?.id}`);
    if (observation?.officialResult === "FAIL") assert(!/resolved|fixed|fully green/i.test(observation.detail), failures, `Phase 8.8.13 failed observation makes an unsupported resolution claim: ${observation?.id}`);
  }

  assert(comparison?.compareAgainstPhase === "8.8.11", failures, "Phase 8.8.13 comparison baseline mismatch");
  assert(comparison?.phase811StudioFull?.discovered === 120 && comparison?.phase811StudioFull?.passed === 113 && comparison?.phase811StudioFull?.failed === 7, failures, "Phase 8.8.13 historical Studio totals mismatch");
  assert(comparison?.currentFocused?.records === 7 && comparison?.currentFocused?.passed === 1 && comparison?.currentFocused?.failed === 6, failures, "Phase 8.8.13 current focused totals mismatch");
  assert(comparison?.currentFullStudioTotals === null && comparison?.currentFullStudioNote === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.13 must not claim a full Studio result");
  assert(Array.isArray(comparison?.previouslyFailingNowPassingFocusedOnly) && comparison.previouslyFailingNowPassingFocusedOnly.length === 1, failures, "Phase 8.8.13 focused resolution comparison mismatch");
  assert(comparison.previouslyFailingNowPassingFocusedOnly[0]?.project === "studio-webkit" && comparison.previouslyFailingNowPassingFocusedOnly[0]?.title === expectedCases[3][2], failures, "Phase 8.8.13 WebKit paper resolution identity mismatch");
  assert(Array.isArray(comparison?.previouslyFailingStillFailing) && comparison.previouslyFailingStillFailing.length === 6, failures, "Phase 8.8.13 remaining failure comparison mismatch");
  assert(Array.isArray(comparison?.diagnosticOnlyImprovements) && comparison.diagnosticOnlyImprovements.length >= 1, failures, "Phase 8.8.13 diagnostic improvement comparison is missing");

  for (const [index, text] of textFiles.entries()) for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: 7,
    perProject: { "studio-firefox": 3, "studio-webkit": 2, "studio-mobile-safari": 2 },
    totals: { expected: 1, unexpected: 6, uniqueIdentities: 7 },
    archiveHashes,
    sanitization: failures.some((failure) => failure.includes("sanitization")) ? "FAIL" : "PASS",
    failures,
  };
}

function validatePhase8811Pack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  const requiredFiles = policy.requiredFiles ?? REQUIRED_PHASE_8811_EVIDENCE_FILES;
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected Phase 8.8.11 evidence files: ${actualFiles.join(", ")}`);

  const read = (name) => readJson(join(evidenceDirectory, name), failures, name);
  const manifest = read("manifest.json");
  const targetedMatrix = read("targeted-matrix.json");
  const targetedCases = read("targeted-test-cases.json");
  const targetedFailures = read("targeted-failures.json");
  const comparison = read("regression-comparison.json");
  const observations = read("root-cause-observations.json");
  const textFiles = requiredFiles.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  for (const [name, document] of [["manifest.json", manifest], ["targeted-matrix.json", targetedMatrix]]) {
    assert(isRecord(document), failures, `${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `${name} must use schemaVersion 1`);
    assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `${name} source SHA does not match Phase 8.8.11 policy`);
  }
  assert(manifest?.phase === policy.phase, failures, "Phase 8.8.11 manifest phase mismatch");
  assert(manifest?.evidenceKind === "trusted-machine-targeted-and-full-studio-diagnostics", failures, "Phase 8.8.11 evidence kind mismatch");
  assert(manifest?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.11 behavioral source boundary is missing");
  assert(manifest?.baselinePhase889SourceCommit === policy.expectedBaselineSourceCommit, failures, "Phase 8.8.11 Phase 8.8.9 baseline boundary is missing");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.11 Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Phase 8.8.11 Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Phase 8.8.11 Playwright browser path mismatch");
  assert(manifest?.playwright?.browserBinaryPolicy === "Playwright-managed binaries only; no system-browser override.", failures, "Phase 8.8.11 browser binary policy is missing");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "Phase 8.8.11 official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "Phase 8.8.11 container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "Phase 8.8.11 container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "Phase 8.8.11 trusted-host provenance is missing");
  assert(manifest?.execution?.notCloudWorkspace === true, failures, "Phase 8.8.11 provenance must not claim cloud execution");
  assert(manifest?.execution?.physicalDeviceTesting === false, failures, "Phase 8.8.11 physical-device limitation is missing");
  assert(manifest?.execution?.productFixesImplementedOnManjaro === false, failures, "Phase 8.8.11 trusted host must not claim product fixes");
  assert(manifest?.execution?.originWorkModified === false, failures, "Phase 8.8.11 trusted host must not claim origin/work modifications");
  assert(manifest?.execution?.fullMatrixExecuted === true && manifest?.execution?.standaloneMatrixExecuted === true && manifest?.execution?.extendedTargetedExecuted === true, failures, "Phase 8.8.11 execution scope is incomplete");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true && manifest?.archives?.publishedToGitHub === false, failures, "Phase 8.8.11 archive handling policy is missing");

  const archiveHashes = [];
  for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
    if (isRecord(archive) && "sha256" in archive) {
      assert(validSha(archive.sha256), failures, `invalid Phase 8.8.11 archive SHA-256: ${name}`);
      archiveHashes.push(archive.sha256);
    }
  }
  assert(archiveHashes.length === 3, failures, "Phase 8.8.11 expected three new archive SHA-256 values");

  const validateCases = (cases, label, expectedGroups, expectedCount) => {
    assert(Array.isArray(cases), failures, `Phase 8.8.11 ${label} cases are missing`);
    const keys = new Set();
    const groups = new Map();
    for (const record of cases ?? []) {
      const key = `${record?.group}\0${record?.project}\0${record?.title}`;
      assert(!keys.has(key), failures, `duplicate Phase 8.8.11 ${label} case: ${key}`);
      keys.add(key);
      assert(typeof record?.group === "string" && typeof record?.project === "string" && typeof record?.title === "string" && record.title.length > 0, failures, `Phase 8.8.11 ${label} case identity is missing: ${key}`);
      assert(record?.status === "expected" || record?.status === "unexpected", failures, `invalid Phase 8.8.11 ${label} status: ${key}`);
      assert(typeof record?.ok === "boolean" && finiteNonNegative(record?.durationMs), failures, `invalid Phase 8.8.11 ${label} result metadata: ${key}`);
      const current = groups.get(record.group) ?? { total: 0, passed: 0, failed: 0 };
      current.total += 1;
      if (record.status === "expected") {
        current.passed += 1;
        assert(record.ok === true && record.rootCauseClass === "pass" && record.errorMessage === "", failures, `Phase 8.8.11 expected ${label} case is not a pass: ${key}`);
      } else {
        current.failed += 1;
        assert(record.ok === false && typeof record.errorMessage === "string" && record.errorMessage.length > 0 && typeof record.rootCauseClass === "string", failures, `Phase 8.8.11 unexpected ${label} case lacks failure metadata: ${key}`);
        assert(isRecord(record.diagnostics), failures, `Phase 8.8.11 unexpected ${label} case lacks diagnostics: ${key}`);
      }
      groups.set(record.group, current);
    }
    assert(cases?.length === expectedCount && keys.size === expectedCount, failures, `Phase 8.8.11 ${label} case count mismatch`);
    for (const [group, expected] of Object.entries(expectedGroups)) {
      assert(JSON.stringify(groups.get(group)) === JSON.stringify(expected), failures, `Phase 8.8.11 ${label} ${group} totals mismatch`);
    }
    return keys;
  };

  assert(targetedCases?.schemaVersion === 1 && targetedCases?.phase === policy.phase, failures, "Phase 8.8.11 targeted test-case metadata mismatch");
  validateCases(targetedCases?.primaryCases, "primary", {
    PA: { total: 4, passed: 4, failed: 0 },
    PB: { total: 1, passed: 1, failed: 0 },
    PC: { total: 2, passed: 2, failed: 0 },
    PD: { total: 2, passed: 1, failed: 1 },
  }, 9);
  validateCases(targetedCases?.extendedCases, "extended", {
    PE1: { total: 9, passed: 5, failed: 4 },
    PE2: { total: 9, passed: 9, failed: 0 },
  }, 18);

  assert(targetedMatrix?.phase === policy.phase, failures, "Phase 8.8.11 targeted matrix phase mismatch");
  assert(targetedMatrix?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.11 targeted matrix behavioral source mismatch");
  assert(targetedMatrix?.primaryFocused?.totals?.records === 9 && targetedMatrix?.primaryFocused?.totals?.passed === 8 && targetedMatrix?.primaryFocused?.totals?.failed === 1, failures, "Phase 8.8.11 primary focused totals mismatch");
  assert(targetedMatrix?.extendedFocused?.totals?.records === 18 && targetedMatrix?.extendedFocused?.totals?.passed === 14 && targetedMatrix?.extendedFocused?.totals?.failed === 4, failures, "Phase 8.8.11 extended focused totals mismatch");
  assert(targetedMatrix?.standaloneFull?.discovered === 70 && targetedMatrix?.standaloneFull?.passed === 70 && targetedMatrix?.standaloneFull?.failed === 0 && targetedMatrix?.standaloneFull?.exitCode === 0, failures, "Phase 8.8.11 standalone totals mismatch");
  assert(targetedMatrix?.studioFull?.discovered === 120 && targetedMatrix?.studioFull?.passed === 113 && targetedMatrix?.studioFull?.failed === 7 && targetedMatrix?.studioFull?.exitCode === 1, failures, "Phase 8.8.11 Studio totals mismatch");
  assert(targetedMatrix?.decision === "FULL MATRICES EXECUTED AFTER FOCUSED/EXTENDED IMPROVEMENT" && targetedMatrix?.fullMatrixNotStopped === true, failures, "Phase 8.8.11 matrix decision boundary is missing");

  const failureKey = (failure) => `${failure?.project}\0${failure?.title}`;
  const expectedFullFailures = [
    ["studio-firefox", "Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes", "firefox-drawing-anchor-not-registered"],
    ["studio-firefox", "Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload", "firefox-drawing-anchor-not-registered"],
    ["studio-firefox", "Studio exposes deterministic replay playback controls and restores the workspace", "firefox-drawing-anchor-not-registered"],
    ["studio-webkit", "Studio paper trading is visibly simulated, fills causally, and stays chart-scoped", "paper-pending-status-text-missing"],
    ["studio-mobile-safari", "Studio paper trading is visibly simulated, fills causally, and stays chart-scoped", "paper-pending-status-text-missing"],
    ["studio-webkit", "Studio creates, pauses, persists, and removes a local alert", "alert-close-control-text-missing"],
    ["studio-mobile-safari", "Studio creates, pauses, persists, and removes a local alert", "alert-close-control-text-missing"],
  ];
  const actualFullFailures = targetedFailures?.studioFullFailures ?? [];
  assert(Array.isArray(actualFullFailures) && actualFullFailures.length === 7, failures, "Phase 8.8.11 full Studio failure ledger must contain seven records");
  const actualFailureKeys = new Set();
  for (const failure of actualFullFailures) {
    const key = failureKey(failure);
    assert(!actualFailureKeys.has(key), failures, `duplicate Phase 8.8.11 full Studio failure: ${key}`);
    actualFailureKeys.add(key);
    assert(failure?.status === "unexpected" && typeof failure?.errorMessage === "string" && failure.errorMessage.length > 0 && typeof failure?.rootCauseClass === "string", failures, `Phase 8.8.11 full Studio failure metadata is incomplete: ${key}`);
  }
  const expectedFailureKeys = new Set(expectedFullFailures.map(([project, title]) => `${project}\0${title}`));
  assert(JSON.stringify([...actualFailureKeys].sort()) === JSON.stringify([...expectedFailureKeys].sort()), failures, "Phase 8.8.11 seven-failure identities do not reconcile");
  for (const [project, title, rootCauseClass] of expectedFullFailures) {
    const failure = actualFullFailures.find((candidate) => candidate?.project === project && candidate?.title === title);
    assert(failure?.rootCauseClass === rootCauseClass, failures, `Phase 8.8.11 root-cause class mismatch: ${project} ${title}`);
  }

  const uniqueFailures = targetedFailures?.primaryAndExtendedUniqueFailures ?? [];
  assert(Array.isArray(uniqueFailures) && uniqueFailures.length === 4, failures, "Phase 8.8.11 unique focused failure ledger must contain four records");
  for (const failure of uniqueFailures) {
    assert(failure?.status === "unexpected" && failure?.ok === false && finiteNonNegative(failure?.durationMs), failures, `Phase 8.8.11 unique failure metadata is incomplete: ${failureKey(failure)}`);
    assert(isRecord(failure?.diagnostics) && isRecord(failure.diagnostics.viewport) && Array.isArray(failure.diagnostics.pageErrors) && Array.isArray(failure.diagnostics.consoleErrors), failures, `Phase 8.8.11 unique failure diagnostics are incomplete: ${failureKey(failure)}`);
  }
  assert(targetedFailures?.schemaVersion === 1 && targetedFailures?.phase === policy.phase, failures, "Phase 8.8.11 targeted failure metadata mismatch");

  assert(comparison?.schemaVersion === 1 && comparison?.phase === policy.phase && comparison?.compareAgainstPhase === "8.8.9", failures, "Phase 8.8.11 comparison metadata mismatch");
  assert(comparison?.phase889Focused?.records === 6 && comparison?.phase889Focused?.passed === 1 && comparison?.phase889Focused?.failed === 5, failures, "Phase 8.8.11 prior focused totals mismatch");
  assert(comparison?.currentPrimaryFocused?.records === 9 && comparison?.currentPrimaryFocused?.passed === 8 && comparison?.currentPrimaryFocused?.failed === 1, failures, "Phase 8.8.11 comparison primary totals mismatch");
  assert(comparison?.currentStudioFull?.discovered === 120 && comparison?.currentStudioFull?.passed === 113 && comparison?.currentStudioFull?.failed === 7 && comparison?.currentStudioFull?.exitCode === 1, failures, "Phase 8.8.11 comparison Studio totals mismatch");
  assert(comparison?.currentStandaloneFull?.discovered === 70 && comparison?.currentStandaloneFull?.passed === 70 && comparison?.currentStandaloneFull?.failed === 0 && comparison?.currentStandaloneFull?.exitCode === 0, failures, "Phase 8.8.11 comparison standalone totals mismatch");
  assert(Array.isArray(comparison?.previouslyFailingNowPassingFocusedOnly) && comparison.previouslyFailingNowPassingFocusedOnly.length === 5, failures, "Phase 8.8.11 focused resolution count mismatch");
  assert(Array.isArray(comparison?.previouslyFailingStillFailing) && comparison.previouslyFailingStillFailing.length === 0, failures, "Phase 8.8.11 prior focused failures remain incorrectly claimed");
  assert(Array.isArray(comparison?.newlyFailingInFullStudioMatrix) && comparison.newlyFailingInFullStudioMatrix.length === 7, failures, "Phase 8.8.11 full Studio failure comparison is incomplete");

  assert(observations?.schemaVersion === 1 && observations?.phase === policy.phase && Array.isArray(observations?.observations) && observations.observations.length === 6, failures, "Phase 8.8.11 root-cause observations are incomplete");
  for (const observation of observations?.observations ?? []) {
    assert(typeof observation?.id === "string" && typeof observation?.class === "string" && typeof observation?.detail === "string", failures, `Phase 8.8.11 observation metadata is incomplete: ${observation?.id}`);
    if (observation?.officialResult === "FAIL") assert(!/resolved|fixed|fully green/i.test(observation.detail), failures, `Phase 8.8.11 failed observation makes an unsupported resolution claim: ${observation?.id}`);
  }

  for (const [index, text] of textFiles.entries()) for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: 27,
    perProject: { primaryFocused: 9, extendedFocused: 18, standalone: 70, studio: 120 },
    totals: { primaryExpected: 8, primaryUnexpected: 1, extendedExpected: 14, extendedUnexpected: 4, standaloneExpected: 70, standaloneUnexpected: 0, studioExpected: 113, studioUnexpected: 7 },
    archiveHashes,
    sanitization: failures.some((failure) => failure.includes("sanitization")) ? "FAIL" : "PASS",
    failures,
  };
}

function validatePhase887Pack({ evidenceRoot, policy }) {
  const failures = [];
  const evidenceDirectory = join(evidenceRoot, policy.directory);
  const requiredFiles = policy.requiredFiles ?? REQUIRED_PHASE_887_EVIDENCE_FILES;
  let actualFiles = [];
  try {
    actualFiles = readdirSync(evidenceDirectory).sort();
  } catch (error) {
    failures.push(`evidence directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(JSON.stringify(actualFiles) === JSON.stringify([...requiredFiles].sort()), failures, `unexpected Phase 8.8.7 evidence files: ${actualFiles.join(", ")}`);

  const read = (name) => readJson(join(evidenceDirectory, name), failures, name);
  const manifest = read("manifest.json");
  const focusedFailures = read("focused-failures.json");
  const focusedMatrix = read("focused-matrix.json");
  const focusedCases = read("focused-test-cases.json");
  const comparison = read("regression-comparison.json");
  const observations = read("root-cause-observations.json");
  const textFiles = requiredFiles.map((name) => {
    try { return readFileSync(join(evidenceDirectory, name), "utf8"); } catch { return ""; }
  });

  const sourceDocuments = [
    ["manifest.json", manifest],
    ["focused-failures.json", focusedFailures],
    ["focused-matrix.json", focusedMatrix],
    ["focused-test-cases.json", focusedCases],
    ["root-cause-observations.json", observations],
  ];
  for (const [name, document] of sourceDocuments) {
    assert(isRecord(document), failures, `${name} must contain an object`);
    assert(document?.schemaVersion === 1, failures, `${name} must use schemaVersion 1`);
    assert(document?.sourceCommit === policy.expectedSourceCommit, failures, `${name} source SHA does not match Phase 8.8.7 policy`);
  }
  assert(isRecord(comparison), failures, "regression-comparison.json must contain an object");
  assert(comparison?.schemaVersion === 1, failures, "regression-comparison.json must use schemaVersion 1");
  assert(comparison?.currentSourceCommit === policy.expectedSourceCommit, failures, "Phase 8.8.7 comparison current source SHA mismatch");
  assert(comparison?.baselineSourceCommit === policy.expectedBaselineSourceCommit, failures, "Phase 8.8.7 comparison baseline source SHA mismatch");

  assert(manifest?.phase === policy.phase, failures, "Phase 8.8.7 manifest phase mismatch");
  assert(manifest?.evidenceKind === "trusted-machine-targeted-studio-diagnostics-f1-f6", failures, "Phase 8.8.7 evidence kind mismatch");
  assert(manifest?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.7 behavioral source boundary is missing");
  assert(manifest?.baselinePhase885SourceCommit === policy.expectedBaselineSourceCommit, failures, "Phase 8.8.7 baseline source boundary is missing");
  assert(manifest?.playwright?.testPackageVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.7 Playwright test package version mismatch");
  assert(manifest?.playwright?.cliVersion === OFFICIAL_PLAYWRIGHT.cliVersion, failures, "Phase 8.8.7 Playwright CLI version mismatch");
  assert(manifest?.playwright?.browsersPath === "/ms-playwright", failures, "Phase 8.8.7 Playwright browser path mismatch");
  assert(manifest?.playwright?.browserBinaryPolicy === "Playwright-managed binaries only; no system-browser override.", failures, "Phase 8.8.7 browser binary policy is missing");
  assert(manifest?.container?.image === OFFICIAL_PLAYWRIGHT.image, failures, "Phase 8.8.7 official container image mismatch");
  assert(manifest?.container?.digest === OFFICIAL_PLAYWRIGHT.digest, failures, "Phase 8.8.7 container digest mismatch");
  assert(manifest?.container?.digestVerifiedOnHost === true, failures, "Phase 8.8.7 container digest was not host-verified");
  assert(typeof manifest?.execution?.where === "string" && /trusted/i.test(manifest.execution.where), failures, "Phase 8.8.7 trusted-host provenance is missing");
  assert(manifest?.execution?.notCloudWorkspace === true, failures, "Phase 8.8.7 provenance must not claim cloud execution");
  assert(manifest?.execution?.physicalDeviceTesting === false, failures, "Phase 8.8.7 physical-device limitation is missing");
  assert(manifest?.execution?.productFixesImplementedOnManjaro === false, failures, "Phase 8.8.7 trusted host must not claim product fixes");
  assert(manifest?.execution?.originWorkModified === false, failures, "Phase 8.8.7 trusted host must not claim origin/work modifications");
  assert(manifest?.execution?.fullMatrixExecuted === false, failures, "Phase 8.8.7 focused evidence must not claim a full matrix");
  assert(manifest?.execution?.fullMatrixDecision === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.7 full-matrix boundary is missing");
  assert(manifest?.archives?.remainOnTrustedMachineOnly === true, failures, "Phase 8.8.7 archive handling policy is missing");
  assert(manifest?.archives?.publishedToGitHub === false, failures, "Phase 8.8.7 archives must not be published to GitHub");
  for (const [group, artifacts] of Object.entries(manifest?.sourceArtifactHashes ?? {})) {
    assert(isRecord(artifacts), failures, `Phase 8.8.7 source artifacts ${group} are missing`);
    for (const [name, artifact] of Object.entries(artifacts ?? {})) {
      assert(validSha(artifact?.sha256), failures, `invalid Phase 8.8.7 source artifact SHA-256: ${group}/${name}`);
      assert(Number.isInteger(artifact?.bytes) && artifact.bytes >= 0, failures, `invalid Phase 8.8.7 source artifact byte count: ${group}/${name}`);
    }
  }
  for (const [name, archive] of Object.entries(manifest?.archives ?? {})) {
    if (isRecord(archive) && "sha256" in archive) assert(validSha(archive.sha256), failures, `invalid Phase 8.8.7 archive SHA-256: ${name}`);
  }

  const expectedGroups = {
    F1: { total: 1, passed: 0, failed: 1 },
    F2: { total: 2, passed: 0, failed: 2 },
    F3: { total: 3, passed: 0, failed: 3 },
    F4: { total: 1, passed: 0, failed: 1 },
    F5: { total: 12, passed: 5, failed: 7 },
    F6: { total: 15, passed: 4, failed: 11 },
  };
  assert(focusedMatrix?.phase === policy.phase, failures, "Phase 8.8.7 focused matrix phase mismatch");
  assert(focusedMatrix?.behavioralSourceCommit === policy.expectedBehavioralSourceCommit, failures, "Phase 8.8.7 focused matrix behavioral source mismatch");
  assert(focusedMatrix?.baselineSourceCommit === policy.expectedBaselineSourceCommit, failures, "Phase 8.8.7 focused matrix baseline source mismatch");
  assert(focusedMatrix?.playwrightVersion === OFFICIAL_PLAYWRIGHT.testPackageVersion, failures, "Phase 8.8.7 focused matrix Playwright version mismatch");
  assert(focusedMatrix?.config === "playwright.studio.compat.config.ts", failures, "Phase 8.8.7 focused matrix config mismatch");
  assert(focusedMatrix?.fullMatrixExecuted === false && focusedMatrix?.fullMatrixDecision === "FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN", failures, "Phase 8.8.7 focused matrix must remain incomplete");
  for (const [group, expected] of Object.entries(expectedGroups)) {
    const actual = focusedMatrix?.groups?.[group];
    assert(actual?.counts?.total === expected.total && actual?.counts?.passed === expected.passed && actual?.counts?.failed === expected.failed && actual?.counts?.flaky === 0 && actual?.counts?.skipped === 0, failures, `Phase 8.8.7 ${group} totals mismatch`);
  }

  const cases = focusedCases?.cases ?? [];
  const caseKey = (record) => `${record?.group}\0${record?.project}\0${typeof record?.file === "string" ? record.file.split("/").pop() : record?.file}\0${record?.title}`;
  const caseKeys = new Set();
  const failedCaseKeys = new Set();
  const passedCaseKeys = new Set();
  for (const record of cases) {
    const key = caseKey(record);
    assert(!caseKeys.has(key), failures, `duplicate Phase 8.8.7 focused test record: ${key}`); caseKeys.add(key);
    assert(Object.hasOwn(expectedGroups, record?.group), failures, `unknown Phase 8.8.7 focused group: ${key}`);
    assert(STUDIO_PROJECTS.includes(record?.project), failures, `unknown Phase 8.8.7 focused project: ${key}`);
    assert(typeof record?.file === "string" && record.file.length > 0 && typeof record?.title === "string" && record.title.length > 0, failures, `Phase 8.8.7 focused identity is missing: ${key}`);
    assert(record?.status === "passed" || record?.status === "failed", failures, `invalid Phase 8.8.7 focused status: ${key}`);
    assert(finiteNonNegative(record?.durationMs), failures, `invalid Phase 8.8.7 focused duration: ${key}`);
    if (record?.status === "failed") {
      failedCaseKeys.add(key);
      assert(record?.exitImplication === 1 && typeof record?.error === "string" && record.error.length > 0, failures, `failed Phase 8.8.7 record lacks error metadata: ${key}`);
    } else {
      passedCaseKeys.add(key);
      assert(Number.isInteger(record?.exitImplication) && record.exitImplication >= 0, failures, `passed Phase 8.8.7 record has invalid exit implication: ${key}`);
    }
  }
  assert(cases.length === 34 && caseKeys.size === 34, failures, "Phase 8.8.7 focused record count mismatch");
  assert(focusedCases?.cases?.filter((record) => record?.status === "passed").length === 9 && focusedCases?.cases?.filter((record) => record?.status === "failed").length === 25, failures, "Phase 8.8.7 focused pass/fail totals mismatch");
  assert(focusedCases?.schemaVersion === 1 && focusedCases?.phase === policy.phase, failures, "Phase 8.8.7 focused test-case metadata mismatch");

  const failureRecords = focusedFailures?.failures ?? [];
  const failureKeys = new Set();
  for (const failure of failureRecords) {
    const key = caseKey(failure);
    assert(!failureKeys.has(key), failures, `duplicate Phase 8.8.7 failure record: ${key}`); failureKeys.add(key);
    assert(failedCaseKeys.has(key), failures, `Phase 8.8.7 failure has no matching failed case: ${key}`);
    assert(failure?.status === "failed" && finiteNonNegative(failure?.durationMs), failures, `invalid Phase 8.8.7 failure status/duration: ${key}`);
    const diagnostics = failure?.diagnostics;
    const viewport = diagnostics?.viewport;
    assert(isRecord(viewport) && ["innerWidth", "innerHeight", "clientWidth", "clientHeight", "visualViewportWidth", "visualViewportHeight", "devicePixelRatio", "screenWidth", "scrollWidth"].every((field) => Number.isFinite(viewport?.[field])), failures, `Phase 8.8.7 viewport diagnostics are incomplete: ${key}`);
    assert(typeof viewport?.viewportMeta === "string" && typeof viewport?.maxWidth720 === "boolean", failures, `Phase 8.8.7 viewport contract diagnostics are incomplete: ${key}`);
    assert(isRecord(diagnostics?.scroll) && Number.isFinite(diagnostics.scroll.x) && Number.isFinite(diagnostics.scroll.y), failures, `Phase 8.8.7 scroll diagnostics are incomplete: ${key}`);
    assert(Array.isArray(diagnostics?.panels) && Array.isArray(diagnostics?.criticalTargets) && Array.isArray(diagnostics?.pageErrors) && Array.isArray(diagnostics?.consoleErrors), failures, `Phase 8.8.7 bounded diagnostics are incomplete: ${key}`);
    assert(isRecord(diagnostics?.resizeObserver) && Number.isInteger(diagnostics.resizeObserver.count) && diagnostics.resizeObserver.count >= 0 && Array.isArray(diagnostics.resizeObserver.lastEntries), failures, `Phase 8.8.7 ResizeObserver diagnostics are incomplete: ${key}`);
  }
  assert(focusedFailures?.schemaVersion === 1 && focusedFailures?.phase === policy.phase && focusedFailures?.failureCount === 25 && failureRecords.length === 25, failures, "Phase 8.8.7 failure ledger count mismatch");
  assert(failureKeys.size === failedCaseKeys.size && [...failureKeys].every((key) => failedCaseKeys.has(key)), failures, "Phase 8.8.7 failure ledger does not reconcile with failed cases");

  const uniqueIdentity = (record) => `${record?.project}\0${typeof record?.file === "string" ? record.file.split("/").pop() : record?.file}\0${record?.title}`;
  const comparisonIdentity = (record) => `${record?.project}\0${record?.title}`;
  const uniqueAll = new Set(cases.map(uniqueIdentity));
  const uniquePassed = new Set(cases.filter((record) => record?.status === "passed").map(uniqueIdentity));
  const uniqueFailed = new Set(cases.filter((record) => record?.status === "failed").map(uniqueIdentity));
  assert(uniqueAll.size === 26 && uniquePassed.size === 8 && uniqueFailed.size === 18, failures, "Phase 8.8.7 unique focused identity totals mismatch");
  assert(focusedMatrix?.aggregateFocusedRecords?.records === 34 && focusedMatrix?.aggregateFocusedRecords?.passedRecords === 9 && focusedMatrix?.aggregateFocusedRecords?.failedRecords === 25 && focusedMatrix?.aggregateFocusedRecords?.uniqueIdentities === 26 && focusedMatrix?.aggregateFocusedRecords?.uniquePassed === 8 && focusedMatrix?.aggregateFocusedRecords?.uniqueFailed === 18, failures, "Phase 8.8.7 aggregate focused totals mismatch");

  assert(comparison?.phase === policy.phase && comparison?.baselinePhase === "8.8.5", failures, "Phase 8.8.7 comparison phase metadata mismatch");
  assert(comparison?.baselineStudioTotals?.discovered === 110 && comparison?.baselineStudioTotals?.passed === 79 && comparison?.baselineStudioTotals?.failed === 31 && comparison?.baselineStudioTotals?.skipped === 0 && comparison?.baselineStudioTotals?.flaky === 0, failures, "Phase 8.8.7 baseline Studio totals mismatch");
  assert(comparison?.currentFullStudioTotals === null && comparison?.resolvedCountClaim === 0, failures, "Phase 8.8.7 must not claim a full-matrix result or resolution");
  assert(Array.isArray(comparison?.previouslyFailingNowPassingFocusedOnly) && comparison.previouslyFailingNowPassingFocusedOnly.length === 0, failures, "Phase 8.8.7 must not claim a focused resolution");
  assert(Array.isArray(comparison?.newlyFailingInFocused) && comparison.newlyFailingInFocused.length === 0, failures, "Phase 8.8.7 unexpected new-failure comparison metadata");
  assert(Array.isArray(comparison?.baselineFailuresNotExecutedInFocused) && comparison.baselineFailuresNotExecutedInFocused.length === 13, failures, "Phase 8.8.7 incomplete baseline coverage count mismatch");
  const baselineFailurePack = readJson(join(evidenceRoot, "phase-8-8-5", "studio-failures.json"), failures, "phase-8-8-5/studio-failures.json");
  const baselineKeys = new Set((baselineFailurePack?.failures ?? []).map(comparisonIdentity));
  const focusedComparisonKeys = new Set(cases.map(comparisonIdentity));
  for (const record of cases.filter((item) => item?.status === "failed")) assert(baselineKeys.has(comparisonIdentity(record)), failures, `Phase 8.8.7 failed focused identity was not in the 8.8.5 baseline: ${comparisonIdentity(record)}`);
  for (const record of comparison?.baselineFailuresNotExecutedInFocused ?? []) assert(baselineKeys.has(comparisonIdentity(record)) && !focusedComparisonKeys.has(comparisonIdentity(record)), failures, `Phase 8.8.7 incomplete baseline record is inconsistent: ${comparisonIdentity(record)}`);
  assert(Array.isArray(comparison?.focusedPassingNotInBaselineFailures) && comparison.focusedPassingNotInBaselineFailures.length === 8, failures, "Phase 8.8.7 focused pass comparison count mismatch");
  for (const record of comparison?.focusedPassingNotInBaselineFailures ?? []) assert([...uniquePassed].some((key) => key.endsWith(`\0${record?.title}`) && key.startsWith(`${record?.project}\0`)) && !baselineKeys.has(comparisonIdentity(record)), failures, `Phase 8.8.7 focused pass comparison is inconsistent: ${comparisonIdentity(record)}`);

  assert(observations?.phase === policy.phase && Array.isArray(observations?.confirmed) && observations.confirmed.length === 5 && Array.isArray(observations?.revisedHypotheses) && observations.revisedHypotheses.length === 2 && Array.isArray(observations?.diagnosticImprovements) && observations.diagnosticImprovements.length >= 1, failures, "Phase 8.8.7 root-cause observation metadata is incomplete");
  for (const observation of observations?.confirmed ?? []) assert(typeof observation?.id === "string" && typeof observation?.status === "string" && Array.isArray(observation?.evidenceGroups) && typeof observation?.observation === "string", failures, `Phase 8.8.7 confirmed observation is incomplete: ${observation?.id}`);

  for (const [index, text] of textFiles.entries()) for (const pattern of forbiddenPatterns) assert(!pattern.test(text), failures, `sanitization pattern ${pattern} found in ${requiredFiles[index]}`);
  return {
    phase: policy.phase,
    directory: policy.directory,
    sourceCommit: policy.expectedSourceCommit,
    status: failures.length === 0 ? "PASS" : "FAIL",
    files: actualFiles,
    testRecords: 34,
    perProject: Object.fromEntries(STUDIO_PROJECTS.map((project) => [project, cases.filter((record) => record?.project === project).length])),
    totals: { expected: 9, unexpected: 25, uniqueIdentities: 26 },
    archiveHashes: Object.values(manifest?.archives ?? {}).filter((archive) => isRecord(archive) && "sha256" in archive).map((archive) => archive.sha256),
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

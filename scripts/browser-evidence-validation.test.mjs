import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EVIDENCE_PACK_POLICIES, validateAllEvidencePacks, validateEvidencePack } from "./browser-evidence-validator.mjs";

const repositoryEvidenceRoot = join(process.cwd(), "docs", "evidence", "browser");

function copyPack(phase) {
  const root = mkdtempSync(join(tmpdir(), "openkline-evidence-"));
  cpSync(join(repositoryEvidenceRoot, EVIDENCE_PACK_POLICIES[phase].directory), join(root, EVIDENCE_PACK_POLICIES[phase].directory), { recursive: true });
  return root;
}

function editJson(root, phase, fileName, edit) {
  const path = join(root, EVIDENCE_PACK_POLICIES[phase].directory, fileName);
  const document = JSON.parse(readFileSync(path, "utf8"));
  edit(document);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}

test("all versioned trusted evidence packs validate independently", () => {
  const result = validateAllEvidencePacks({ evidenceRoot: repositoryEvidenceRoot });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.packs.map((pack) => [pack.phase, pack.sourceCommit, pack.testRecords]), [
    ["8.6.1", EVIDENCE_PACK_POLICIES["8.6.1"].expectedSourceCommit, 70],
    ["8.8.1", EVIDENCE_PACK_POLICIES["8.8.1"].expectedSourceCommit, 70],
    ["8.8.3", EVIDENCE_PACK_POLICIES["8.8.3"].expectedSourceCommit, 175],
  ]);
});

test("duplicate or malformed records are rejected", () => {
  const root = copyPack("8.8.1");
  editJson(root, "8.8.1", "test-cases.json", (document) => {
    document.byBrowser.chromium[0].durationMs = -1;
    document.byBrowser.chromium[1] = { ...document.byBrowser.chromium[0] };
  });
  const result = validateEvidencePack({ evidenceRoot: root, policy: EVIDENCE_PACK_POLICIES["8.8.1"] });
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("duplicate test record")));
  assert.ok(result.failures.some((failure) => failure.includes("invalid test duration")));
  rmSync(root, { recursive: true, force: true });
});

test("failed Studio evidence is integrity-valid but falsified failure details are rejected", () => {
  const root = copyPack("8.8.3");
  editJson(root, "8.8.3", "studio-failures.json", (document) => {
    document.failures[0].classification = "";
  });
  const result = validateEvidencePack({ evidenceRoot: root, policy: EVIDENCE_PACK_POLICIES["8.8.3"] });
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("unknown Studio failure classification")));
  rmSync(root, { recursive: true, force: true });
});

test("missing pack files are rejected rather than inferred from totals", () => {
  const root = copyPack("8.8.1");
  unlinkSync(join(root, EVIDENCE_PACK_POLICIES["8.8.1"].directory, "test-cases.json"));
  const result = validateEvidencePack({ evidenceRoot: root, policy: EVIDENCE_PACK_POLICIES["8.8.1"] });
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.some((failure) => failure.includes("test-cases.json")));
  rmSync(root, { recursive: true, force: true });
});

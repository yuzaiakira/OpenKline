import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyNpmInstallFailure,
  ConsumerPreviewError,
  readPackedManifest,
  selectPackedArchive,
} from "./consumer-preview-utils.mjs";

function packedFixture(manifests) {
  const root = mkdtempSync(join(tmpdir(), "openkline-consumer-fixture-"));
  const archives = join(root, "archives");
  mkdirSync(archives);
  for (const [index, manifest] of manifests.entries()) {
    const packageRoot = join(root, `package-${index}`, "package");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify(manifest)}\n`);
    writeFileSync(join(packageRoot, "index.js"), "export {};\n");
    execFileSync("tar", ["-czf", join(archives, `${manifest.name.replaceAll("/", "-")}-${index}.tgz`), "-C", join(root, `package-${index}`), "package"]);
  }
  return { root, archives };
}

test("consumer archive selection is package-identity and version deterministic", () => {
  const fixture = packedFixture([
    { name: "openkline", version: "0.1.0" },
    { name: "@openkline/react", version: "0.1.0", peerDependencies: { openkline: "^0.1.0", react: ">=18" } },
  ]);
  try {
    const selected = selectPackedArchive(fixture.archives, { name: "@openkline/react", version: "0.1.0", peerDependencies: { openkline: "^0.1.0", react: ">=18" } });
    assert.equal(readPackedManifest(selected.archive).name, "@openkline/react");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("consumer archive selection rejects missing, ambiguous, and malformed packages", () => {
  const missing = mkdtempSync(join(tmpdir(), "openkline-consumer-missing-"));
  assert.throws(() => selectPackedArchive(missing, { name: "openkline", version: "0.1.0" }), (error) => error instanceof ConsumerPreviewError && error.code === "MISSING_LOCAL_ARCHIVE");
  rmSync(missing, { recursive: true, force: true });

  const malformed = mkdtempSync(join(tmpdir(), "openkline-consumer-malformed-"));
  writeFileSync(join(malformed, "broken.tgz"), "not a tarball");
  assert.throws(() => selectPackedArchive(malformed, { name: "openkline", version: "0.1.0" }), (error) => error instanceof ConsumerPreviewError && error.code === "MALFORMED_PACKED_PACKAGE");
  rmSync(malformed, { recursive: true, force: true });

  const fixture = packedFixture([{ name: "openkline", version: "0.1.0" }]);
  try {
    copyFileSync(join(fixture.archives, "openkline-0.tgz"), join(fixture.archives, "openkline-duplicate.tgz"));
    assert.throws(() => selectPackedArchive(fixture.archives, { name: "openkline", version: "0.1.0" }), (error) => error instanceof ConsumerPreviewError && error.code === "AMBIGUOUS_LOCAL_ARCHIVE");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("consumer metadata preserves compatible and incompatible peer distinctions", () => {
  const blocked = classifyNpmInstallFailure({
    offline: true,
    output: "npm error code ERESOLVE\nFound react@undefined\nCould not resolve dependency: peer react=\">=18\"",
    missingArtifacts: [{ name: "react", version: "19.3.1" }],
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.code, "OFFLINE_CACHE_INCOMPLETE");

  const conflict = classifyNpmInstallFailure({
    offline: true,
    output: "npm error code ERESOLVE\nFound react@17.0.2\nCould not resolve dependency: peer react=\">=18\"",
    missingArtifacts: [],
  });
  assert.equal(conflict.status, "FAIL");
  assert.equal(conflict.code, "INCOMPATIBLE_PEER_DEPENDENCY");
});

/**
 * Verifies concurrent locked builds cannot interleave clean/compile on dist/.
 * Run: node --test scripts/build-lock-concurrency.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(root, "scripts/with-repo-build-lock.mjs"), process.execPath, join(root, "scripts/build.mjs")],
      {
        cwd: root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe("repository build lock", () => {
  it("serializes two concurrent full builds to success", async () => {
    // Intentionally do not run inside `npm test`: full builds call clean.mjs which
    // removes test-dist/ and would race parallel unit workers.
    await rm(join(root, "dist"), { recursive: true, force: true });
    await rm(join(root, "packages/react/dist"), { recursive: true, force: true });
    const [first, second] = await Promise.all([runBuild(), runBuild()]);
    assert.equal(first.code, 0, `first build failed:\n${first.stderr}\n${first.stdout}`);
    assert.equal(second.code, 0, `second build failed:\n${second.stderr}\n${second.stdout}`);
    await access(join(root, "dist/src/index.d.ts"));
    await access(join(root, "dist/src/index.js"));
    await access(join(root, "packages/react/dist/index.d.ts"));
  });
});

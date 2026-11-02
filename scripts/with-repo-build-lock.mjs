#!/usr/bin/env node
/**
 * Serialize repository clean/build mutations that share `dist/` and `test-dist/`.
 *
 * Concurrent `npm run build` / `npm run clean` previously raced: one process
 * deleted `dist` while another compiled `packages/react` against `openkline`
 * types, producing TS2307 / cascading TS7006 failures.
 *
 * Re-entrant: nested invocations in the same process tree reuse the held lock
 * via OPENKLINE_BUILD_LOCK_HELD=1 (set while the outer holder runs children).
 */
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, ".cache", "openkline-build.lock");
const lockTimeoutMs = Number(process.env.OPENKLINE_BUILD_LOCK_TIMEOUT_MS ?? 180_000);
const pollMs = 50;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid() {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function tryAcquire() {
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    writeSync(fd, `${process.pid}\n`);
    return fd;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      const holder = readLockPid();
      if (holder !== null && !pidAlive(holder)) {
        try {
          unlinkSync(lockPath);
        } catch {
          /* another waiter may remove it */
        }
      }
      return null;
    }
    throw error;
  }
}

function acquire() {
  if (process.env.OPENKLINE_BUILD_LOCK_HELD === "1") {
    return null; // re-entrant: ancestor already holds the lock
  }
  const deadline = Date.now() + lockTimeoutMs;
  for (;;) {
    const fd = tryAcquire();
    if (fd !== null) return fd;
    if (Date.now() >= deadline) {
      const holder = readLockPid();
      throw new Error(
        `Timed out after ${lockTimeoutMs}ms waiting for OpenKline build lock` +
          (holder ? ` (held by pid ${holder})` : ""),
      );
    }
    const waitUntil = Date.now() + pollMs;
    while (Date.now() < waitUntil) {
      /* short spin; avoid SharedArrayBuffer Atomics.wait host variance */
    }
  }
}

function release(fd) {
  if (fd === null) return;
  try {
    closeSync(fd);
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(lockPath) && readLockPid() === process.pid) {
      unlinkSync(lockPath);
    }
  } catch {
    /* ignore */
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/with-repo-build-lock.mjs <command> [args...]");
  process.exit(2);
}

const fd = acquire();
const env = { ...process.env, OPENKLINE_BUILD_LOCK_HELD: "1" };
let status = 1;
try {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    env,
    shell: false,
  });
  if (result.error) {
    console.error(result.error);
    status = 1;
  } else {
    status = result.status ?? 1;
  }
} finally {
  release(fd);
}

process.exit(status);

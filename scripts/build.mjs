#!/usr/bin/env node
/**
 * Locked repository build: clean library emits → core → React package types.
 * Invoked under with-repo-build-lock so concurrent suite builds serialize.
 *
 * Does not wipe test-dist — unit workers and other consumers may still read it.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(join(root, "dist"), { recursive: true, force: true });
rmSync(join(root, "packages/react/dist"), { recursive: true, force: true });
run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"]);
run(process.execPath, [
  join(root, "node_modules/typescript/bin/tsc"),
  "-p",
  "packages/react/tsconfig.json",
]);

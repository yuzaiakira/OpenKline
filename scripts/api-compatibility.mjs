import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildInventory } from "./public-api-inventory.mjs";

const root = process.cwd();
const baseline = JSON.parse(readFileSync(join(root, "docs/audits/public-api-baseline.json"), "utf8"));
const current = buildInventory();
const keyOf = (entry) => `${entry.package}:${entry.kind}:${entry.name}`;
const before = new Map(baseline.surface.map((entry) => [keyOf(entry), entry]));
const after = new Map(current.surface.map((entry) => [keyOf(entry), entry]));
const removed = [];
const changed = [];
const added = [];

for (const [key, entry] of before) {
  const next = after.get(key);
  if (next === undefined) removed.push(key);
  else if (next.signatureHash !== entry.signatureHash) changed.push({ key, before: entry.signatureHash, after: next.signatureHash });
}
for (const [key] of after) if (!before.has(key)) added.push(key);

const status = removed.length === 0 && changed.length === 0 ? "PASS" : "FAIL";
console.log(JSON.stringify({
  status,
  baselineCommit: baseline.baselineCommit ?? null,
  removed,
  changed,
  additiveExports: added,
  notes: [
    "Removal and exported declaration signature changes are compatibility failures.",
    "Additive exports are reported but are not breaking by themselves.",
    "Worker protocol and serialized document versions remain explicit API contracts and require their own versioned tests.",
  ],
}, null, 2));
if (status === "FAIL") process.exitCode = 1;

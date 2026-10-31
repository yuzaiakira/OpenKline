import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRepositoryState } from "./release-readiness-policy.mjs";

const head = "a".repeat(40);

test("release readiness accepts only clean synchronized main/origin-main state", () => {
  const result = evaluateRepositoryState({
    branch: "main",
    upstream: "origin/main",
    clean: true,
    head,
    upstreamHead: head,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.evidence.synchronized, true);
});

test("release readiness rejects stale work upstream assumptions", () => {
  const result = evaluateRepositoryState({
    branch: "main",
    upstream: "origin/work",
    clean: true,
    head,
    upstreamHead: head,
  });
  assert.equal(result.status, "FAIL");
});

test("release readiness rejects dirty or unsynchronized repositories", () => {
  const dirty = evaluateRepositoryState({ branch: "main", upstream: "origin/main", clean: false, head, upstreamHead: head });
  const stale = evaluateRepositoryState({ branch: "main", upstream: "origin/main", clean: true, head, upstreamHead: "b".repeat(40) });
  assert.equal(dirty.status, "FAIL");
  assert.equal(stale.status, "FAIL");
  assert.equal(stale.evidence.synchronized, false);
});

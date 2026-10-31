const SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

export function evaluateRepositoryState({
  branch,
  upstream,
  clean,
  head,
  upstreamHead,
  expectedBranch = "main",
  expectedUpstream = "origin/main",
}) {
  const validHead = typeof head === "string" && SHA_PATTERN.test(head);
  const synchronized = validHead && typeof upstreamHead === "string" && SHA_PATTERN.test(upstreamHead) && head === upstreamHead;
  const status = branch === expectedBranch && upstream === expectedUpstream && clean === true && validHead && synchronized ? "PASS" : "FAIL";
  return {
    name: "repository",
    status,
    evidence: { branch, upstream, clean, head, upstreamHead, expectedBranch, expectedUpstream, synchronized, validHead },
    reason: status === "PASS" ? undefined : "Repository must be clean, on the approved branch, and synchronized with its approved upstream.",
  };
}

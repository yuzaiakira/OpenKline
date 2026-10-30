import assert from "node:assert/strict";
import test from "node:test";
import { findProviderSpecificText } from "./package-portability-policy.mjs";

test("package portability policy rejects a newly introduced provider-specific dependency", () => {
  assert.deepEqual(findProviderSpecificText([
    { path: "safe.js", contents: "createProviderNeutralAdapter()" },
    { path: "unsafe.js", contents: "createBinanceAdapter()" },
  ]), ["unsafe.js"]);
});

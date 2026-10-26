import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const output = join(root, "artifacts", "release-readiness", stamp);
mkdirSync(output, { recursive: true });
const gates = [];

function commandVersion(command, args, cwd = root) {
  try { return execFileSync(command, args, { cwd, encoding: "utf8" }).trim(); } catch { return null; }
}

function runGate(name, command, args, options = {}) {
  const cwd = options.cwd ?? root;
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? "/tmp/openkline-npm-cache", NEXT_TELEMETRY_DISABLED: "1" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  writeFileSync(join(output, `${name}.stdout.log`), stdout);
  writeFileSync(join(output, `${name}.stderr.log`), stderr);
  let status = result.status === 0 ? "PASS" : "FAIL";
  if (options.blockedPattern !== undefined && options.blockedPattern.test(`${stdout}\n${stderr}`)) status = "BLOCKED";
  gates.push({ name, status, command: [command, ...args], cwd, exitCode: result.status, logs: { stdout: `${name}.stdout.log`, stderr: `${name}.stderr.log` } });
}

const branch = commandVersion("git", ["branch", "--show-current"]);
const upstream = commandVersion("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
const porcelain = commandVersion("git", ["status", "--porcelain", "--untracked-files=all"]);
gates.push({ name: "repository", status: branch === "work" && upstream === "origin/work" && porcelain === "" ? "PASS" : "FAIL", evidence: { branch, upstream, clean: porcelain === "" } });

runGate("api-compatibility", "node", ["scripts/api-compatibility.mjs"]);
runGate("typecheck", "npm", ["run", "typecheck"]);
runGate("unit-integration", "npm", ["test"]);
runGate("chromium-diagnostic", "npm", ["run", "browser:diagnostic"]);
runGate("react-browser", "npm", ["run", "test:react:browser"]);
runGate("canvas2d-benchmark", "npm", ["run", "benchmark:browser"]);
runGate("package-portability", "npm", ["run", "package:portability"]);
runGate("distribution", "npm", ["run", "distribution:check"]);
runGate("package-smoke", "npm", ["run", "package:smoke"]);
runGate("consumer-smoke", "node", ["scripts/consumer-preview-smoke.mjs"]);
runGate("license-inventory", "node", ["scripts/validate-license-inventory.mjs"]);
runGate("root-audit", "npm", ["audit", "--json", "--include=dev"]);
runGate("next-audit", "npm", ["audit", "--json", "--include=dev"], { cwd: join(root, "examples/nextjs-app-router") });
runGate("next-production-build", "npm", ["run", "build"], { cwd: join(root, "examples/nextjs-app-router") });
runGate("managed-browser-compatibility", "npm", ["run", "browser:verify"], { blockedPattern: /blocked-missing-official-browser|Executable does not exist|Please run the following command to download new browsers/ });

const manualGates = [
  { name: "effective-license", status: "REQUIRES OWNER APPROVAL", reason: "Proposed custom source-available terms are not effective or OSI-approved." },
  { name: "third-party-notices", status: "BLOCKED", reason: "Actual license texts and redistribution notices remain under legal review." },
  { name: "formal-accessibility", status: "NOT TESTED", reason: "Automated smoke exists; manual assistive-technology and conformance review is open." },
  { name: "approved-visual-baselines", status: "NOT TESTED", reason: "Review captures exist; no owner-approved baseline set exists." },
  { name: "physical-devices", status: "NOT TESTED", reason: "No physical Android/iOS device evidence is available." },
  { name: "release-authorization", status: "REQUIRES OWNER APPROVAL", reason: "No version, channel, publication, tag, or release approval was provided." },
];
gates.push(...manualGates);

const blockers = gates.filter((gate) => gate.status !== "PASS");
const summary = {
  schemaVersion: 1,
  status: blockers.length === 0 ? "RELEASE READY" : "NOT READY",
  generatedAt: new Date().toISOString(),
  gitCommit: commandVersion("git", ["rev-parse", "HEAD"]),
  node: process.version,
  npm: commandVersion("npm", ["--version"]),
  outputDirectory: output,
  gates,
  blockers: blockers.map((gate) => ({ name: gate.name, status: gate.status, reason: gate.reason ?? gate.exitCode ?? "see gate logs" })),
  publication: "not performed",
  githubActions: "not used",
};
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (blockers.length > 0) process.exitCode = 2;

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, firefox, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectNames = ["studio-chromium", "studio-firefox", "studio-webkit", "studio-mobile-chrome", "studio-mobile-safari"];
const browserDefinitions = {
  "studio-chromium": { browser: chromium, browserName: "chromium", device: null },
  "studio-firefox": { browser: firefox, browserName: "firefox", device: null },
  "studio-webkit": { browser: webkit, browserName: "webkit", device: null },
  "studio-mobile-chrome": { browser: chromium, browserName: "chromium", device: devices["Pixel 7"] },
  "studio-mobile-safari": { browser: webkit, browserName: "webkit", device: devices["iPhone 13"] },
};

function parseArguments(argv) {
  let output = null;
  let projects = projectNames;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") output = argv[++index] ?? null;
    else if (argument.startsWith("--output=")) output = argument.slice("--output=".length);
    else if (argument === "--projects") projects = (argv[++index] ?? "").split(",").filter(Boolean);
    else if (argument.startsWith("--projects=")) projects = argument.slice("--projects=".length).split(",").filter(Boolean);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (projects.length === 0 || projects.some((project) => !projectNames.includes(project))) throw new Error(`Projects must be a comma-separated subset of: ${projectNames.join(", ")}`);
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return { projects, output: resolve(root, output ?? join("artifacts", "studio-browser-verification", stamp)) };
}

function ensureNewOutput(directory) {
  const artifactsRoot = resolve(root, "artifacts");
  if (!directory.startsWith(`${artifactsRoot}/`)) throw new Error("Studio browser output must be below the repository artifacts directory");
  if (existsSync(directory)) throw new Error(`Refusing to overwrite existing Studio browser output: ${directory}`);
  mkdirSync(directory, { recursive: true });
}

function commandVersion(command, args) {
  try { return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim(); } catch { return null; }
}

async function inspectBrowser(project) {
  const definition = browserDefinitions[project];
  const executablePath = definition.browser.executablePath();
  const descriptor = {
    project,
    browserName: definition.browserName,
    distribution: "Playwright-managed",
    executablePath,
    deviceEmulation: definition.device === null ? null : project,
  };
  if (!existsSync(executablePath)) return { ...descriptor, status: "BLOCKED", diagnostic: `Executable does not exist: ${executablePath}` };
  let browser;
  try {
    browser = await definition.browser.launch({ headless: true });
    const context = await browser.newContext(definition.device ?? undefined);
    const page = await context.newPage();
    const result = { ...descriptor, status: "available", browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent) };
    await context.close();
    return result;
  } catch (error) {
    return { ...descriptor, status: "FAIL", diagnostic: error instanceof Error ? error.message : String(error) };
  } finally {
    await browser?.close();
  }
}

function testResultSummary(stdout) {
  try { const result = JSON.parse(stdout); return { parsed: true, stats: result.stats ?? null }; } catch { return { parsed: false, stats: null }; }
}

function artifactHashes(directory) {
  const hashes = {};
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (path.endsWith("summary.json")) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) hashes[path.slice(directory.length + 1)] = { sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), bytes: statSync(path).size };
    }
  }
  visit(directory);
  return hashes;
}

const options = parseArguments(process.argv.slice(2));
ensureNewOutput(options.output);
const browsers = await Promise.all(options.projects.map(inspectBrowser));
const playwright = join(root, "node_modules", ".bin", "playwright");
const command = ["test", "--config", "playwright.studio.compat.config.ts", "--reporter=json", "--output", join(options.output, "test-results"), ...options.projects.flatMap((project) => ["--project", project])];
const metadata = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  workflow: "studio-managed-browser-compatibility",
  gitCommit: commandVersion("git", ["rev-parse", "HEAD"]),
  node: process.version,
  npm: commandVersion("npm", ["--version"]),
  playwright: JSON.parse(readFileSync(join(root, "node_modules", "@playwright", "test", "package.json"), "utf8")).version,
  operatingSystem: { platform: process.platform, arch: process.arch, release: release() },
  projects: options.projects,
  browserBinaryPolicy: "Playwright-managed binaries only; no system-browser override is accepted by this workflow.",
  standaloneMatrixBoundary: "This is Studio evidence only and does not replace the standalone portable matrix.",
  command: [playwright, ...command],
  browsers,
};
writeFileSync(join(options.output, "environment.json"), `${JSON.stringify(metadata, null, 2)}\n`);

const blocked = browsers.some((browser) => browser.status === "BLOCKED");
let result = { status: blocked ? 1 : 0, stdout: "", stderr: "" };
if (!blocked && browsers.every((browser) => browser.status === "available")) {
  const executed = spawnSync(playwright, command, { cwd: root, env: { ...process.env }, encoding: "utf8" });
  if (executed.error) throw executed.error;
  result = { status: executed.status ?? 1, stdout: executed.stdout ?? "", stderr: executed.stderr ?? "" };
}
writeFileSync(join(options.output, "playwright-results.json"), result.stdout);
writeFileSync(join(options.output, "playwright-stderr.log"), result.stderr);
const status = blocked ? "BLOCKED" : result.status === 0 ? "PASS" : "FAIL";
const summary = {
  ...metadata,
  status,
  exitCode: result.status,
  testResult: testResultSummary(result.stdout),
  artifacts: { environment: "environment.json", playwrightResults: "playwright-results.json", stderr: "playwright-stderr.log", testResultsDirectory: "test-results" },
  artifactHashes: artifactHashes(options.output),
};
writeFileSync(join(options.output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (status !== "PASS") process.exitCode = 1;

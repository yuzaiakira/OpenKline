import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = "/usr/bin/chromium";
const launchArgs = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
const projects = ["chromium", "mobile-chrome"];

function parseArguments(argv) {
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") output = argv[++index] ?? null;
    else if (argument.startsWith("--output=")) output = argument.slice("--output=".length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return { output: resolve(root, output ?? join("artifacts", "browser-diagnostic", stamp)) };
}

function ensureNewOutput(directory) {
  const artifactsRoot = resolve(root, "artifacts");
  if (!directory.startsWith(`${artifactsRoot}/`)) {
    throw new Error("Browser diagnostic output must be below the repository artifacts directory");
  }
  if (existsSync(directory)) throw new Error(`Refusing to overwrite existing browser diagnostic output: ${directory}`);
  mkdirSync(directory, { recursive: true });
}

function commandVersion(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function artifactHashes(directory) {
  const hashes = {};
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (path.endsWith("summary.json")) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        hashes[path.slice(directory.length + 1)] = {
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
          bytes: statSync(path).size,
        };
      }
    }
  }
  visit(directory);
  return hashes;
}

function testResultSummary(stdout) {
  try {
    const result = JSON.parse(stdout);
    return { parsed: true, stats: result.stats ?? null };
  } catch {
    return { parsed: false, stats: null };
  }
}

async function inspectLocalChromium() {
  const descriptor = {
    source: "system-installed-chromium",
    distribution: "System-installed Chromium launched through the explicit executablePath in playwright.config.ts; not Playwright-managed.",
    configuredExecutablePath: executablePath,
    realExecutablePath: existsSync(executablePath) ? realpathSync(executablePath) : null,
    executableVersion: commandVersion(executablePath, ["--version"]),
    launchOptions: { headless: true, executablePath, args: launchArgs },
  };
  if (!existsSync(executablePath)) {
    return { ...descriptor, status: "blocked-missing-local-executable", diagnostic: `Executable does not exist: ${executablePath}` };
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath, args: launchArgs });
    const browserVersion = browser.version();
    const entries = [];
    for (const project of projects) {
      const context = await browser.newContext(project === "mobile-chrome" ? devices["Pixel 7"] : undefined);
      const page = await context.newPage();
      entries.push({
        project,
        browserName: "chromium",
        browserVersion,
        userAgent: await page.evaluate(() => navigator.userAgent),
        deviceEmulation: project === "mobile-chrome" ? "Pixel 7" : null,
      });
      await context.close();
    }
    return { ...descriptor, status: "available", browserVersion, projects: entries };
  } catch (error) {
    return { ...descriptor, status: "failed-local-launch", diagnostic: error instanceof Error ? error.message : String(error) };
  } finally {
    await browser?.close();
  }
}

const options = parseArguments(process.argv.slice(2));
ensureNewOutput(options.output);
const playwright = join(root, "node_modules", ".bin", "playwright");
const browser = await inspectLocalChromium();
const command = [
  "test",
  "--config", "playwright.config.ts",
  "--reporter=json",
  "--output", join(options.output, "test-results"),
  ...projects.flatMap((project) => ["--project", project]),
];
const metadata = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  workflow: "local-system-chromium-diagnostic",
  gitCommit: commandVersion("git", ["rev-parse", "HEAD"]),
  node: process.version,
  npm: commandVersion("npm", ["--version"]),
  playwright: JSON.parse(readFileSync(join(root, "node_modules", "@playwright", "test", "package.json"), "utf8")).version,
  operatingSystem: { platform: process.platform, arch: process.arch, release: release() },
  projects,
  browser,
  command: [playwright, ...command],
};
writeFileSync(join(options.output, "environment.json"), `${JSON.stringify(metadata, null, 2)}\n`);

const result = spawnSync(playwright, command, { cwd: root, env: { ...process.env }, encoding: "utf8" });
if (result.error) throw result.error;
writeFileSync(join(options.output, "playwright-results.json"), result.stdout ?? "");
writeFileSync(join(options.output, "playwright-stderr.log"), result.stderr ?? "");
const summary = {
  ...metadata,
  status: result.status === 0 && browser.status === "available" ? "verified-local-diagnostic" : "failed",
  exitCode: result.status,
  testResult: testResultSummary(result.stdout ?? ""),
  artifacts: {
    environment: "environment.json",
    playwrightResults: "playwright-results.json",
    stderr: "playwright-stderr.log",
    testResultsDirectory: "test-results",
  },
  artifactHashes: artifactHashes(options.output),
};
writeFileSync(join(options.output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (result.status !== 0) process.exitCode = result.status ?? 1;

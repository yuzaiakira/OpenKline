import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, firefox, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectNames = new Set(["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"]);
const defaultProjects = [...projectNames];

function parseArguments(argv) {
  let output = null;
  let projects = defaultProjects;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") output = argv[++index] ?? null;
    else if (argument.startsWith("--output=")) output = argument.slice("--output=".length);
    else if (argument === "--projects") projects = (argv[++index] ?? "").split(",").filter(Boolean);
    else if (argument.startsWith("--projects=")) projects = argument.slice("--projects=".length).split(",").filter(Boolean);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (projects.length === 0 || projects.some((project) => !projectNames.has(project))) {
    throw new Error(`Projects must be a comma-separated subset of: ${[...projectNames].join(", ")}`);
  }
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return {
    projects,
    output: resolve(root, output ?? join("artifacts", "browser-verification", stamp)),
  };
}

function ensureNewOutput(directory) {
  const artifactsRoot = resolve(root, "artifacts");
  if (!directory.startsWith(`${artifactsRoot}/`)) {
    throw new Error("Browser verification output must be below the repository artifacts directory");
  }
  if (existsSync(directory)) throw new Error(`Refusing to overwrite existing browser verification output: ${directory}`);
  mkdirSync(directory, { recursive: true });
}

function commandVersion(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function executableMetadata() {
  return {
    chromium: chromium.executablePath(),
    firefox: firefox.executablePath(),
    webkit: webkit.executablePath(),
  };
}

const browserProjects = {
  chromium: { browser: chromium, browserName: "chromium", device: null },
  firefox: { browser: firefox, browserName: "firefox", device: null },
  webkit: { browser: webkit, browserName: "webkit", device: null },
  "mobile-chrome": { browser: chromium, browserName: "chromium", device: devices["Pixel 7"] },
  "mobile-safari": { browser: webkit, browserName: "webkit", device: devices["iPhone 13"] },
};

async function inspectManagedBrowser(project) {
  const definition = browserProjects[project];
  const executablePath = definition.browser.executablePath();
  const descriptor = {
    project,
    browserName: definition.browserName,
    distribution: "Playwright-managed",
    executablePath,
    launchOptions: { headless: true },
    deviceEmulation: definition.device === null ? null : project,
  };
  if (!existsSync(executablePath)) {
    return {
      ...descriptor,
      status: "blocked-missing-managed-executable",
      diagnostic: `Executable does not exist: ${executablePath}`,
    };
  }
  let browser;
  let context;
  try {
    browser = await definition.browser.launch({ headless: true });
    context = await browser.newContext(definition.device ?? undefined);
    const page = await context.newPage();
    return {
      ...descriptor,
      status: "available",
      browserVersion: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
    };
  } catch (error) {
    return {
      ...descriptor,
      status: "failed-managed-launch",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context?.close();
    await browser?.close();
  }
}

function testResultSummary(stdout) {
  try {
    const result = JSON.parse(stdout);
    return { parsed: true, stats: result.stats ?? null };
  } catch {
    return { parsed: false, stats: null };
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

function classify(result, browsers) {
  if (result.status === 0 && browsers.every((browser) => browser.status === "available")) return "verified";
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return browsers.some((browser) => browser.status === "blocked-missing-managed-executable")
    || /Executable doesn't exist|Please run the following command to download new browsers/.test(combined)
    ? "blocked-missing-official-browser"
    : "failed";
}

const options = parseArguments(process.argv.slice(2));
ensureNewOutput(options.output);
const browserOutput = join(options.output, "test-results");
const playwright = join(root, "node_modules", ".bin", "playwright");
const browsers = await Promise.all(options.projects.map(inspectManagedBrowser));
const command = [
  "test",
  "--config", "playwright.portable.config.ts",
  "--reporter=json",
  "--output", browserOutput,
  ...options.projects.flatMap((project) => ["--project", project]),
];
const metadata = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  gitCommit: commandVersion("git", ["rev-parse", "HEAD"]),
  node: process.version,
  npm: commandVersion("npm", ["--version"]),
  playwright: JSON.parse(readFileSync(join(root, "node_modules", "@playwright", "test", "package.json"), "utf8")).version,
  operatingSystem: { platform: process.platform, arch: process.arch, release: release() },
  projects: options.projects,
  executablePaths: executableMetadata(),
  browsers,
  browserBinaryPolicy: "Playwright-managed binaries only; no system-browser override is accepted by this workflow.",
  command: [playwright, ...command],
};
writeFileSync(join(options.output, "environment.json"), `${JSON.stringify(metadata, null, 2)}\n`);

const result = spawnSync(playwright, command, {
  cwd: root,
  env: { ...process.env },
  encoding: "utf8",
});
if (result.error) throw result.error;
writeFileSync(join(options.output, "playwright-results.json"), result.stdout ?? "");
writeFileSync(join(options.output, "playwright-stderr.log"), result.stderr ?? "");
const summary = {
  ...metadata,
  status: classify(result, browsers),
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

import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  assertInstalledPackage,
  classifyNpmInstallFailure,
  ConsumerPreviewError,
  missingOfflineArtifacts,
  packageLockEntry,
  readInstalledManifest,
  selectPackedArchive,
} from "./consumer-preview-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(tmpdir(), "openkline-consumer-preview-"));
const offline = process.env.OPENKLINE_CONSUMER_PREVIEW_OFFLINE !== "0";
const cache = process.env.OPENKLINE_CONSUMER_PREVIEW_CACHE ?? "/tmp/openkline-npm-cache";
const env = {
  ...process.env,
  NPM_CONFIG_CACHE: cache,
  NEXT_TELEMETRY_DISABLED: "1",
};
const rootLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const exampleLock = JSON.parse(readFileSync(join(root, "examples/nextjs-app-router/package-lock.json"), "utf8"));
const coreExpected = { name: "openkline", version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version };
const reactExpected = {
  name: "@openkline/react",
  version: JSON.parse(readFileSync(join(root, "packages/react/package.json"), "utf8")).version,
  peerDependencies: { openkline: "^0.1.0", react: ">=18" },
};

function lockSpec(lock, name) {
  const entry = packageLockEntry(lock, name);
  return `${name}@${entry.version}`;
}

function lockEntries(lock, names) {
  return names.map((name) => packageLockEntry(lock, name));
}

function npmCacheEntries() {
  const result = spawnSync("npm", ["cache", "ls", "--parseable"], { env, encoding: "utf8" });
  return result.status === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function pack(cwd, expected, label) {
  const packDirectory = join(directory, `archive-${label}`);
  mkdirSync(packDirectory, { recursive: true });
  const output = execFileSync("npm", ["pack", "--json", "--pack-destination", packDirectory, "--ignore-scripts"], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const packed = JSON.parse(output);
  if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0]?.filename !== "string") {
    throw new ConsumerPreviewError(`npm pack produced an ambiguous result for ${expected.name}`, {
      code: "AMBIGUOUS_LOCAL_ARCHIVE",
      details: { cwd, output },
    });
  }
  const selected = selectPackedArchive(packDirectory, expected);
  if (basename(selected.archive) !== basename(packed[0].filename)) {
    throw new ConsumerPreviewError(`npm pack output did not match the selected archive for ${expected.name}`, {
      code: "PACKED_METADATA_MISMATCH",
      details: { npmPack: packed[0].filename, selected: selected.archive },
    });
  }
  return selected;
}

function runNpmInstall(cwd, args, { lock = rootLock, registryPackages = [] } = {}) {
  const command = ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...args];
  if (offline) command.splice(4, 0, "--offline");
  const result = spawnSync("npm", command, { cwd, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.status === 0) return;

  const cacheEntries = npmCacheEntries();
  const missingArtifacts = offline
    ? missingOfflineArtifacts({ cacheEntries, lock, packages: registryPackages })
    : [];
  const classification = classifyNpmInstallFailure({ output, offline, missingArtifacts });
  const excerpt = output.length > 12_000 ? `${output.slice(-12_000)}\n[output truncated]` : output;
  console.error(excerpt);
  throw new ConsumerPreviewError(`Independent consumer npm install ${classification.status.toLowerCase()}: ${classification.reason}`, {
    code: classification.code,
    status: classification.status,
    details: {
      command: ["npm", ...command],
      cache,
      offline,
      npmExitCode: result.status,
      classification: classification.details,
      output: excerpt,
    },
  });
}

function writeVanillaFixture() {
  writeFileSync(join(directory, "vanilla.mjs"), `
    import { InMemoryDatafeed, compileKlineScript } from "openkline";
    const candles = [
      { time: 1_700_000_000_000, open: 100, high: 103, low: 99, close: 102, volume: 10 },
      { time: 1_700_000_060_000, open: 102, high: 105, low: 101, close: 104, volume: 12 },
    ];
    const feed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }, candles);
    const historical = await feed.getBars({ symbol: "TEST", timeframe: "1m", from: candles[0].time, to: candles.at(-1).time + 1 });
    if (historical.length !== candles.length) throw new Error("installed core datafeed failed");
    const updates = [];
    const unsubscribe = feed.subscribeBars({ symbol: "TEST", timeframe: "1m", onBar: (bar) => updates.push(bar) });
    feed.pushBar({ time: 1_700_000_120_000, open: 104, high: 106, low: 103, close: 105, volume: 14 });
    unsubscribe();
    if (updates.length !== 1) throw new Error("installed core stream failed");
    const compiled = compileKlineScript('indicator("Consumer")\\nplot(close)');
    if (!compiled.success || compiled.program.execute(candles).outputs[0]?.points.length !== 2) throw new Error("installed compiler failed");
    console.log(JSON.stringify({ status: "pass", consumer: "vanilla-esm", core: "installed-package" }));
  `);
}

function writeTypeScriptFixture() {
  writeFileSync(join(directory, "consumer.tsx"), `
    import { createElement } from "react";
    import { FinancialChart, type FinancialChartProps } from "@openkline/react";
    import { compileKlineScript, type Candle } from "openkline";
    const candles: Candle[] = [{ time: 1, open: 1, high: 2, low: 0, close: 1, volume: 3 }];
    const program = compileKlineScript('indicator("Consumer")\\nplot(close)');
    const props: FinancialChartProps = { candles, scriptIndicators: program.success ? [{ program: program.program }] : [] };
    createElement(FinancialChart, props);
  `);
  execFileSync(join(directory, "node_modules/.bin/tsc"), [
    "--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--jsx", "react-jsx", "--skipLibCheck", "consumer.tsx",
  ], { cwd: directory, env, stdio: "inherit" });
}

function writeSsrFixture() {
  writeFileSync(join(directory, "react-ssr.mjs"), `
    import { createElement } from "react";
    import { renderToString } from "react-dom/server";
    import { FinancialChart } from "@openkline/react";
    const markup = renderToString(createElement(FinancialChart, { candles: [{ time: 1, open: 1, high: 2, low: 0, close: 1 }], width: 640, height: 360 }));
    if (!markup.includes("div")) throw new Error("installed React SSR consumer failed");
    console.log(JSON.stringify({ status: "pass", consumer: "react-ssr", source: "installed-package" }));
  `);
  execFileSync(process.execPath, ["react-ssr.mjs"], { cwd: directory, env, stdio: "inherit" });
}

function writeNextFixture(nextDirectory) {
  mkdirSync(join(nextDirectory, "app"), { recursive: true });
  writeFileSync(join(nextDirectory, "package.json"), JSON.stringify({
    name: "openkline-installed-next-consumer",
    private: true,
    scripts: { build: "next build --webpack" },
  }, null, 2));
  writeFileSync(join(nextDirectory, "next.config.mjs"), `import { resolve } from "node:path";\nexport default { transpilePackages: ["openkline", "@openkline/react"], outputFileTracingRoot: resolve(process.cwd()) };\n`);
  writeFileSync(join(nextDirectory, "app", "layout.tsx"), `export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html><body>{children}</body></html>; }\n`);
  writeFileSync(join(nextDirectory, "app", "page.tsx"), `"use client";\nimport { FinancialChart } from "@openkline/react";\nimport { compileKlineScript } from "openkline";\nconst compiled = compileKlineScript('indicator("Next")\\nplot(close)');\nexport default function Page() { return <FinancialChart width={640} height={360} candles={[{ time: 1, open: 1, high: 2, low: 0, close: 1, volume: 2 }]} scriptIndicators={compiled.success ? [{ program: compiled.program }] : []} />; }\n`);
}

function startStaticServer() {
  const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const target = resolve(directory, `.${pathname === "/" ? "/browser.html" : pathname}`);
    if (!target.startsWith(`${resolve(directory)}/`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = readFileSync(target);
      response.writeHead(200, { "content-type": mime[extname(target)] ?? "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Unable to bind consumer browser server");
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/browser.html` });
    });
  });
}

async function verifyBrowserConsumer() {
  const manifest = readInstalledManifest(directory, "openkline");
  const entry = manifest.exports?.["."]?.import;
  if (typeof entry !== "string" || !entry.startsWith("./")) throw new Error("Installed core package has no public ESM browser entry");
  writeFileSync(join(directory, "browser.html"), `<!doctype html><html><body><div id="chart" style="width:800px;height:420px"></div><script type="importmap">${JSON.stringify({ imports: { openkline: `./node_modules/openkline/${entry.slice(2)}` } })}</script><script type="module" src="./browser.mjs"></script></body></html>`);
  writeFileSync(join(directory, "browser.mjs"), `
    import { InMemoryDatafeed, createChart } from "openkline";
    const base = 1_700_000_000_000;
    const candles = Array.from({ length: 8 }, (_, index) => ({ time: base + index * 60_000, open: 100 + index, high: 103 + index, low: 99 + index, close: 102 + index, volume: 10 + index }));
    const feed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }, candles);
    const chart = createChart(document.querySelector("#chart"), { width: 800, height: 420, theme: "dark" });
    await chart.setDatafeed(feed, { symbol: "TEST", timeframe: "1m", from: candles[0].time, to: candles.at(-1).time + 1 });
    const line = chart.addLineSeries({ id: "consumer-line" });
    line.setData(candles.map(({ time, close }) => ({ time, value: close })));
    const area = chart.addAreaSeries({ id: "consumer-area" });
    area.setData(candles.map(({ time, low }) => ({ time, value: low })));
    const canvas = document.querySelector("canvas");
    if (!canvas || document.querySelectorAll("canvas").length < 1) throw new Error("installed browser chart did not render");
    canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 300, clientY: 180 }));
    canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -40, clientX: 300, clientY: 180 }));
    chart.destroy();
    globalThis.__openklineConsumerBrowser = { status: "pass", canvasAfterDestroy: document.querySelectorAll("canvas").length, source: "installed-package" };
  `);
  const served = await startStaticServer();
  let browser;
  try {
    const executablePath = process.env.OPENKLINE_CHROMIUM_EXECUTABLE_PATH;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath === undefined ? {} : { executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] }),
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(served.url);
    await page.waitForFunction(() => globalThis.__openklineConsumerBrowser?.status === "pass");
    const result = await page.evaluate(() => globalThis.__openklineConsumerBrowser);
    if (errors.length > 0) throw new Error(`Installed browser consumer errors: ${errors.join("; ")}`);
    if (result.canvasAfterDestroy !== 0) throw new Error("installed browser consumer leaked a canvas");
    return { ...result, browserVersion: browser.version(), browserSource: executablePath ?? "Playwright-managed" };
  } catch (error) {
    if (error instanceof Error && /Executable doesn't exist|browserType\.launch|Failed to launch/i.test(error.message)) {
      throw new ConsumerPreviewError(`Browser consumer is blocked by the available Playwright executable: ${error.message}`, {
        code: "BROWSER_UNAVAILABLE",
        status: "BLOCKED",
        details: { browser: "chromium", message: error.message },
      });
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => served.server.close(resolveClose));
  }
}

async function main() {
  const core = pack(root, coreExpected, "core");
  const react = pack(join(root, "packages/react"), reactExpected, "react");
  const registryPackages = ["react", "react-dom", "@types/react", "@types/react-dom", "typescript", "scheduler", "csstype", "@types/node", "undici-types"];
  const basePackageSpecs = [core.archive, react.archive, ...registryPackages.map((name) => lockSpec(rootLock, name))];
  execFileSync("npm", ["init", "--yes"], { cwd: directory, env, stdio: "ignore" });
  runNpmInstall(directory, basePackageSpecs, { lock: rootLock, registryPackages });
  for (const expected of [coreExpected, reactExpected, ...lockEntries(rootLock, registryPackages)]) assertInstalledPackage(directory, expected);

  writeVanillaFixture();
  execFileSync(process.execPath, ["vanilla.mjs"], { cwd: directory, env, stdio: "inherit" });
  writeTypeScriptFixture();
  writeSsrFixture();

  const nextDirectory = join(directory, "next-consumer");
  writeNextFixture(nextDirectory);
  const nextPackageNames = ["next", "react", "react-dom", "typescript", "@types/node", "@types/react", "@types/react-dom"];
  runNpmInstall(nextDirectory, [core.archive, react.archive, ...nextPackageNames.map((name) => lockSpec(name === "next" ? exampleLock : rootLock, name))], {
    lock: exampleLock,
    registryPackages: nextPackageNames,
  });
  for (const expected of [coreExpected, reactExpected, ...lockEntries(rootLock, nextPackageNames.slice(1)), packageLockEntry(exampleLock, "next")]) assertInstalledPackage(nextDirectory, expected);
  execFileSync("npm", ["run", "build"], { cwd: nextDirectory, env, stdio: "inherit" });

  const browser = await verifyBrowserConsumer();
  console.log(JSON.stringify({
    status: "pass",
    offline,
    cache,
    packages: {
      core: { ...coreExpected, archive: basename(core.archive) },
      react: { ...reactExpected, archive: basename(react.archive) },
      reactVersion: packageLockEntry(rootLock, "react").version,
      reactDomVersion: packageLockEntry(rootLock, "react-dom").version,
      typescriptVersion: packageLockEntry(rootLock, "typescript").version,
    },
    consumers: ["vanilla-esm", "typescript", "react-ssr", "nextjs-app-router", "browser-chart"],
    browser,
  }, null, 2));
}

try {
  await main();
} catch (error) {
  if (error instanceof ConsumerPreviewError) {
    console.error(JSON.stringify({
      status: error.status.toLowerCase(),
      code: error.code,
      message: error.message,
      ...error.details,
      node: process.version,
      npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
    }, null, 2));
    process.exitCode = error.exitCode;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

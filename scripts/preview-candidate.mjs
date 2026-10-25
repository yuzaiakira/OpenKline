import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = "/tmp/openkline-npm-cache";
const defaultVersion = "0.1.0-alpha.1";

function parseArguments(argv) {
  const [command = "verify", ...arguments_] = argv;
  if (command !== "prepare" && command !== "verify") throw new Error("Usage: preview-candidate.mjs <prepare|verify> [--output <directory>] [--version <semver>]");
  let output = null;
  let version = defaultVersion;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") output = arguments_[++index] ?? null;
    else if (argument.startsWith("--output=")) output = argument.slice("--output=".length);
    else if (argument === "--version") version = arguments_[++index] ?? "";
    else if (argument.startsWith("--version=")) version = argument.slice("--version=".length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/.test(version)) throw new Error(`A prerelease semantic version is required: ${version}`);
  return { command, output, version };
}

function command(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, NPM_CONFIG_CACHE: cache, NEXT_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
    ...options,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function lockedVersion(lock, name) {
  const version = lock.packages?.[`node_modules/${name}`]?.version;
  if (version === undefined) throw new Error(`No locked version for ${name}`);
  return `${name}@${version}`;
}

function packCandidate({ source, stage, output, version, isReact }) {
  const sourceManifest = readJson(join(source, "package.json"));
  const manifest = {
    ...sourceManifest,
    version,
    ...(isReact ? { peerDependencies: { ...sourceManifest.peerDependencies, openkline: version } } : {}),
  };
  mkdirSync(stage, { recursive: true });
  cpSync(join(source, "dist"), join(stage, "dist"), { recursive: true });
  if (!isReact) cpSync(join(source, "README.md"), join(stage, "README.md"));
  writeJson(join(stage, "package.json"), manifest);
  const packed = JSON.parse(command("npm", ["pack", "--json", "--pack-destination", output, "--ignore-scripts"], stage));
  if (!Array.isArray(packed) || packed.length !== 1) throw new Error(`Unexpected npm pack output for ${sourceManifest.name}`);
  const result = packed[0];
  const tarball = join(output, result.filename);
  return {
    name: manifest.name,
    sourceVersion: sourceManifest.version,
    candidateVersion: manifest.version,
    peerDependencies: manifest.peerDependencies ?? {},
    filename: result.filename,
    sha256: sha256(tarball),
    size: result.size,
    unpackedSize: result.unpackedSize,
    files: result.files.map((file) => file.path),
  };
}

function prepareCandidate(output, version) {
  if (existsSync(output)) throw new Error(`Refusing to overwrite existing candidate output: ${output}`);
  mkdirSync(output, { recursive: true });
  const staging = mkdtempSync(join(tmpdir(), "openkline-preview-stage-"));
  try {
    const core = packCandidate({
      source: root,
      stage: join(staging, "openkline"),
      output,
      version,
      isReact: false,
    });
    const react = packCandidate({
      source: join(root, "packages", "react"),
      stage: join(staging, "react"),
      output,
      version,
      isReact: true,
    });
    const manifest = {
      schemaVersion: 1,
      candidateVersion: version,
      generatedAt: new Date().toISOString(),
      gitCommit: command("git", ["rev-parse", "HEAD"], root).trim(),
      node: process.version,
      npm: command("npm", ["--version"], root).trim(),
      licenseStatus: "pending-owner-approval; local review artifact only; do not publish or redistribute",
      packages: [core, react],
    };
    writeJson(join(output, "manifest.json"), manifest);
    return manifest;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function requireCandidate(manifest, directory, name) {
  const entry = manifest.packages.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Candidate manifest has no ${name} package`);
  const archive = join(directory, entry.filename);
  if (!existsSync(archive) || sha256(archive) !== entry.sha256) throw new Error(`Candidate archive integrity mismatch: ${entry.filename}`);
  return archive;
}

function writeVanillaFixture(directory) {
  writeFileSync(join(directory, "vanilla.mjs"), `
    import {
      DrawingEngine,
      InMemoryDatafeed,
      PluginRegistry,
      compileKlineScript,
      createDefaultIndicatorRegistry,
    } from "openkline";
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const candles = [
      { time: 1_700_000_000_000, open: 100, high: 103, low: 99, close: 102, volume: 10 },
      { time: 1_700_000_060_000, open: 102, high: 105, low: 101, close: 104, volume: 12 },
      { time: 1_700_000_120_000, open: 104, high: 106, low: 103, close: 105, volume: 14 },
    ];
    const datafeed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }, candles);
    const historical = await datafeed.getBars({ symbol: "TEST", timeframe: "1m", from: candles[0].time, to: candles.at(-1).time + 1 });
    const updates = [];
    const unsubscribe = datafeed.subscribeBars({ symbol: "TEST", timeframe: "1m", onBar: (bar) => updates.push(bar) });
    datafeed.pushBar({ time: 1_700_000_180_000, open: 105, high: 108, low: 104, close: 107, volume: 15 });
    unsubscribe();
    assert(historical.length === 3 && updates.length === 1, "datafeed history or streaming failed");

    const indicators = createDefaultIndicatorRegistry();
    const rsi = indicators.create("RSI", { period: 2 });
    rsi.setInput([...historical, updates[0]]);
    assert(rsi.getResult().outputs[0].points.length === 4, "indicator lifecycle failed");
    rsi.dispose();

    const drawings = new DrawingEngine();
    const trend = drawings.create("trend-line", { points: [{ time: candles[0].time, price: 99 }, { time: candles[2].time, price: 106 }], style: { color: "#f59e0b" } });
    const drawingDocument = drawings.serialize();
    drawings.restore(drawingDocument);
    assert(trend.getSnapshot().type === "trend-line" && drawings.getAll().length === 1, "drawing lifecycle failed");
    drawings.dispose();

    const pluginRegistry = new PluginRegistry({
      registerIndicator: () => () => undefined,
      registerDrawingTool: () => () => undefined,
      registerOverlay: () => () => undefined,
      subscribe: () => () => undefined,
    });
    const plugin = pluginRegistry.install({
      metadata: { id: "preview.consumer", name: "Preview Consumer", version: "1.0.0", apiVersion: 1 },
      setup(context) { context.state.set("ready", true); context.commands.register({ id: "preview.consumer.check", title: "Check", execute: () => "ok" }); },
    });
    assert(pluginRegistry.executeCommand("preview.consumer.check") === "ok", "plugin command failed");
    plugin.dispose();
    pluginRegistry.dispose();

    const compiled = compileKlineScript('indicator("Preview")\\nplot(close)');
    assert(compiled.success, "KlineScript compilation failed");
    const execution = compiled.program.execute(candles);
    assert(execution.outputs[0].points.length === 3, "KlineScript execution failed");
    console.log(JSON.stringify({ status: "pass", features: ["datafeed", "indicator", "drawing", "plugin", "klinescript"] }));
  `);
}

function writeTypeFixtures(directory) {
  writeFileSync(join(directory, "consumer.tsx"), `
    import { createElement } from "react";
    import { FinancialChart, type FinancialChartProps } from "@openkline/react";
    import { compileKlineScript, type Candle, type OpenKlinePlugin } from "openkline";
    const candles: Candle[] = [{ time: 1, open: 1, high: 2, low: 0, close: 1, volume: 3 }];
    const plugin: OpenKlinePlugin = { metadata: { id: "preview.types", name: "Types", version: "1.0.0", apiVersion: 1 }, setup: () => undefined };
    const program = compileKlineScript('indicator("Types")\\nplot(close)');
    const props: FinancialChartProps = { candles, plugins: [plugin], scriptIndicators: program.success ? [{ program: program.program }] : [], theme: "dark" };
    createElement(FinancialChart, props);
  `);
  writeFileSync(join(directory, "react-ssr.mjs"), `
    import { createElement } from "react";
    import { renderToString } from "react-dom/server";
    import { FinancialChart } from "@openkline/react";
    const markup = renderToString(createElement(FinancialChart, { candles: [{ time: 1, open: 1, high: 2, low: 0, close: 1 }], width: 640, height: 360 }));
    if (!markup.includes("div")) throw new Error("React SSR import failed");
  `);
}

function writeNextFixture(directory) {
  mkdirSync(join(directory, "app"), { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    private: true,
    scripts: { build: "next build --webpack" },
  }, null, 2));
  writeFileSync(join(directory, "next.config.mjs"), `import { resolve } from "node:path";\nexport default { transpilePackages: ["openkline", "@openkline/react"], outputFileTracingRoot: resolve(process.cwd()) };\n`);
  writeFileSync(join(directory, "app", "layout.tsx"), `export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html><body>{children}</body></html>; }\n`);
  writeFileSync(join(directory, "app", "page.tsx"), `"use client";\nimport { FinancialChart } from "@openkline/react";\nimport { compileKlineScript } from "openkline";\nconst compiled = compileKlineScript('indicator("Next")\\nplot(close)');\nexport default function Page() { return <FinancialChart width={640} height={360} candles={[{ time: 1, open: 1, high: 2, low: 0, close: 1, volume: 2 }]} scriptIndicators={compiled.success ? [{ program: compiled.program }] : []} />; }\n`);
}

function writeBrowserFixture(directory) {
  const coreManifest = readJson(join(directory, "node_modules", "openkline", "package.json"));
  const entry = coreManifest.exports?.["."]?.import;
  if (typeof entry !== "string" || !entry.startsWith("./")) throw new Error("Installed core package has no public ESM entry");
  writeFileSync(join(directory, "browser.html"), `<!doctype html><html><body><div id="chart" style="width: 800px; height: 520px"></div><script type="importmap">${JSON.stringify({ imports: { openkline: `./node_modules/openkline/${entry.slice(2)}` } })}</script><script type="module" src="./browser.mjs"></script></body></html>`);
  writeFileSync(join(directory, "browser.mjs"), `
    import { InMemoryDatafeed, compileKlineScript, createChart } from "openkline";
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const base = 1_700_000_000_000;
    const candles = Array.from({ length: 8 }, (_, index) => ({ time: base + index * 60_000, open: 100 + index, high: 103 + index, low: 99 + index, close: 102 + index, volume: 10 + index }));
    const feed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }, candles);
    const chart = createChart(document.querySelector("#chart"), { width: 800, height: 520, theme: "dark" });
    await chart.setDatafeed(feed, { symbol: "TEST", timeframe: "1m", from: candles[0].time, to: candles.at(-1).time + 1 });
    feed.pushBar({ time: base + 8 * 60_000, open: 108, high: 111, low: 107, close: 110, volume: 18 });
    const line = chart.addLineSeries({ id: "line", style: { color: "#f59e0b" } });
    line.setData(candles.map(({ time, close }) => ({ time, value: close })));
    const area = chart.addAreaSeries({ id: "area", style: { color: "#60a5fa", fillColor: "#60a5fa", fillOpacity: 0.2 } });
    area.setData(candles.map(({ time, low }) => ({ time, value: low })));
    const volume = chart.addVolumeSeries({ id: "volume" });
    volume.setData(candles.map(({ time, volume: value }) => ({ time, value })));
    const rsi = chart.addIndicator("RSI", { period: 2, pane: "new" });
    const band = chart.addIndicator("BOLLINGER_BANDS", { period: 2, standardDeviations: 1, pane: "main" });
    band.setOutputStyle("upper", { fillColor: "#a855f7", fillOpacity: 0.25 });
    const plugin = chart.installPlugin({
      metadata: { id: "preview.browser", name: "Preview Browser", version: "1.0.0", apiVersion: 1, hostVersionRange: "^0.1.0" },
      setup(context) {
        context.state.set("ready", true);
        context.indicators.register({
          metadata: { id: "PREVIEW_DOUBLE", name: "Preview Double", version: 1, description: "Preview custom indicator", parameters: [{ name: "multiplier", type: "number", required: true }], outputs: [{ id: "value", title: "Value", kind: "line" }] },
          validateParameters: (parameters) => ({ multiplier: Number(parameters.multiplier) }),
          calculate: (input, parameters) => ({ indicatorId: "PREVIEW_DOUBLE", parameters, outputs: [{ id: "value", title: "Value", kind: "line", points: input.map((candle) => ({ time: candle.time, value: candle.close * parameters.multiplier })) }] }),
        });
        context.drawings.register({ type: "preview-ray", minPoints: 2, maxPoints: 2, validate: (drawing) => { if (drawing.points.length !== 2) throw new Error("preview ray requires two points"); }, getGeometry: (drawing, converter) => [{ kind: "line", from: { x: converter.xForTime(drawing.points[0].time), y: converter.yForPrice(drawing.points[0].price) }, to: { x: converter.xForTime(drawing.points[1].time), y: converter.yForPrice(drawing.points[1].price) } }], hitTest: () => -1 });
        context.overlays.register({ id: "preview.overlay", title: "Preview overlay", render: () => [] });
        context.commands.register({ id: "preview.browser.check", title: "Check", execute: () => "ok" });
      },
    });
    const custom = chart.addIndicator("PREVIEW_DOUBLE", { multiplier: 2 });
    const drawing = chart.addDrawing("preview-ray", { points: [{ time: candles[1].time, price: candles[1].low }, { time: candles[5].time, price: candles[5].high }], style: { color: "#22c55e" } });
    const compiled = compileKlineScript('indicator("Preview Script")\\nplot(close)');
    assert(compiled.success, "script did not compile");
    const script = chart.addScriptIndicator(compiled.program, { pane: "new" });
    chart.setOptions({ theme: "light", pricePrecision: 3 });
    const workspace = chart.serializeWorkspace({ symbol: "TEST", timeframe: "1m" });
    const restored = chart.restoreWorkspace(workspace, { missingIndicators: "error", missingPlugins: "error" });
    assert(restored.skippedIndicators.length === 0 && restored.skippedPlugins.length === 0, "workspace restore skipped resources");
    assert(chart.getPaneIds().length >= 3, "oscillator panes missing");
    assert(chart.getSeriesIds().includes("line") && chart.getSeriesIds().includes("area") && chart.getSeriesIds().includes("volume"), "series missing");
    assert(chart.getPlugins()[0]?.id === "preview.browser" && chart.executeCommand("preview.browser.check") === "ok", "plugin failed");
    assert(chart.getDrawings().some((item) => item.id === drawing.id), "drawing restore failed");
    chart.destroy();
    assert(document.querySelectorAll("canvas").length === 0, "chart cleanup failed");
    globalThis.__openklinePreviewCandidate = { status: "pass", series: [line.id, area.id, volume.id], indicators: [rsi.id, band.id, custom.id, script.id], plugin: plugin.metadata.id };
  `);
}

function startStaticServer(directory) {
  const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".map": "application/json" };
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
      if (address === null || typeof address === "string") throw new Error("Unable to bind consumer fixture server");
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/browser.html` });
    });
  });
}

async function verifyCandidate(directory, manifest) {
  const rootLock = readJson(join(root, "package-lock.json"));
  const exampleLock = readJson(join(root, "examples", "nextjs-app-router", "package-lock.json"));
  const coreArchive = requireCandidate(manifest, directory, "openkline");
  const reactArchive = requireCandidate(manifest, directory, "@openkline/react");
  const fixture = mkdtempSync(join(tmpdir(), "openkline-preview-consumer-"));
  let server;
  let browser;
  try {
    command("npm", ["init", "--yes"], fixture, { stdio: "ignore" });
    command("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", coreArchive, reactArchive, lockedVersion(rootLock, "react"), lockedVersion(rootLock, "react-dom"), lockedVersion(rootLock, "@types/node"), lockedVersion(rootLock, "@types/react"), lockedVersion(rootLock, "@types/react-dom"), lockedVersion(rootLock, "typescript")], fixture, { stdio: "inherit" });
    writeVanillaFixture(fixture);
    writeTypeFixtures(fixture);
    command(process.execPath, ["vanilla.mjs"], fixture, { stdio: "inherit" });
    command(join(fixture, "node_modules", ".bin", "tsc"), ["--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--jsx", "react-jsx", "--skipLibCheck", "consumer.tsx"], fixture, { stdio: "inherit" });
    command(process.execPath, ["react-ssr.mjs"], fixture, { stdio: "inherit" });

    const nextFixture = join(fixture, "next-app");
    mkdirSync(nextFixture);
    writeNextFixture(nextFixture);
    command("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", coreArchive, reactArchive, lockedVersion(exampleLock, "next"), lockedVersion(rootLock, "react"), lockedVersion(rootLock, "react-dom"), lockedVersion(rootLock, "typescript"), lockedVersion(rootLock, "@types/node"), lockedVersion(rootLock, "@types/react"), lockedVersion(rootLock, "@types/react-dom")], nextFixture, { stdio: "inherit" });
    command("npm", ["run", "build"], nextFixture, { stdio: "inherit" });

    writeBrowserFixture(fixture);
    const served = await startStaticServer(fixture);
    server = served.server;
    const executablePath = process.env.OPENKLINE_CHROMIUM_EXECUTABLE_PATH;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath === undefined ? {} : { executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] }),
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(served.url);
    await page.waitForFunction(() => globalThis.__openklinePreviewCandidate?.status === "pass");
    const browserResult = await page.evaluate(() => globalThis.__openklinePreviewCandidate);
    if (errors.length > 0) throw new Error(`Packaged browser fixture errors: ${errors.join("; ")}`);
    return {
      status: "pass",
      consumers: ["vanilla-esm", "typescript", "react-ssr", "nextjs-app-router", "browser-chart"],
      browser: { source: executablePath === undefined ? "Playwright-managed" : "explicit-local-override", version: browser.version(), result: browserResult },
    };
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => server?.close(resolveClose) ?? resolveClose());
    rmSync(fixture, { recursive: true, force: true });
  }
}

const options = parseArguments(process.argv.slice(2));
if (options.command === "prepare") {
  const output = resolve(root, options.output ?? join("artifacts", "developer-preview", options.version));
  const artifactsRoot = resolve(root, "artifacts");
  if (!output.startsWith(`${artifactsRoot}/`)) throw new Error("Candidate output must be below the repository artifacts directory");
  const manifest = prepareCandidate(output, options.version);
  console.log(JSON.stringify({ status: "prepared", output, manifest }, null, 2));
} else {
  const temporary = mkdtempSync(join(tmpdir(), "openkline-preview-candidate-"));
  try {
    const manifest = prepareCandidate(join(temporary, "artifacts"), options.version);
    const verification = await verifyCandidate(join(temporary, "artifacts"), manifest);
    console.log(JSON.stringify({ candidateVersion: options.version, ...verification }, null, 2));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

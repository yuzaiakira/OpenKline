import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "openkline-891-pack-"));
const env = { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" };

function pack(cwd) {
  execFileSync("npm", ["pack", "--pack-destination", directory, "--ignore-scripts"], {
    cwd,
    env,
    stdio: "inherit",
  });
  const archive = readdirSync(directory).filter((entry) => entry.endsWith(".tgz")).at(-1);
  if (archive === undefined) throw new Error("npm pack produced no archive");
  return join(directory, archive);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
};

let server;
let browser;
try {
  const coreArchive = pack(root);
  execFileSync("npm", ["init", "--yes"], { cwd: directory, stdio: "ignore" });
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", coreArchive], {
    cwd: directory,
    env,
    stdio: "inherit",
  });

  writeFileSync(join(directory, "index.html"), `<!doctype html>
<html><body>
<div id="chart" style="width:640px;height:360px"></div>
<script type="module">
import { createChart, InMemoryDatafeed } from "./node_modules/openkline/dist/src/index.js";
const chart = createChart(document.querySelector("#chart"), { autoSize: false, width: 640, height: 360, theme: "dark" });
const make = (n, start, base) => Array.from({ length: n }, (_, i) => {
  const close = base + i;
  return { time: start + i * 60000, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 10 + i };
});
const a = make(20, Date.UTC(2026, 0, 1), 100);
const b = make(12, Date.UTC(2026, 1, 1), 300);
const feedA = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, a);
const feedB = new InMemoryDatafeed({ symbol: "BBB", timezone: "UTC", pricePrecision: 2 }, b);
await chart.setDatafeed(feedA, { symbol: "AAA", timeframe: "1m", from: a[0].time, to: a.at(-1).time + 60000 });
chart.addIndicator("SMA", { id: "pack-sma", period: 5 });
chart.addIndicator("RSI", { id: "pack-rsi", period: 5, pane: "new" });
const before = {
  indicators: chart.serializeWorkspace().indicators.map((item) => item.id).sort(),
  series: chart.getSeriesIds(),
};
await chart.setDatafeed(feedB, { symbol: "BBB", timeframe: "1m", from: b[0].time, to: b.at(-1).time + 60000 });
const after = {
  indicators: chart.serializeWorkspace().indicators.map((item) => item.id),
  series: chart.getSeriesIds(),
  closes: chart.getData().map((candle) => candle.close),
};
chart.addIndicator("SMA", { id: "pack-sma", period: 5 });
const readd = {
  indicators: chart.serializeWorkspace().indicators.map((item) => item.id),
  series: chart.getSeriesIds(),
};
chart.destroy();
globalThis.__packResult = { before, after, readd, canvases: document.querySelectorAll("canvas").length };
</script>
</body></html>`);

  server = createServer((req, res) => {
    let url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    if (url === "/") url = "/index.html";
    const path = join(directory, url);
    if (!path.startsWith(directory) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404);
      res.end(`missing ${url}`);
      return;
    }
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(readFileSync(path));
  });
  await new Promise((resolve) => server.listen(4189, "127.0.0.1", resolve));

  browser = await chromium.launch({
    headless: true,
    // Host Chromium is used for this packed-consumer smoke only; official
    // five-browser acceptance remains Docker-managed Playwright binaries.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:4189/");
  await page.waitForFunction(() => Boolean(globalThis.__packResult));
  const result = await page.evaluate(() => globalThis.__packResult);
  if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join("; ")}`);
  if (JSON.stringify(result.before.indicators) !== JSON.stringify(["pack-rsi", "pack-sma"])) {
    throw new Error(`unexpected before indicators: ${JSON.stringify(result.before.indicators)}`);
  }
  if (!result.before.series.some((id) => id.startsWith("pack-sma:")) || !result.before.series.some((id) => id.startsWith("pack-rsi:"))) {
    throw new Error("packed consumer missing indicator series before switch");
  }
  if (result.after.indicators.length !== 0) throw new Error("indicators were not cleared after setDatafeed");
  if (result.after.series.some((id) => id.startsWith("pack-"))) throw new Error("orphaned indicator series after setDatafeed");
  if (JSON.stringify(result.after.closes) !== JSON.stringify(Array.from({ length: 12 }, (_, index) => 300 + index))) {
    throw new Error(`unexpected closes after switch: ${JSON.stringify(result.after.closes)}`);
  }
  if (!result.readd.indicators.includes("pack-sma") || !result.readd.series.some((id) => id.startsWith("pack-sma:"))) {
    throw new Error("failed to re-add indicator id after setDatafeed");
  }
  if (result.canvases !== 0) throw new Error(`expected 0 canvases after destroy, got ${result.canvases}`);
  console.log(JSON.stringify({ status: "pass", consumer: "packed-openkline-tarball", result }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "openkline-package-smoke-"));

try {
  execFileSync("npm", ["pack", "--pack-destination", directory, "--ignore-scripts"], {
    cwd: root,
    env: { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" },
    stdio: "inherit",
  });
  const archive = readdirSync(directory).find((entry) => entry.endsWith(".tgz"));
  if (archive === undefined) throw new Error("npm pack did not produce an archive");

  execFileSync("npm", ["init", "--yes"], { cwd: directory, stdio: "ignore" });
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", join(directory, archive)], {
    cwd: directory,
    env: { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" },
    stdio: "inherit",
  });
  execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    "import { Chart, createChart, RestDatafeed, WebSocketDatafeed, compileKlineScript, createPortfolioBacktestWorkerHandler } from 'openkline'; const script = compileKlineScript('indicator(\"Smoke\")\\nplot(close)'); const responses = []; const handler = createPortfolioBacktestWorkerHandler((response) => responses.push(response)); handler({ protocol: 1, type: 'run', requestId: 'package-worker-smoke', generation: 0, options: { accountCurrency: 'USD', initialCapital: 100, instruments: [{ id: 'smoke', symbol: 'SMOKE', quoteCurrency: 'USD', timeframe: '1m', candles: [{ time: 1_800_000_000_000, open: 1, high: 2, low: 1, close: 1 }], strategy: { strategy: 'EMA_TREND', parameters: { period: 1 } } }], positionSizing: { type: 'fixed-quantity', quantity: 1 }, commission: { type: 'percent', value: 0 }, slippage: { type: 'percent', value: 0 } } }); const workerComplete = responses.some((response) => response.type === 'complete'); if (!Chart || !createChart || !RestDatafeed || !WebSocketDatafeed || !script.success || script.program.execute([{ time: 1, open: 1, high: 2, low: 0, close: 1 }]).outputs[0]?.points[0]?.value !== 1 || !workerComplete || 'executeKlineScript' in await import('openkline')) process.exit(1);",
  ], { cwd: directory, stdio: "inherit" });
  console.log(JSON.stringify({ package: "openkline", installedFrom: archive, consumer: "ESM" }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

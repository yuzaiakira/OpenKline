import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "openkline-consumer-preview-"));
const env = { ...process.env, NPM_CONFIG_CACHE: "/tmp/openkline-npm-cache" };
const rootLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

function locked(name) {
  const version = rootLock.packages?.[`node_modules/${name}`]?.version;
  if (version === undefined) throw new Error(`No locked version for ${name}`);
  return `${name}@${version}`;
}

function pack(cwd) {
  execFileSync("npm", ["pack", "--pack-destination", directory, "--ignore-scripts"], {
    cwd,
    env,
    stdio: "inherit",
  });
  const archives = readdirSync(directory).filter((entry) => entry.endsWith(".tgz"));
  const archive = archives.at(-1);
  if (archive === undefined) throw new Error(`npm pack produced no archive for ${cwd}`);
  return join(directory, archive);
}

try {
  const coreArchive = pack(root);
  const reactArchive = pack(join(root, "packages/react"));
  execFileSync("npm", ["init", "--yes"], { cwd: directory, stdio: "ignore" });
  execFileSync("npm", [
    "install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline",
    coreArchive, reactArchive, locked("react"), locked("react-dom"), locked("@types/react"), locked("@types/react-dom"), locked("typescript"),
  ], { cwd: directory, env, stdio: "inherit" });

  writeFileSync(join(directory, "vanilla.mjs"), `
    import { Chart, RestDatafeed, compileKlineScript } from "openkline";
    if (typeof Chart !== "function" || typeof RestDatafeed !== "function") throw new Error("missing core exports");
    const compiled = compileKlineScript('indicator("Consumer")\\nplot(close)');
    if (!compiled.success) throw new Error("public compiler failed");
  `);
  execFileSync(process.execPath, ["vanilla.mjs"], { cwd: directory, stdio: "inherit" });

  writeFileSync(join(directory, "consumer.tsx"), `
    import { createElement } from "react";
    import { FinancialChart, type FinancialChartProps } from "@openkline/react";
    import { compileKlineScript, type Candle } from "openkline";
    const candles: Candle[] = [{ time: 1, open: 1, high: 2, low: 0, close: 1, volume: 3 }];
    const program = compileKlineScript('indicator("Consumer")\\nplot(close)');
    const props: FinancialChartProps = { candles, scriptIndicators: program.success ? [{ program: program.program }] : [] };
    createElement(FinancialChart, props);
  `);
  execFileSync(join(directory, "node_modules/.bin/tsc"), ["--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--jsx", "react-jsx", "--skipLibCheck", "consumer.tsx"], {
    cwd: directory,
    env,
    stdio: "inherit",
  });
  console.log(JSON.stringify({ status: "pass", consumers: ["vanilla-esm", "typescript-react"] }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

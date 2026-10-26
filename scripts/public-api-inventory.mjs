import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = process.cwd();

function normalize(value) {
  return value.replace(/\/\/#[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function namesFromBlock(block) {
  return block
    .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
    .split(",")
    .map((item) => item.trim().split(/\s+as\s+/)[0]?.trim())
    .filter((item) => item !== undefined && /^[A-Za-z_$][\w$]*$/.test(item));
}

function parseReexports(text) {
  const entries = [];
  const pattern = /export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];/g;
  for (const match of text.matchAll(pattern)) {
    const names = namesFromBlock(match[2] ?? "");
    for (const name of names) entries.push({ name, kind: match[1] === "type " ? "type" : "runtime", module: match[3] });
  }
  return entries;
}

function findDeclaration(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(class|interface|type|function|const|let|var|enum)\\s+${escaped}\\b`);
  const match = pattern.exec(text);
  if (match === null || match.index === undefined) return `re-export:${name}`;
  const start = match.index;
  const bodyStart = text.indexOf("{", start);
  const semicolon = text.indexOf(";", start);
  if (bodyStart === -1 || (semicolon !== -1 && semicolon < bodyStart)) {
    return text.slice(start, semicolon === -1 ? text.length : semicolon + 1);
  }
  let depth = 0;
  let quote = null;
  for (let index = bodyStart; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return text.slice(start);
}

function declarationEntry(entry, declarationText, packageName) {
  const signature = normalize(findDeclaration(declarationText, entry.name));
  return {
    package: packageName,
    name: entry.name,
    kind: entry.kind,
    module: entry.module,
    signatureHash: hash(signature),
  };
}

function inventoryPackage(packageName, declarationPath, sourceText, direct = false) {
  const declarations = readFileSync(join(root, declarationPath), "utf8");
  const entries = direct
    ? [...declarations.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)].map((match) => ({ name: match[1], kind: /interface|type/.test(match[0]) ? "type" : "runtime", module: "." }))
    : parseReexports(sourceText);
  return entries.map((entry) => declarationEntry(entry, direct ? declarations : readDeclarationModule(entry.module), packageName));
}

function readDeclarationModule(moduleName) {
  const relative = moduleName.replace(/^\.\//, "").replace(/\.js$/, ".d.ts");
  const declarationPath = join(root, "dist/src", relative);
  if (!existsSync(declarationPath)) throw new Error(`Missing declaration module for public export: ${moduleName}`);
  return readFileSync(declarationPath, "utf8");
}

export function buildInventory() {
  const rootIndex = readFileSync(join(root, "dist/src/index.d.ts"), "utf8");
  const reactIndex = readFileSync(join(root, "packages/react/dist/index.d.ts"), "utf8");
  const surface = [
    ...inventoryPackage("openkline", "dist/src/index.d.ts", rootIndex),
    ...inventoryPackage("@openkline/react", "packages/react/dist/index.d.ts", reactIndex, true),
  ].sort((left, right) => left.package.localeCompare(right.package) || left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind));
  return {
    schemaVersion: 1,
    packages: ["openkline", "@openkline/react"],
    surface,
    runtimeExports: surface.filter((entry) => entry.kind === "runtime"),
    typeExports: surface.filter((entry) => entry.kind === "type"),
    notes: [
      "The surface records package exports and normalized declaration signatures, not every internal declaration.",
      "Signature hashes are compared for actual exported declarations; formatting-only source changes are not a compatibility failure.",
      "Additive exports are reported separately from removals and signature changes.",
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = buildInventory();
  const outputPath = join(root, "docs/audits/public-api-inventory.json");
  writeFileSync(outputPath, `${JSON.stringify({ ...inventory, generatedFrom: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() }, null, 2)}\n`);
  if (process.argv.includes("--write-baseline")) writeFileSync(join(root, "docs/audits/public-api-baseline.json"), `${JSON.stringify({ ...inventory, baselineCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "pass", packages: inventory.packages, runtimeExports: inventory.runtimeExports.length, typeExports: inventory.typeExports.length, output: "docs/audits/public-api-inventory.json", baselineWritten: process.argv.includes("--write-baseline") }, null, 2));
}

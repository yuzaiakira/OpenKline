import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceFiles = walk(join(root, "src"));
const forbiddenCoreImports = /(?:from\s+["'][^"']*(?:examples|next|react)[^"']*["']|import\s*\([^)]*(?:examples|next|react))/i;
const violations = sourceFiles.filter((file) => forbiddenCoreImports.test(readFileSync(file, "utf8")));
if (violations.length > 0) throw new Error(`core imports Studio/framework code: ${violations.map((file) => relative(root, file)).join(", ")}`);

const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (rootManifest.dependencies?.next !== undefined || rootManifest.dependencies?.react !== undefined) throw new Error("core package has a Studio framework runtime dependency");
const studioManifest = JSON.parse(readFileSync(join(root, "examples/nextjs-app-router/package.json"), "utf8"));
if (studioManifest.private !== true) throw new Error("Next.js Studio example must remain private");

const studioFiles = walk(join(root, "examples/nextjs-app-router/app"));
const sourceImportViolations = studioFiles.filter((file) => /from\s+["'][^"']*(?:\.\.\/\.\.\/src|src\/)[^"']*["']/.test(readFileSync(file, "utf8")));
if (sourceImportViolations.length > 0) throw new Error(`Studio imports private source paths: ${sourceImportViolations.map((file) => relative(root, file)).join(", ")}`);

console.log(JSON.stringify({
  status: "pass",
  coreFilesAudited: sourceFiles.length,
  studioFilesAudited: studioFiles.length,
  coreFrameworkRuntimeDependencies: { react: rootManifest.dependencies?.react ?? null, next: rootManifest.dependencies?.next ?? null },
  studioPrivate: studioManifest.private === true,
  notes: [
    "Studio remains a reference consumer and does not define the core library boundary",
    "The deterministic demo provider is opt-in fixture functionality, not a mandatory external data service",
  ],
}, null, 2));

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

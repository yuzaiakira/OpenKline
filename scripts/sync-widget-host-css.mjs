#!/usr/bin/env node
/**
 * Sync examples/vanilla/widget-openkline.css from src/widget/styles.ts WIDGET_CSS.
 * Keeps CSP external-stylesheet fixtures aligned with the injected stylesheet.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "src/widget/styles.ts");
const targetPath = resolve(root, "examples/vanilla/widget-openkline.css");
const source = readFileSync(sourcePath, "utf8");
const marker = "export const WIDGET_CSS = `";
const start = source.indexOf(marker);
if (start < 0) throw new Error("WIDGET_CSS export not found");
const bodyStart = start + marker.length;
const end = source.indexOf("`;", bodyStart);
if (end < 0) throw new Error("WIDGET_CSS terminator not found");
const css = source.slice(bodyStart, end).replace(/^\n/, "");
writeFileSync(targetPath, `/* AUTO-SYNCED from src/widget/styles.ts WIDGET_CSS — run scripts/sync-widget-host-css.mjs */\n${css}`);
process.stdout.write(`synced ${targetPath}\n`);

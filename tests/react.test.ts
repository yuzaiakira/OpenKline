import assert from "node:assert/strict";
import { existsSync, lstatSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";

test("React binding is independently importable and SSR-safe", async () => {
  const localPackagePath = resolve("node_modules/openkline");
  const createdLink = !existsSync(localPackagePath);
  if (createdLink) symlinkSync(resolve("."), localPackagePath, "dir");

  try {
  type ReactPackage = typeof import("../packages/react/dist/index.js");
  const reactPackage = await import(pathToFileURL(resolve("packages/react/dist/index.js")).href) as ReactPackage;
  const markup = renderToString(React.createElement(reactPackage.FinancialChart, {
    candles: [],
    style: { height: 240 },
  }));

  assert.match(markup, /height:240px/);
  assert.match(markup, /div/);
  } finally {
    if (createdLink && lstatSync(localPackagePath, { throwIfNoEntry: false }) !== undefined) rmSync(localPackagePath);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { compareDeclarationSurfaces, compareRootExports } from "./api-compatibility-ast.mjs";

const chart = (body) => `export declare class Chart {\n${body}\n}`;
const contract = (body) => `export interface WorkspaceDocument {\n${body}\n}`;

test("compatibility diagnostics classify additive methods and optional fields as non-breaking", () => {
  const method = compareDeclarationSurfaces(chart("  setData(data: readonly Candle[]): void;"), chart("  setData(data: readonly Candle[]): void;\n  addAnchoredVwap(options: AnchoredVwapOptions): AnchoredVwapApi;"), "Chart", "class");
  assert.equal(method.breaking, false);
  assert.deepEqual(method.added.map((entry) => entry.category), ["additive-method"]);

  const optional = compareDeclarationSurfaces(contract("  readonly version: 1;"), contract("  readonly version: 1;\n  readonly volumeAnalytics?: WorkspaceVolumeAnalytics;"), "WorkspaceDocument", "interface");
  assert.equal(optional.breaking, false);
  assert.equal(optional.added[0]?.category, "additive-optional-member");

  const exports = compareRootExports("export { Chart } from \"./chart.js\";", "export { Chart, NewFeature } from \"./chart.js\";");
  assert.equal(exports.breaking, false);
  assert.deepEqual(exports.added.map((entry) => entry.name), ["NewFeature"]);
});

test("compatibility diagnostics catch removed methods and exports", () => {
  const result = compareDeclarationSurfaces(chart("  setData(data: readonly Candle[]): void;\n  update(candle: Candle): void;"), chart("  setData(data: readonly Candle[]): void;"), "Chart", "class");
  assert.equal(result.breaking, true);
  assert.equal(result.removed[0]?.category, "removed-member");

  const exports = compareRootExports("export { Chart, RemovedFeature } from \"./index.js\";", "export { Chart } from \"./index.js\";");
  assert.equal(exports.breaking, true);
  assert.equal(exports.removed[0]?.name, "RemovedFeature");
});

test("compatibility diagnostics catch incompatible parameters, returns, property types, and required additions", () => {
  const parameter = compareDeclarationSurfaces(chart("  update(candle: Candle): void;"), chart("  update(candle: Readonly<Candle>): void;"), "Chart", "class");
  assert.equal(parameter.changed[0]?.category, "changed-signature");

  const returnType = compareDeclarationSurfaces(chart("  getData(): Candle[];"), chart("  getData(): readonly Candle[];"), "Chart", "class");
  assert.equal(returnType.changed[0]?.category, "changed-signature");

  const propertyType = compareDeclarationSurfaces(contract("  readonly version: 1;"), contract("  readonly version: 2;"), "WorkspaceDocument", "interface");
  assert.equal(propertyType.changed[0]?.category, "changed-signature");

  const required = compareDeclarationSurfaces(contract("  readonly version: 1;"), contract("  readonly version: 1;\n  readonly chart: ChartConfiguration;"), "WorkspaceDocument", "interface");
  assert.equal(required.breaking, true);
  assert.equal(required.added[0]?.category, "required-member-addition");
});

test("compatibility diagnostics preserve overload semantics", () => {
  const added = compareDeclarationSurfaces(chart("  execute(value: string): string;"), chart("  execute(value: string): string;\n  execute(value: number): number;"), "Chart", "class");
  assert.equal(added.breaking, false);
  assert.equal(added.added[0]?.category, "additive-method");

  const removed = compareDeclarationSurfaces(chart("  execute(value: string): string;\n  execute(value: number): number;"), chart("  execute(value: string): string;"), "Chart", "class");
  assert.equal(removed.breaking, true);
  assert.equal(removed.removed[0]?.category, "removed-overload");
});

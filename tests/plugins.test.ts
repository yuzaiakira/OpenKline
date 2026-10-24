import assert from "node:assert/strict";
import test from "node:test";
import { PluginRegistry, PluginValidationError, PluginCompatibilityError, type PluginHost, type OpenKlinePlugin } from "../src/index.js";

function hostWithLog(log: string[]): PluginHost {
  return {
    registerIndicator: () => () => log.push("indicator.dispose"),
    registerDrawingTool: () => () => log.push("drawing.dispose"),
    registerOverlay: () => () => log.push("overlay.dispose"),
    subscribe: () => () => log.push("event.dispose"),
  };
}

function plugin(overrides: Partial<OpenKlinePlugin> = {}): OpenKlinePlugin {
  return {
    metadata: {
      id: "example.core",
      name: "Example Core",
      version: "1.2.0",
      apiVersion: 1,
      description: "Plugin test fixture",
    },
    setup: () => undefined,
    ...overrides,
  };
}

test("PluginRegistry scopes resources, state, commands, and idempotent disposal", async () => {
  const log: string[] = [];
  const registry = new PluginRegistry(hostWithLog(log));
  const handle = registry.install(plugin({
    setup: (context) => {
      context.state.set("counter", { value: 2 });
      context.indicators.register({} as never);
      context.drawings.register({} as never);
      context.overlays.register({ id: "example.overlay", title: "Overlay", render: () => [] });
      context.events.on("crosshairMove", () => undefined);
      context.commands.register({ id: "example.refresh", title: "Refresh", execute: () => "ok" });
      return () => log.push("plugin.cleanup");
    },
  }));

  assert.equal(handle.metadata.id, "example.core");
  assert.deepEqual(handle.state.get("counter"), { value: 2 });
  assert.equal(await registry.executeCommand("example.refresh"), "ok");
  assert.deepEqual(registry.listCommands().map((command) => command.id), ["example.refresh"]);
  assert.equal(registry.get("example.core")?.active, true);
  handle.dispose();
  handle.dispose();
  assert.equal(registry.has("example.core"), false);
  assert.deepEqual(log, ["plugin.cleanup", "event.dispose", "overlay.dispose", "drawing.dispose", "indicator.dispose"]);
  assert.equal(handle.state.get("counter"), undefined);
  registry.dispose();
});

test("PluginRegistry rolls back resources when activation fails", () => {
  const log: string[] = [];
  const registry = new PluginRegistry(hostWithLog(log));
  assert.throws(() => registry.install(plugin({
    metadata: {
      id: "example.failing",
      name: "Failing Plugin",
      version: "1.0.0",
      apiVersion: 1,
    },
    setup: (context) => {
      context.overlays.register({ id: "example.failing-overlay", title: "Overlay", render: () => [] });
      throw new Error("setup failed");
    },
  })), /Plugin activation failed: example\.failing/);
  assert.equal(registry.has("example.failing"), false);
  assert.deepEqual(log, ["overlay.dispose"]);
});

test("PluginRegistry validates identifiers, dependencies, and compatibility", () => {
  const registry = new PluginRegistry(hostWithLog([]));
  assert.throws(() => registry.install(plugin({ metadata: { id: "Bad ID", name: "Bad", version: "1.0.0", apiVersion: 1 } })), PluginValidationError);
  assert.throws(() => registry.install(plugin({ metadata: { id: "example.dependent", name: "Dependent", version: "1.0.0", apiVersion: 1, dependencies: [{ id: "example.missing", version: "^1.0.0" }] } })), PluginCompatibilityError);
  assert.throws(() => registry.install(plugin({ metadata: { id: "example.incompatible", name: "Incompatible", version: "1.0.0", apiVersion: 1, hostVersionRange: "^2.0.0" } })), PluginCompatibilityError);
  registry.install(plugin());
  assert.throws(() => registry.install(plugin()), /Plugin already installed/);
  registry.dispose();
});

test("PluginRegistry restores only JSON plugin state", () => {
  const registry = new PluginRegistry(hostWithLog([]));
  const handle = registry.install(plugin({ metadata: { id: "example.state", name: "State", version: "1.0.0", apiVersion: 1 } }));
  assert.equal(registry.restoreState("example.state", { theme: "dark", values: [1, true] }), true);
  assert.deepEqual(handle.state.snapshot(), { theme: "dark", values: [1, true] });
  assert.throws(() => registry.restoreState("example.state", { bad: new Date() }), PluginValidationError);
  assert.equal(registry.restoreState("example.unknown", {}), false);
  handle.dispose();
  registry.dispose();
});

test("PluginRegistry normalizes shortcuts and rejects conflicts", () => {
  const registry = new PluginRegistry(hostWithLog([]));
  let executed = 0;
  registry.install(plugin({
    metadata: { id: "example.shortcuts", name: "Shortcuts", version: "1.0.0", apiVersion: 1 },
    setup: (context) => {
      context.commands.register({ id: "example.shortcuts.run", title: "Run", shortcut: "Ctrl+Shift+r", execute: () => { executed += 1; } });
    },
  }));
  assert.equal(registry.executeShortcut("Ctrl+Shift+R"), undefined);
  assert.equal(executed, 1);
  assert.throws(() => registry.install(plugin({
    metadata: { id: "example.other", name: "Other", version: "1.0.0", apiVersion: 1 },
    setup: (context) => {
      context.commands.register({ id: "example.other.run", title: "Run", shortcut: "Control+Shift+R", execute: () => undefined });
    },
  })), /shortcut already registered/);
  registry.dispose();
});

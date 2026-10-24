import type { DrawingToolDefinition } from "../drawings/types.js";
import type { IndicatorDefinition } from "../indicators/types.js";
import type { ChartEventHandler, ChartEventName } from "../types.js";
import {
  OPENKLINE_PLUGIN_API_VERSION,
  PluginCompatibilityError,
  PluginLifecycleError,
  PluginValidationError,
  type Disposable,
  type JsonValue,
  type OpenKlinePlugin,
  type PluginCommand,
  type PluginCommandApi,
  type PluginCommandMetadata,
  type PluginContext,
  type PluginDrawingApi,
  type PluginEventApi,
  type PluginHandle,
  type PluginIndicatorApi,
  type PluginMetadata,
  type PluginOverlayApi,
  type PluginOverlayDefinition,
  type PluginStateStore,
  type InstalledPluginMetadata,
} from "./types.js";

export const OPENKLINE_HOST_VERSION = "0.1.0" as const;

export interface PluginHost {
  registerIndicator(definition: IndicatorDefinition): () => void;
  registerDrawingTool(definition: DrawingToolDefinition): () => void;
  registerOverlay(definition: PluginOverlayDefinition): () => void;
  subscribe<Name extends ChartEventName>(name: Name, handler: ChartEventHandler<Name>): () => void;
}

interface InstalledPlugin {
  readonly plugin: OpenKlinePlugin;
  readonly metadata: PluginMetadata;
  readonly state: MemoryPluginState;
  readonly resources: Disposable[];
  readonly cleanup: (() => void) | undefined;
}

export class PluginRegistry {
  private readonly plugins = new Map<string, InstalledPlugin>();
  private readonly commands = new Map<string, { owner: string; command: PluginCommand }>();
  private readonly shortcuts = new Map<string, string>();
  private disposed = false;

  public constructor(
    private readonly host: PluginHost,
    private readonly hostVersion = OPENKLINE_HOST_VERSION,
  ) {}

  public install(plugin: OpenKlinePlugin): PluginHandle {
    this.assertAlive();
    validatePlugin(plugin);
    const metadata = cloneMetadata(plugin.metadata);
    if (this.plugins.has(metadata.id)) {
      throw new PluginValidationError(`Plugin already installed: ${metadata.id}`);
    }
    validateHostCompatibility(metadata, this.hostVersion);
    validateDependencies(metadata, this.plugins);

    const state = new MemoryPluginState();
    const resources: Disposable[] = [];
    const track = <T extends Disposable>(resource: T): T => {
      resources.push(resource);
      return resource;
    };
    const context = this.createContext(metadata, state, track);
    let cleanup: (() => void) | undefined;
    try {
      const returned = plugin.setup(context);
      cleanup = typeof returned === "function" ? returned : undefined;
      this.plugins.set(metadata.id, { plugin, metadata, state, resources, cleanup });
    } catch (error) {
      const cleanupErrors = disposeResources(resources, cleanup);
      state.clear();
      const reason = error instanceof Error ? `: ${error.message}` : `: ${String(error)}`;
      throw new PluginLifecycleError(
        `Plugin activation failed: ${metadata.id}${reason}${cleanupErrors.length > 0 ? `; cleanup also failed (${cleanupErrors.length})` : ""}`,
        { cause: error },
      );
    }

    let disposed = false;
    return {
      metadata: cloneMetadata(metadata),
      state,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.uninstall(metadata.id);
      },
    };
  }

  public uninstall(id: string): boolean {
    this.assertAlive();
    const installed = this.plugins.get(id);
    if (installed === undefined) return false;
    const dependents = [...this.plugins.values()]
      .filter((candidate) => candidate.metadata.dependencies?.some((dependency) => dependency.id === id && dependency.optional !== true))
      .map((candidate) => candidate.metadata.id);
    if (dependents.length > 0) {
      throw new PluginLifecycleError(`Cannot uninstall ${id}; active plugins depend on it: ${dependents.join(", ")}`);
    }
    this.plugins.delete(id);
    const errors = disposeResources(installed.resources, installed.cleanup);
    installed.state.clear();
    if (errors.length > 0) {
      throw new PluginLifecycleError(`Plugin disposal failed: ${id}`, { cause: errors[0] });
    }
    return true;
  }

  public has(id: string): boolean {
    return this.plugins.has(id);
  }

  public get(id: string): InstalledPluginMetadata | undefined {
    const installed = this.plugins.get(id);
    return installed === undefined ? undefined : { ...installed.metadata, active: true };
  }

  public list(): InstalledPluginMetadata[] {
    return [...this.plugins.values()]
      .map((installed) => ({ ...installed.metadata, active: true }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public executeCommand(id: string, args?: unknown): unknown | Promise<unknown> {
    this.assertAlive();
    const entry = this.commands.get(id);
    if (entry === undefined) throw new Error(`Unknown plugin command: ${id}`);
    return entry.command.execute(args);
  }

  public executeShortcut(shortcut: string, args?: unknown): unknown | Promise<unknown> {
    this.assertAlive();
    const commandId = this.shortcuts.get(normalizeShortcut(shortcut));
    return commandId === undefined ? undefined : this.executeCommand(commandId, args);
  }

  public listCommands(): readonly PluginCommandMetadata[] {
    return [...this.commands.values()]
      .map(({ command }) => ({
        id: command.id,
        title: command.title,
        ...(command.description === undefined ? {} : { description: command.description }),
        ...(command.shortcut === undefined ? {} : { shortcut: command.shortcut }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public getStateSnapshot(id: string): Readonly<Record<string, JsonValue>> | undefined {
    return this.plugins.get(id)?.state.snapshot();
  }

  public restoreState(id: string, snapshot: unknown): boolean {
    const installed = this.plugins.get(id);
    if (installed === undefined) return false;
    installed.state.restore(snapshot);
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const id of [...this.plugins.keys()]) {
      const installed = this.plugins.get(id);
      if (installed === undefined) continue;
      this.plugins.delete(id);
      errors.push(...disposeResources(installed.resources, installed.cleanup));
      installed.state.clear();
    }
    this.commands.clear();
    this.shortcuts.clear();
    if (errors.length > 0) throw new PluginLifecycleError("One or more plugin disposals failed", { cause: errors[0] });
  }

  private createContext(
    metadata: PluginMetadata,
    state: MemoryPluginState,
    track: <T extends Disposable>(resource: T) => T,
  ): PluginContext {
    const indicators: PluginIndicatorApi = {
      register: (definition) => track(disposable(this.host.registerIndicator(definition))),
    };
    const drawings: PluginDrawingApi = {
      register: (definition) => track(disposable(this.host.registerDrawingTool(definition))),
    };
    const overlays: PluginOverlayApi = {
      register: (definition) => track(disposable(this.host.registerOverlay(definition))),
    };
    const events: PluginEventApi = {
      on: (name, handler) => track(disposable(this.host.subscribe(name, handler))),
    };
    const commands: PluginCommandApi = {
      register: (command) => {
        validateCommand(command);
        if (this.commands.has(command.id)) throw new PluginValidationError(`Plugin command already registered: ${command.id}`);
        const normalizedShortcut = command.shortcut === undefined ? undefined : normalizeShortcut(command.shortcut);
        if (normalizedShortcut !== undefined && this.shortcuts.has(normalizedShortcut)) {
          throw new PluginValidationError(`Plugin command shortcut already registered: ${command.shortcut}`);
        }
        this.commands.set(command.id, { owner: metadata.id, command });
        if (normalizedShortcut !== undefined) this.shortcuts.set(normalizedShortcut, command.id);
        return track(disposable(() => {
          const current = this.commands.get(command.id);
          if (current?.owner === metadata.id) {
            this.commands.delete(command.id);
            if (normalizedShortcut !== undefined && this.shortcuts.get(normalizedShortcut) === command.id) {
              this.shortcuts.delete(normalizedShortcut);
            }
          }
        }));
      },
      execute: (id, args) => this.executeCommand(id, args),
      list: () => this.listCommands(),
    };
    return {
      apiVersion: OPENKLINE_PLUGIN_API_VERSION,
      plugin: cloneMetadata(metadata),
      indicators,
      drawings,
      overlays,
      events,
      commands,
      state,
    };
  }

  private assertAlive(): void {
    if (this.disposed) throw new PluginLifecycleError("Plugin registry has been disposed");
  }
}

class MemoryPluginState implements PluginStateStore {
  private readonly values = new Map<string, JsonValue>();

  public get<T extends JsonValue = JsonValue>(key: string): T | undefined {
    validateKey(key);
    const value = this.values.get(key);
    return value === undefined ? undefined : cloneJson(value) as T;
  }

  public set(key: string, value: JsonValue): void {
    validateKey(key);
    assertJsonValue(value, `Invalid plugin state at ${key}`);
    this.values.set(key, cloneJson(value));
  }

  public delete(key: string): boolean {
    validateKey(key);
    return this.values.delete(key);
  }

  public has(key: string): boolean {
    validateKey(key);
    return this.values.has(key);
  }

  public snapshot(): Readonly<Record<string, JsonValue>> {
    return Object.fromEntries([...this.values.entries()].map(([key, value]) => [key, cloneJson(value)]));
  }

  public restore(snapshot: unknown): void {
    if (!isJsonObject(snapshot)) throw new PluginValidationError("Plugin state must be a JSON object");
    this.values.clear();
    for (const [key, value] of Object.entries(snapshot)) {
      assertJsonValue(value, `Invalid plugin state at ${key}`);
      this.values.set(key, cloneJson(value));
    }
  }

  public clear(): void {
    this.values.clear();
  }
}

function disposable(dispose: () => void): Disposable {
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      dispose();
    },
  };
}

function disposeResources(resources: readonly Disposable[], cleanup: (() => void) | undefined): unknown[] {
  const errors: unknown[] = [];
  if (cleanup !== undefined) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  for (const resource of [...resources].reverse()) {
    try {
      resource.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function validatePlugin(plugin: OpenKlinePlugin): void {
  if (typeof plugin !== "object" || plugin === null) throw new PluginValidationError("Plugin must be an object");
  const metadata = plugin.metadata;
  if (typeof metadata !== "object" || metadata === null) throw new PluginValidationError("Plugin metadata is required");
  if (!isIdentifier(metadata.id)) throw new PluginValidationError("Plugin id must use lowercase names separated by dots or hyphens");
  if (typeof metadata.name !== "string" || metadata.name.trim().length === 0) throw new PluginValidationError(`Plugin name is required: ${metadata.id}`);
  if (!isSemver(metadata.version)) throw new PluginValidationError(`Invalid plugin version: ${metadata.version}`);
  if (metadata.apiVersion !== OPENKLINE_PLUGIN_API_VERSION) throw new PluginCompatibilityError(`Unsupported plugin API version: ${metadata.apiVersion}`);
  if (metadata.hostVersionRange !== undefined && !satisfiesRange(OPENKLINE_HOST_VERSION, metadata.hostVersionRange)) {
    throw new PluginCompatibilityError(`Plugin ${metadata.id} requires host ${metadata.hostVersionRange}, current host is ${OPENKLINE_HOST_VERSION}`);
  }
  if (typeof plugin.setup !== "function") throw new PluginValidationError(`Plugin setup is not a function: ${metadata.id}`);
}

function validateDependencies(metadata: PluginMetadata, installed: ReadonlyMap<string, InstalledPlugin>): void {
  const seen = new Set<string>();
  for (const dependency of metadata.dependencies ?? []) {
    if (!isIdentifier(dependency.id) || !isSemverRange(dependency.version)) {
      throw new PluginValidationError(`Invalid dependency in plugin ${metadata.id}: ${dependency.id}`);
    }
    if (seen.has(dependency.id)) throw new PluginValidationError(`Duplicate dependency in plugin ${metadata.id}: ${dependency.id}`);
    seen.add(dependency.id);
    const current = installed.get(dependency.id);
    if (current === undefined) {
      if (!dependency.optional) throw new PluginCompatibilityError(`Missing plugin dependency: ${metadata.id} requires ${dependency.id}`);
      continue;
    }
    if (!satisfiesRange(current.metadata.version, dependency.version)) {
      throw new PluginCompatibilityError(`Plugin dependency version mismatch: ${metadata.id} requires ${dependency.id}@${dependency.version}`);
    }
  }
}

function validateHostCompatibility(metadata: PluginMetadata, hostVersion: string): void {
  if (metadata.hostVersionRange !== undefined && !satisfiesRange(hostVersion, metadata.hostVersionRange)) {
    throw new PluginCompatibilityError(`Plugin ${metadata.id} requires host ${metadata.hostVersionRange}, current host is ${hostVersion}`);
  }
}

function validateCommand(command: PluginCommand): void {
  if (typeof command !== "object" || command === null || typeof command.id !== "string" || !isIdentifier(command.id.replaceAll("_", "-"))) {
    throw new PluginValidationError("Plugin command id must be a non-empty identifier");
  }
  if (typeof command.title !== "string" || command.title.trim().length === 0 || typeof command.execute !== "function") {
    throw new PluginValidationError(`Invalid plugin command: ${command.id}`);
  }
  if (command.shortcut !== undefined) normalizeShortcut(command.shortcut);
}

function normalizeShortcut(shortcut: string): string {
  if (typeof shortcut !== "string" || shortcut.trim().length === 0) {
    throw new PluginValidationError("Plugin command shortcut must not be empty");
  }
  const parts = shortcut.split("+").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) throw new PluginValidationError("Plugin command shortcut must not be empty");
  const key = parts.pop()!;
  const modifiers = new Set<string>();
  for (const part of parts) {
    const normalized = part.toLowerCase();
    const modifier = normalized === "control" || normalized === "ctrl"
      ? "Ctrl"
      : normalized === "command" || normalized === "cmd" || normalized === "meta"
        ? "Meta"
        : normalized === "option" || normalized === "alt"
          ? "Alt"
          : normalized === "shift" ? "Shift" : undefined;
    if (modifier === undefined) throw new PluginValidationError(`Unknown plugin command shortcut modifier: ${part}`);
    modifiers.add(modifier);
  }
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  if (!/^[A-Za-z0-9]+$/.test(normalizedKey) && !/^F(?:[1-9]|1[0-2])$/.test(normalizedKey) && !["Enter", "Escape", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Backspace"].includes(normalizedKey)) {
    throw new PluginValidationError(`Invalid plugin command shortcut key: ${key}`);
  }
  return [...["Ctrl", "Meta", "Alt", "Shift"].filter((modifier) => modifiers.has(modifier)), normalizedKey].join("+");
}

function cloneMetadata(metadata: PluginMetadata): PluginMetadata {
  return {
    ...metadata,
    ...(metadata.description === undefined ? {} : { description: metadata.description }),
    ...(metadata.hostVersionRange === undefined ? {} : { hostVersionRange: metadata.hostVersionRange }),
    ...(metadata.dependencies === undefined ? {} : { dependencies: metadata.dependencies.map((dependency) => ({ ...dependency })) }),
  };
}

function isIdentifier(value: string): boolean {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(value);
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function isSemverRange(value: string): boolean {
  return value === "*" || /^(?:\^|~|>=|<=|>|<)?\d+\.\d+\.\d+$/.test(value);
}

function satisfiesRange(version: string, range: string): boolean {
  if (!isSemver(version) || !isSemverRange(range)) return false;
  if (range === "*") return true;
  const requested = parseVersion(range.replace(/^(\^|~|>=|<=|>|<)/, ""));
  const current = parseVersion(version);
  const operator = range.match(/^(\^|~|>=|<=|>|<)/)?.[1] ?? "=";
  if (requested === undefined || current === undefined) return false;
  const comparison = compareVersion(current, requested);
  if (operator === "=") return comparison === 0;
  if (operator === ">") return comparison > 0;
  if (operator === ">=") return comparison >= 0;
  if (operator === "<") return comparison < 0;
  if (operator === "<=") return comparison <= 0;
  if (operator === "~") return current.major === requested.major && current.minor === requested.minor && comparison >= 0;
  return current.major === requested.major && comparison >= 0;
}

function parseVersion(value: string): { major: number; minor: number; patch: number } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match === null ? undefined : { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersion(left: { major: number; minor: number; patch: number }, right: { major: number; minor: number; patch: number }): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function validateKey(key: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) throw new PluginValidationError(`Invalid plugin state key: ${key}`);
}

function assertJsonValue(value: unknown, message: string): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
  } else if (Array.isArray(value)) {
    if (value.every((item) => {
      try {
        assertJsonValue(item, message);
        return true;
      } catch {
        return false;
      }
    })) return;
  } else if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype === Object.prototype || prototype === null)
      && Object.entries(value).every(([key, item]) => /^[^$].{0,127}$/.test(key) && isJsonValue(item))) return;
  }
  throw new PluginValidationError(message);
}

function isJsonValue(value: unknown): value is JsonValue {
  try {
    assertJsonValue(value, "Invalid JSON value");
    return true;
  } catch {
    return false;
  }
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value);
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as unknown as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)])) as T;
}

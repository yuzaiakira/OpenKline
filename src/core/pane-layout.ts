import type { PaneOptions } from "../types.js";

export interface PaneConfig {
  readonly id: string;
  readonly preferredHeight: number | null;
  readonly minHeight: number;
}

/** Owns pane ordering and preferred heights without knowing chart rendering. */
export class PaneLayout {
  private readonly panes = new Map<string, PaneConfig>([
    ["main", { id: "main", preferredHeight: null, minHeight: 80 }],
  ]);
  private nextId = 1;

  public add(options: PaneOptions = {}): string {
    const id = options.id ?? `pane-${this.nextId++}`;
    if (this.panes.has(id)) throw new Error(`Pane id already exists: ${id}`);
    const explicitNumber = /^pane-(\d+)$/.exec(id)?.[1];
    if (explicitNumber !== undefined) this.nextId = Math.max(this.nextId, Number(explicitNumber) + 1);
    this.panes.set(id, {
      id,
      preferredHeight: options.height === undefined ? 160 : normalizeHeight(options.height),
      minHeight: options.minHeight === undefined ? 60 : normalizeHeight(options.minHeight),
    });
    return id;
  }

  public remove(id: string): void {
    if (id === "main") throw new Error("The main pane cannot be removed");
    if (!this.panes.delete(id)) throw new Error(`Unknown pane id: ${id}`);
  }

  public setHeight(id: string, height: number): void {
    const pane = this.require(id);
    if (id === "main") throw new Error("The main pane height is responsive");
    this.panes.set(id, { ...pane, preferredHeight: normalizeHeight(height) });
  }

  public getHeight(id: string): number | null {
    return this.require(id).preferredHeight;
  }

  public has(id: string): boolean {
    return this.panes.has(id);
  }

  public getIds(): string[] {
    return [...this.panes.keys()];
  }

  public getConfigs(): PaneConfig[] {
    return [...this.panes.values()].map((pane) => ({ ...pane }));
  }

  public clearAdditional(): void {
    for (const id of this.getIds()) {
      if (id !== "main") this.panes.delete(id);
    }
  }

  private require(id: string): PaneConfig {
    const pane = this.panes.get(id);
    if (pane === undefined) throw new Error(`Unknown pane id: ${id}`);
    return pane;
  }
}

function normalizeHeight(value: number): number {
  if (!Number.isFinite(value) || value < 1) throw new RangeError("Pane height must be a positive finite number");
  return Math.floor(value);
}

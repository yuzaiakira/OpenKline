export interface StudioSynchronizationTarget {
  setCrosshairAtTime(time: number | null): number | null;
  setVisibleTimeRange(range: { from: number; to: number }): void;
}

export type StudioSynchronizationTargets = ReadonlyMap<string, StudioSynchronizationTarget>;

/**
 * Host-level synchronization for independent charts. The controller forwards
 * UTC coordinates, leaving nearest-bar selection and range clamping to each
 * chart's own data and viewport model.
 */
export class StudioSynchronizationController {
  private propagationDepth = 0;

  public constructor(private readonly getTargets: () => StudioSynchronizationTargets) {}

  public syncCrosshair(sourcePanelId: string, time: number | null, enabled: boolean): void {
    if (!enabled || this.propagationDepth > 0) return;
    this.propagate(sourcePanelId, (target) => { target.setCrosshairAtTime(time); });
  }

  public syncVisibleRange(sourcePanelId: string, range: { from: number; to: number }, enabled: boolean): void {
    if (!enabled || this.propagationDepth > 0) return;
    if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from > range.to) return;
    this.propagate(sourcePanelId, (target) => { target.setVisibleTimeRange(range); });
  }

  private propagate(sourcePanelId: string, action: (target: StudioSynchronizationTarget) => void): void {
    this.propagationDepth += 1;
    try {
      for (const [panelId, target] of this.getTargets()) {
        if (panelId !== sourcePanelId) action(target);
      }
    } finally {
      this.propagationDepth -= 1;
    }
  }
}

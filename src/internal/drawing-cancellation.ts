/**
 * Internal Chart ↔ Widget drawing cancellation bridge.
 *
 * Chart registers a private cancellation callback without exposing
 * `cancelDrawing` on the public package surface. Widget (and only other
 * internal hosts) may invoke the registered callback through this module.
 * The root package does not re-export these helpers.
 */

const cancellationByOwner = new WeakMap<object, () => void>();

/** Register the owner's private interactive-drawing cancellation hook. */
export function registerInteractiveDrawingCancellation(owner: object, cancel: () => void): void {
  cancellationByOwner.set(owner, cancel);
}

/** Clear any pending interactive drawing on a registered Chart owner. */
export function cancelInteractiveDrawing(owner: object): void {
  cancellationByOwner.get(owner)?.();
}

/** Test helper: report whether a cancellation hook is registered. */
export function hasInteractiveDrawingCancellation(owner: object): boolean {
  return cancellationByOwner.has(owner);
}

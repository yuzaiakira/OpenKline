/**
 * Accessible modal focus helpers for Widget dialogs.
 * Focus containment is scoped to a single Widget root so multiple Widgets
 * remain independent.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface ModalFocusSession {
  readonly dialog: HTMLElement;
  readonly restoreFocus: HTMLElement | null;
  readonly release: () => void;
}

export function collectFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true" && isVisible(element));
}

export interface ModalFocusOptions {
  /** When true, keep the chart grid interactive (required for drawing tools). */
  readonly keepChartInteractive?: boolean;
}

export function openModalFocus(
  dialog: HTMLElement,
  trigger: HTMLElement | null,
  onEscape: () => void,
  options: ModalFocusOptions = {},
): ModalFocusSession {
  const restoreFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const previouslyInert: Array<{ element: HTMLElement; inert: boolean }> = [];
  const root = dialog.closest<HTMLElement>("[data-openkline-widget]");
  if (root !== null) {
    for (const child of Array.from(root.children)) {
      if (!(child instanceof HTMLElement) || child === dialog || child.contains(dialog)) continue;
      // Keep the toolbar interactive so users can switch panels without Escape.
      if (child.hasAttribute("data-openkline-toolbar")) continue;
      if (options.keepChartInteractive && (child.hasAttribute("data-openkline-content") || child.hasAttribute("data-openkline-chart-grid"))) {
        // Inert status/error only; leave the chart grid usable for drawing/replay.
        const content = child.hasAttribute("data-openkline-content") ? child : null;
        if (content !== null) {
          for (const nested of Array.from(content.children)) {
            if (!(nested instanceof HTMLElement)) continue;
            if (nested.hasAttribute("data-openkline-chart-grid") || nested.contains(dialog)) continue;
            previouslyInert.push({ element: nested, inert: nested.inert });
            nested.inert = true;
          }
          continue;
        }
      }
      previouslyInert.push({ element: child, inert: child.inert });
      child.inert = true;
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = collectFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  dialog.addEventListener("keydown", onKeyDown);
  if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
  const initial = collectFocusable(dialog)[0] ?? dialog;
  initial.focus();

  return {
    dialog,
    restoreFocus,
    release: () => {
      dialog.removeEventListener("keydown", onKeyDown);
      for (const entry of previouslyInert) entry.element.inert = entry.inert;
      if (restoreFocus !== null && restoreFocus.isConnected) restoreFocus.focus();
    },
  };
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style === undefined) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

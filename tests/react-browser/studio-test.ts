import { expect, test as base, type Locator, type Page } from "@playwright/test";

type ResizeDiagnosticEntry = {
  readonly target: string;
  readonly width: number;
  readonly height: number;
};

type ResizeDiagnostics = {
  readonly count: number;
  readonly lastEntries: readonly ResizeDiagnosticEntry[];
};

type PointerDiagnosticEntry = {
  readonly type: string;
  readonly pointerType: string | null;
  readonly pointerId: number | null;
  readonly clientX: number | null;
  readonly clientY: number | null;
  readonly target: string | null;
};

type StudioDiagnostics = {
  readonly capturedAt: string;
  readonly testTitle: string;
  readonly viewport: Record<string, unknown>;
  readonly scroll: Record<string, number>;
  readonly activePanel: string | null;
  readonly panels: readonly Record<string, unknown>[];
  readonly targets: readonly Record<string, unknown>[];
  readonly overflowingElements: readonly Record<string, unknown>[];
  readonly pointerTrace: readonly PointerDiagnosticEntry[];
  readonly resizeObserver: ResizeDiagnostics | null;
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
};

const RESIZE_DIAGNOSTICS_KEY = "__openklineResizeDiagnostics";
const POINTER_DIAGNOSTICS_KEY = "__openklinePointerDiagnostics";

async function captureDiagnostics(page: Page, title: string, pageErrors: readonly string[], consoleErrors: readonly string[]): Promise<StudioDiagnostics | null> {
  try {
    return await page.evaluate(({ title: testTitle, resizeKey, pointerKey }) => {
      const numberOrNull = (value: number): number | null => Number.isFinite(value) ? Number(value.toFixed(2)) : null;
      const describe = (element: Element | null): string | null => {
        if (element === null) return null;
        const html = element as HTMLElement;
        const id = html.id ? `#${html.id}` : "";
        const classes = typeof html.className === "string" && html.className.length > 0
          ? `.${html.className.trim().split(/\s+/).slice(0, 2).join(".")}`
          : "";
        return `${element.tagName.toLowerCase()}${id}${classes}`;
      };
      const visible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const targetSummary = (element: Element): Record<string, unknown> => {
        const html = element as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hit = rect.width > 0 && rect.height > 0 && centerX >= 0 && centerY >= 0
          ? document.elementFromPoint(centerX, centerY)
          : null;
        const ancestors: string[] = [];
        let current: Element | null = hit;
        while (current !== null && ancestors.length < 5) {
          ancestors.push(describe(current) ?? "unknown");
          current = current.parentElement;
        }
        return {
          element: describe(element),
          text: (html.innerText ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
          visible: visible(element),
          rect: { left: numberOrNull(rect.left), top: numberOrNull(rect.top), width: numberOrNull(rect.width), height: numberOrNull(rect.height) },
          style: { display: style.display, visibility: style.visibility, position: style.position, overflow: style.overflow, pointerEvents: style.pointerEvents, transform: style.transform, zIndex: style.zIndex },
          hitTest: describe(hit),
          hitTestContainsTarget: hit === element || (hit !== null && element.contains(hit)),
          hitTestAncestors: ancestors,
        };
      };
      const overflowingElements: Record<string, unknown>[] = [];
      for (const candidate of Array.from(document.querySelectorAll("*"))) {
        if (!(candidate instanceof HTMLElement)) continue;
        const element = candidate;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const overflowingContent = element.scrollWidth > element.clientWidth + 1;
        const overflowingViewport = rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
        if (rect.width <= 0 || rect.height <= 0 || (!overflowingContent && !overflowingViewport)) continue;
        const parent = element.parentElement;
        const parentStyle = parent === null ? null : getComputedStyle(parent);
        overflowingElements.push({
          element: describe(element),
          parent: describe(parent),
          rect: { left: numberOrNull(rect.left), top: numberOrNull(rect.top), width: numberOrNull(rect.width), height: numberOrNull(rect.height), right: numberOrNull(rect.right) },
          scroll: { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowingContent, overflowingViewport },
          style: { display: style.display, position: style.position, width: style.width, minWidth: style.minWidth, boxSizing: style.boxSizing, overflowX: style.overflowX, gridTemplateColumns: style.gridTemplateColumns, flex: style.flex },
          parentStyle: parentStyle === null ? null : { display: parentStyle.display, position: parentStyle.position, width: parentStyle.width, minWidth: parentStyle.minWidth, overflowX: parentStyle.overflowX, gridTemplateColumns: parentStyle.gridTemplateColumns, flex: parentStyle.flex },
        });
        if (overflowingElements.length >= 24) break;
      }
      const summarizeSelector = (selector: string, limit = 8): readonly Record<string, unknown>[] => Array.from(document.querySelectorAll(selector)).slice(0, limit).map(targetSummary);
      const actionButtons = Array.from(document.querySelectorAll("button")).filter((button) => /^(Add|Run Backtest|Create alert|Run scan|Submit simulated buy|Save|Fit|Replay next bar)$/u.test((button.textContent ?? "").trim())).slice(0, 12).map(targetSummary);
      const resize = (window as unknown as Record<string, ResizeDiagnostics | undefined>)[resizeKey] ?? null;
      const activeSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Active chart panel"]');
      const panels = Array.from(document.querySelectorAll("[data-panel-id]")).slice(0, 8).map((panel) => ({
        panelId: panel.getAttribute("data-panel-id"),
        className: panel.className,
        visible: visible(panel),
        rect: (() => { const rect = panel.getBoundingClientRect(); return { left: numberOrNull(rect.left), top: numberOrNull(rect.top), width: numberOrNull(rect.width), height: numberOrNull(rect.height) }; })(),
        display: getComputedStyle(panel).display,
      }));
      return {
        capturedAt: new Date().toISOString(),
        testTitle,
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          visualViewportWidth: numberOrNull(window.visualViewport?.width ?? Number.NaN),
          visualViewportHeight: numberOrNull(window.visualViewport?.height ?? Number.NaN),
          devicePixelRatio: window.devicePixelRatio,
          screenWidth: window.screen.width,
          viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
          maxWidth720: window.matchMedia("(max-width: 720px)").matches,
          scrollWidth: document.documentElement.scrollWidth,
        },
        scroll: { x: window.scrollX, y: window.scrollY },
        activePanel: activeSelect?.value ?? null,
        panels,
        targets: [
          ...actionButtons,
          ...summarizeSelector("canvas", 4),
          ...summarizeSelector('[data-testid="strategy-optimizer"]', 4),
          ...summarizeSelector('[role="alert"]', 4),
        ],
        overflowingElements,
        pointerTrace: ((window as unknown as Record<string, PointerDiagnosticEntry[] | undefined>)[pointerKey] ?? []).slice(-60),
        resizeObserver: resize,
      };
    }, { title, resizeKey: RESIZE_DIAGNOSTICS_KEY, pointerKey: POINTER_DIAGNOSTICS_KEY }).then((diagnostics) => ({ ...diagnostics, pageErrors, consoleErrors }));
  } catch {
    return null;
  }
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => { if (pageErrors.length < 20) pageErrors.push(error.message.slice(0, 500)); });
    page.on("console", (message) => {
      if ((message.type() === "error" || message.type() === "warning") && consoleErrors.length < 20) {
        consoleErrors.push(`${message.type()}: ${message.text().slice(0, 500)}`);
      }
    });
    await page.addInitScript(({ resizeKey, pointerKey }) => {
      const win = window as unknown as Record<string, unknown>;
      if (win[pointerKey] !== undefined) return;
      if (win[resizeKey] === undefined && typeof window.ResizeObserver !== "undefined") {
        const diagnostics: { count: number; lastEntries: ResizeDiagnosticEntry[] } = { count: 0, lastEntries: [] };
        win[resizeKey] = diagnostics;
        const OriginalResizeObserver = window.ResizeObserver;
        class DiagnosticResizeObserver {
          private readonly observer: ResizeObserver;
          public constructor(callback: ResizeObserverCallback) {
            this.observer = new OriginalResizeObserver((entries, observer) => {
              diagnostics.count += 1;
              for (const entry of entries.slice(0, 8)) {
                diagnostics.lastEntries.push({ target: `${entry.target.tagName.toLowerCase()}.${(entry.target as HTMLElement).className ?? ""}`.slice(0, 160), width: Number(entry.contentRect.width.toFixed(2)), height: Number(entry.contentRect.height.toFixed(2)) });
              }
              diagnostics.lastEntries.splice(0, Math.max(0, diagnostics.lastEntries.length - 30));
              callback(entries, observer);
            });
          }
          public observe(target: Element, options?: ResizeObserverOptions): void { this.observer.observe(target, options); }
          public unobserve(target: Element): void { this.observer.unobserve(target); }
          public disconnect(): void { this.observer.disconnect(); }
        }
        Object.defineProperty(window, "ResizeObserver", { configurable: true, writable: true, value: DiagnosticResizeObserver });
      }
      const pointerTrace: PointerDiagnosticEntry[] = [];
      const describeTarget = (target: EventTarget | null): string | null => {
        if (!(target instanceof Element)) return null;
        const html = target as HTMLElement;
        const id = html.id ? `#${html.id}` : "";
        const classes = typeof html.className === "string" && html.className.length > 0
          ? `.${html.className.trim().split(/\s+/).slice(0, 2).join(".")}`
          : "";
        return `${target.tagName.toLowerCase()}${id}${classes}`;
      };
      const recordPointer = (event: Event): void => {
        const pointer = event as PointerEvent;
        const touch = "touches" in event ? (event as TouchEvent).touches[0] : undefined;
        pointerTrace.push({
          type: event.type,
          pointerType: typeof pointer.pointerType === "string" ? pointer.pointerType : null,
          pointerId: Number.isFinite(pointer.pointerId) ? pointer.pointerId : null,
          clientX: Number.isFinite(pointer.clientX) ? Number(pointer.clientX.toFixed(2)) : touch === undefined ? null : Number(touch.clientX.toFixed(2)),
          clientY: Number.isFinite(pointer.clientY) ? Number(pointer.clientY.toFixed(2)) : touch === undefined ? null : Number(touch.clientY.toFixed(2)),
          target: describeTarget(event.target),
        });
        pointerTrace.splice(0, Math.max(0, pointerTrace.length - 60));
      };
      for (const eventType of ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchend"] as const) {
        document.addEventListener(eventType, recordPointer, { capture: true, passive: true });
      }
      win[pointerKey] = pointerTrace;
    }, { resizeKey: RESIZE_DIAGNOSTICS_KEY, pointerKey: POINTER_DIAGNOSTICS_KEY });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      const diagnostics = await captureDiagnostics(page, testInfo.title, pageErrors, consoleErrors);
      if (diagnostics !== null) {
        await testInfo.attach("studio-diagnostics.json", { body: JSON.stringify(diagnostics, null, 2), contentType: "application/json" });
      }
    }
  },
});

export { expect };
export type { Locator, Page };

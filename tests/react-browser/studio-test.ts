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
  readonly targeted: Record<string, unknown>;
  readonly drawingInteraction: Record<string, unknown> | null;
  readonly inputTrace: readonly Record<string, unknown>[];
  readonly overflowingElements: readonly Record<string, unknown>[];
  readonly pointerTrace: readonly PointerDiagnosticEntry[];
  readonly resizeObserver: ResizeDiagnostics | null;
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
};

const RESIZE_DIAGNOSTICS_KEY = "__openklineResizeDiagnostics";
const POINTER_DIAGNOSTICS_KEY = "__openklinePointerDiagnostics";
const DRAWING_DIAGNOSTICS_KEY = "__openklineDrawingDiagnostics";
const INPUT_DIAGNOSTICS_KEY = "__openklineInputDiagnostics";

type MainPaneFractions = {
  readonly topFraction: number;
  readonly bottomFraction: number;
  readonly leftFraction: number;
  readonly rightFraction: number;
  readonly chartWidth: number;
  readonly chartHeight: number;
  readonly paneCount: number;
};

/**
 * Place a drawing anchor inside the actual primary price pane.
 * `xFraction`/`yFraction` are relative to that pane (not the full multi-pane canvas).
 * Mobile Studio charts keep volume/RSI panes below the main pane, so full-canvas
 * fractions such as 0.24 can land outside the drawable region after Phase 8.8.14.
 */
export async function placeVisibleChartPoint(page: Page, xFraction: number, yFraction: number, canvasSelector = "canvas"): Promise<void> {
  const point = await page.evaluate(({ x, y, selector, diagnosticsKey }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (canvas === null) throw new Error(`Chart canvas is missing for selector ${selector}`);
    const finite = (value: number): number => Number.isFinite(value) ? Number(value.toFixed(2)) : value;
    const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
    const parsePane = (): MainPaneFractions => {
      const raw = canvas.dataset.openklineMainPane;
      if (raw === undefined || raw.length === 0) throw new Error("Main drawing pane diagnostics are missing on the chart canvas");
      const pane = JSON.parse(raw) as MainPaneFractions;
      if (!(pane.bottomFraction > pane.topFraction) || !(pane.rightFraction > pane.leftFraction)) {
        throw new Error(`Invalid main pane fractions: ${raw}`);
      }
      return pane;
    };
    const pane = parsePane();
    const paneXFraction = pane.leftFraction + (pane.rightFraction - pane.leftFraction) * clamp(x, 0.08, 0.92);
    const paneYFraction = pane.topFraction + (pane.bottomFraction - pane.topFraction) * clamp(y, 0.12, 0.88);
    const initial = canvas.getBoundingClientRect();
    const intendedPageY = initial.top + window.scrollY + initial.height * paneYFraction;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(window.scrollX, clamp(intendedPageY - window.innerHeight * 0.35, 0, maxScroll));
    const rect = canvas.getBoundingClientRect();
    const provisionalY = rect.top + rect.height * paneYFraction;
    if (provisionalY < 8 || provisionalY > window.innerHeight - 8) {
      window.scrollTo(window.scrollX, clamp(window.scrollY + (provisionalY - window.innerHeight * 0.35), 0, maxScroll));
    }
    const settled = canvas.getBoundingClientRect();
    const settledX = settled.left + settled.width * paneXFraction;
    const settledY = settled.top + settled.height * paneYFraction;
    const hit = document.elementFromPoint(settledX, settledY);
    const targetIsCanvas = hit === canvas || (hit !== null && canvas.contains(hit));
    const insidePrimaryPane = paneXFraction >= pane.leftFraction && paneXFraction <= pane.rightFraction
      && paneYFraction >= pane.topFraction && paneYFraction <= pane.bottomFraction;
    const insideVisualViewport = settledX >= 0 && settledX <= window.innerWidth && settledY >= 0 && settledY <= window.innerHeight;
    const record = {
      cssRect: { left: finite(settled.left), top: finite(settled.top), width: finite(settled.width), height: finite(settled.height) },
      backingSize: { width: canvas.width, height: canvas.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: finite(window.scrollX), y: finite(window.scrollY) },
      requestedPaneFraction: { x, y },
      resolvedCanvasFraction: { x: finite(paneXFraction), y: finite(paneYFraction) },
      mainPane: pane,
      canvasLogicalPoint: { x: finite(settledX - settled.left), y: finite(settledY - settled.top) },
      backingPoint: {
        x: finite((settledX - settled.left) * canvas.width / Math.max(settled.width, 1)),
        y: finite((settledY - settled.top) * canvas.height / Math.max(settled.height, 1)),
      },
      clientPoint: { x: finite(settledX), y: finite(settledY) },
      insideVisualViewport,
      insidePrimaryPane,
      hitTarget: hit === null ? null : `${hit.tagName.toLowerCase()}${(hit as HTMLElement).className ? `.${String((hit as HTMLElement).className).trim().split(/\s+/u).slice(0, 2).join(".")}` : ""}`,
      targetIsCanvas,
    };
    const win = window as unknown as Record<string, unknown>;
    const previous = Array.isArray(win[diagnosticsKey]) ? win[diagnosticsKey] as unknown[] : [];
    previous.push(record);
    win[diagnosticsKey] = previous.slice(-8);
    if (!record.insideVisualViewport || !record.targetIsCanvas || !record.insidePrimaryPane) {
      throw new Error(`Drawing point is not a visible primary-pane Canvas target: ${JSON.stringify(record)}`);
    }
    return { x: settledX, y: settledY };
  }, { x: xFraction, y: yFraction, selector: canvasSelector, diagnosticsKey: DRAWING_DIAGNOSTICS_KEY });
  // Prefer the Playwright project touch capability over navigator.maxTouchPoints.
  // Managed Mobile Safari can report maxTouchPoints === 0 even when hasTouch is true.
  const useTouch = base.info().project.use.hasTouch === true;
  if (useTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

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
      const drawingInteraction = (window as unknown as Record<string, Record<string, unknown>[] | undefined>)["__openklineDrawingDiagnostics"]?.slice(-8) ?? null;
      const inputTrace = (window as unknown as Record<string, Record<string, unknown>[] | undefined>)["__openklineInputDiagnostics"]?.slice(-40) ?? [];
      const activeSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Active chart panel"]');
      const canvasMetrics = Array.from(document.querySelectorAll("canvas")).slice(0, 4).map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return { cssWidth: numberOrNull(rect.width), cssHeight: numberOrNull(rect.height), backingWidth: canvas.width, backingHeight: canvas.height };
      });
      const liveTexts = Array.from(document.querySelectorAll('[aria-live="polite"]')).slice(0, 8).map((element) => (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 240));
      const paperPanel = document.querySelector<HTMLElement>('[aria-label^="Paper trading for "]');
      const alertPanel = Array.from(document.querySelectorAll<HTMLDetailsElement>("details")).find((details) => (details.querySelector("summary")?.textContent ?? "").trim().startsWith("Alerts"));
      const alertNames = alertPanel === undefined ? [] : Array.from(alertPanel.querySelectorAll<HTMLElement>('[aria-label^="Remove "]')).map((button) => button.getAttribute("aria-label")?.replace(/^Remove /u, "") ?? "");
      const panels = Array.from(document.querySelectorAll("[data-panel-id]")).slice(0, 8).map((panel) => ({
        panelId: panel.getAttribute("data-panel-id"),
        className: panel.className,
        visible: visible(panel),
        rect: (() => { const rect = panel.getBoundingClientRect(); return { left: numberOrNull(rect.left), top: numberOrNull(rect.top), width: numberOrNull(rect.width), height: numberOrNull(rect.height) }; })(),
        display: getComputedStyle(panel).display,
      }));
      const dialogRoot = document.querySelector<HTMLElement>("[data-studio-dialog-open='true']");
      const dialogSection = dialogRoot?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
      const dialogInput = dialogSection?.querySelector<HTMLInputElement>('input[aria-label="Dialog value"]') ?? null;
      const focusableInDialog = dialogSection === null
        ? []
        : Array.from(dialogSection.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])"))
          .slice(0, 8)
          .map((element) => describe(element));
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
        targeted: {
          drawing: {
            canvasMetrics,
            summaries: Array.from(document.querySelectorAll("details summary")).map((summary) => (summary.textContent ?? "").trim()).filter((text) => text.startsWith("Drawings")),
            liveTexts,
          },
          paperTrading: paperPanel === null ? null : {
            accountState: paperPanel.dataset.paperAccountState ?? null,
            sessionId: paperPanel.dataset.paperSessionId ?? null,
            inputValue: paperPanel.dataset.paperInputValue ?? null,
            submitQuantity: paperPanel.dataset.paperSubmitQuantity ?? null,
            submitMarketPrice: paperPanel.dataset.paperSubmitMarketPrice ?? null,
            submitEstimatedNotional: paperPanel.dataset.paperSubmitEstimatedNotional ?? null,
            submitOutcome: paperPanel.dataset.paperSubmitOutcome ?? null,
            submitRejectionCode: paperPanel.dataset.paperSubmitRejectionCode ?? null,
            orderCount: paperPanel.dataset.paperOrderCount ?? null,
            orderStatuses: paperPanel.dataset.paperOrderStatuses ?? null,
            rows: Array.from(paperPanel.querySelectorAll("tbody tr")).slice(0, 8).map((row) => (row.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 180)),
            notice: paperPanel.querySelector('[aria-live="polite"]')?.textContent?.trim().slice(0, 240) ?? null,
          },
          alerts: alertPanel === undefined ? null : {
            open: alertPanel.open,
            inputValue: alertPanel.querySelector<HTMLInputElement>('input[aria-label="Alert name"]')?.value ?? null,
            diagnosticInputValue: alertPanel.dataset.alertInputValue ?? null,
            lastCreatedName: alertPanel.dataset.alertLastCreatedName ?? null,
            lastOutcome: alertPanel.dataset.alertLastOutcome ?? null,
            countText: alertPanel.querySelector("summary")?.textContent?.trim() ?? null,
            names: alertNames,
            removeControls: Array.from(alertPanel.querySelectorAll<HTMLButtonElement>('[aria-label^="Remove "]')).slice(0, 8).map((button) => button.getAttribute("aria-label")),
          },
          dialog: {
            open: dialogRoot !== null,
            kind: dialogRoot?.dataset.studioDialogKind ?? null,
            title: dialogSection?.dataset.studioDialogTitle ?? dialogSection?.querySelector("h2")?.textContent?.trim() ?? null,
            inputPresent: dialogInput !== null,
            inputValue: dialogInput?.value?.slice(0, 120) ?? null,
            activeElement: describe(document.activeElement),
            focusableOrder: focusableInDialog,
            mainPaneDiagnostics: Array.from(document.querySelectorAll("canvas")).slice(0, 2).map((canvas) => canvas.dataset.openklineMainPane ?? null),
          },
        },
        drawingInteraction: drawingInteraction === null ? null : { placements: drawingInteraction },
        inputTrace,
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
    await page.addInitScript(({ resizeKey, pointerKey, inputKey }) => {
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
      const inputTrace: Record<string, unknown>[] = [];
      const inputNodes = new WeakMap<Element, number>();
      let nextInputNode = 1;
      const recordInput = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !["Alert name", "Paper order quantity"].includes(target.getAttribute("aria-label") ?? "")) return;
        let nodeId = inputNodes.get(target);
        if (nodeId === undefined) { nodeId = nextInputNode++; inputNodes.set(target, nodeId); }
        inputTrace.push({ type: event.type, label: target.getAttribute("aria-label"), value: target.value.slice(0, 120), nodeId, focused: document.activeElement === target });
        inputTrace.splice(0, Math.max(0, inputTrace.length - 40));
      };
      for (const eventType of ["focus", "input", "change", "blur"] as const) document.addEventListener(eventType, recordInput, { capture: true });
      win[inputKey] = inputTrace;
    }, { resizeKey: RESIZE_DIAGNOSTICS_KEY, pointerKey: POINTER_DIAGNOSTICS_KEY, inputKey: INPUT_DIAGNOSTICS_KEY });
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

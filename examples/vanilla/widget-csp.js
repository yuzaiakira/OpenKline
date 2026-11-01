import { createOpenKlineWidget, WIDGET_CSS, STYLE_MARKER } from "../../dist/src/widget/index.js";

const candles = Array.from({ length: 24 }, (_, index) => {
  const close = 50 + index;
  return {
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.3,
    high: close + 0.8,
    low: close - 0.8,
    close,
    volume: 500 + index,
  };
});

const host = document.querySelector("#host");
const status = document.querySelector("#status");

const widget = createOpenKlineWidget({
  container: host,
  data: candles,
  dataIdentity: { symbol: "CSP-USD", timeframe: "1m" },
  chartOptions: { autoSize: true, theme: "light" },
  styles: { mode: "external" },
  features: {
    header: true,
    watchlist: false,
    comparison: false,
    replay: false,
  },
});

const report = () => ({
  styleCount: document.querySelectorAll(`style[${STYLE_MARKER}]`).length,
  hostStylesheetLinked: Boolean(document.querySelector('link[href*="widget-host-styles.css"]')),
  widgetStylesheetLinked: Boolean(document.querySelector('link[href*="widget-openkline.css"]')),
  widgetCssChars: WIDGET_CSS.length,
  status: widget.getState().status,
  remainingCanvases: host.querySelectorAll("canvas").length,
  destroyed: widget.getDiagnostics().destroyed,
});

status.textContent = JSON.stringify(report(), null, 2);

globalThis.__openklineWidgetCsp = {
  widget,
  STYLE_MARKER,
  WIDGET_CSS,
  report,
  destroy() {
    widget.destroy();
    status.textContent = JSON.stringify(report(), null, 2);
  },
};

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties, ForwardedRef, ReactElement } from "react";
import { createChart } from "openkline";
import type { Candle, Chart, ChartOptions, CrosshairMoveEvent } from "openkline";

export interface FinancialChartProps extends ChartOptions {
  candles?: readonly Candle[];
  className?: string;
  onCrosshairMove?: (event: CrosshairMoveEvent) => void;
  style?: CSSProperties;
}

export interface FinancialChartHandle {
  getChart(): Chart | null;
}

const FinancialChartImpl = (
  props: FinancialChartProps,
  ref: ForwardedRef<FinancialChartHandle>,
): ReactElement => {
  const { candles, className, onCrosshairMove, style, ...options } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const crosshairHandlerRef = useRef(onCrosshairMove);
  crosshairHandlerRef.current = onCrosshairMove;

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
  }), []);

  useEffect(() => {
    if (containerRef.current === null) {
      return undefined;
    }

    const chart = createChart(containerRef.current, options);
    chartRef.current = chart;
    const unsubscribe = chart.subscribe("crosshairMove", (event) => {
      crosshairHandlerRef.current?.(event);
    });

    return () => {
      unsubscribe();
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setData(candles ?? []);
  }, [candles]);

  useEffect(() => {
    chartRef.current?.setOptions(options);
  }, [options.autoSize, options.height, options.locale, options.pricePrecision, options.theme, options.timeZone, options.width]);

  return <div ref={containerRef} className={className} style={style} />;
};

export const FinancialChart = forwardRef(FinancialChartImpl);

export const FinancialChartComponent = FinancialChart;

declare module "openkline/widget-internal" {
  import type { Candle } from "openkline";

  export function createOpenKlineWidget(options: {
    container: HTMLElement;
    data?: readonly Candle[];
    dataIdentity?: { symbol?: string; timeframe?: string };
    chartOptions?: { autoSize?: boolean; theme?: "light" | "dark"; direction?: "ltr" | "rtl" };
    layout?: "single" | "two-horizontal" | "two-vertical" | "four-grid";
    styles?: { mode?: "inject" | "external"; nonce?: string };
    features?: Record<string, boolean>;
    storage?: {
      load(key: string, signal?: AbortSignal): Promise<string | unknown | null>;
      save(key: string, value: string, signal?: AbortSignal): Promise<void>;
      remove?(key: string, signal?: AbortSignal): Promise<void>;
    };
  }): {
    getState(): { status: string; layout: string; symbol: string | null };
    getDiagnostics(): { destroyed: boolean; canvasCount: number; pendingDataRequest: boolean };
    setLayout(layout: "single" | "two-horizontal" | "two-vertical" | "four-grid"): void;
    addIndicator(id: string, options?: object): string;
    subscribe(listener: (event: { type: string }) => void): () => void;
    destroy(): void;
  };
}

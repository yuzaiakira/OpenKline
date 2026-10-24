export type DrawingToolType =
  | "horizontal-line"
  | "vertical-line"
  | "trend-line"
  | "rectangle"
  | "fibonacci-retracement"
  | "text";

export interface DrawingPoint {
  readonly time: number;
  readonly price: number;
}

export interface DrawingStyle {
  readonly color?: string;
  readonly fillColor?: string;
  readonly textColor?: string;
  readonly lineWidth?: number;
  readonly visible?: boolean;
  readonly locked?: boolean;
}

export interface DrawingOptions {
  readonly id?: string;
  readonly points: readonly DrawingPoint[];
  readonly style?: DrawingStyle;
  readonly text?: string;
  readonly zIndex?: number;
}

export interface DrawingStartOptions {
  readonly style?: DrawingStyle;
  readonly text?: string;
  readonly zIndex?: number;
}

export interface DrawingSnapshot {
  readonly id: string;
  readonly type: DrawingToolType | string;
  readonly points: readonly DrawingPoint[];
  readonly style: DrawingStyle;
  readonly text?: string;
  readonly zIndex: number;
}

export interface DrawingCoordinateConverter {
  xForTime(time: number): number;
  yForPrice(price: number): number;
  timeForX(x: number): number;
  priceForY(y: number): number;
}

export interface DrawingBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export type DrawingGeometry =
  | { readonly kind: "line"; readonly from: { x: number; y: number }; readonly to: { x: number; y: number }; readonly label?: string }
  | { readonly kind: "rectangle"; readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  | { readonly kind: "text"; readonly x: number; readonly y: number; readonly text: string };

export interface DrawingRenderItem {
  readonly snapshot: DrawingSnapshot;
  readonly geometries: readonly DrawingGeometry[];
}

export interface DrawingToolDefinition {
  readonly type: string;
  readonly minPoints: number;
  readonly maxPoints: number;
  validate(snapshot: DrawingSnapshot): void;
  getGeometry(snapshot: DrawingSnapshot, converter: DrawingCoordinateConverter, bounds: DrawingBounds): readonly DrawingGeometry[];
  hitTest(snapshot: DrawingSnapshot, x: number, y: number, converter: DrawingCoordinateConverter, bounds: DrawingBounds, tolerance: number): number;
}

export interface DrawingHit {
  readonly id: string;
  readonly pointIndex: number | null;
}

export interface DrawingApi {
  readonly id: string;
  readonly type: string;
  getSnapshot(): DrawingSnapshot;
  setPoints(points: readonly DrawingPoint[]): void;
  setStyle(style: DrawingStyle): void;
  setVisible(visible: boolean): void;
  setLocked(locked: boolean): void;
  remove(): void;
}

export interface DrawingDocument {
  readonly version: 1;
  readonly drawings: readonly DrawingSnapshot[];
}

export class DrawingValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DrawingValidationError";
  }
}

export class DrawingLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DrawingLifecycleError";
  }
}

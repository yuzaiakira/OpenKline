export interface KlineScriptSource {
  readonly language: "KlineScript";
  readonly version: 1;
  readonly source: string;
}

export type KlineScriptLiteral = number | string | boolean | null;

export type KlineScriptExpression =
  | { readonly kind: "literal"; readonly value: KlineScriptLiteral }
  | { readonly kind: "identifier"; readonly name: string }
  | { readonly kind: "call"; readonly callee: string; readonly arguments: readonly KlineScriptExpression[] };

export interface KlineScriptIndicatorDeclaration {
  readonly kind: "indicator";
  readonly name: string;
  readonly indicatorId: string;
  readonly parameters: Readonly<Record<string, KlineScriptExpression>>;
}

export interface KlineScriptPlotDeclaration {
  readonly kind: "plot";
  readonly name: string;
  readonly expression: KlineScriptExpression;
  readonly style?: Readonly<Record<string, KlineScriptExpression>>;
}

export interface KlineScriptDrawingDeclaration {
  readonly kind: "drawing";
  readonly toolType: string;
  readonly points: readonly KlineScriptExpression[];
  readonly style?: Readonly<Record<string, KlineScriptExpression>>;
}

export type KlineScriptDeclaration =
  | KlineScriptIndicatorDeclaration
  | KlineScriptPlotDeclaration
  | KlineScriptDrawingDeclaration;

export interface KlineScriptProgram {
  readonly language: "KlineScript";
  readonly version: 1;
  readonly declarations: readonly KlineScriptDeclaration[];
}

export interface KlineScriptExtensionBinding {
  readonly extensionId: string;
  readonly apiVersion: 1;
  readonly capabilities: readonly ("indicator" | "drawing" | "series")[];
}

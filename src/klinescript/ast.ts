export interface SourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export type KlineScriptLiteralValue = number | string | boolean | null;

export interface AstNode {
  readonly span: SourceSpan;
  readonly nodeId: number;
}

export interface LiteralExpression extends AstNode {
  readonly kind: "literal";
  readonly value: KlineScriptLiteralValue;
}

export interface IdentifierExpression extends AstNode {
  readonly kind: "identifier";
  readonly name: string;
}

export interface UnaryExpression extends AstNode {
  readonly kind: "unary";
  readonly operator: "+" | "-" | "not";
  readonly expression: Expression;
}

export type BinaryOperator =
  | "+" | "-" | "*" | "/" | "%"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "and" | "or";

export interface BinaryExpression extends AstNode {
  readonly kind: "binary";
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

export interface ConditionalExpression extends AstNode {
  readonly kind: "conditional";
  readonly condition: Expression;
  readonly whenTrue: Expression;
  readonly whenFalse: Expression;
}

export interface IndexExpression extends AstNode {
  readonly kind: "index";
  readonly target: Expression;
  readonly index: Expression;
}

export interface CallArgument {
  readonly name?: string;
  readonly expression: Expression;
  readonly span: SourceSpan;
}

export interface CallExpression extends AstNode {
  readonly kind: "call";
  readonly namespace?: "ta" | "input";
  readonly name: string;
  readonly arguments: readonly CallArgument[];
}

export interface MemberExpression extends AstNode {
  readonly kind: "member";
  readonly target: Expression;
  readonly name: string;
}

export type Expression =
  | LiteralExpression
  | IdentifierExpression
  | UnaryExpression
  | BinaryExpression
  | ConditionalExpression
  | IndexExpression
  | CallExpression
  | MemberExpression;

export interface IndicatorStatement extends AstNode {
  readonly kind: "indicator";
  readonly arguments: readonly CallArgument[];
}

export interface AssignmentStatement extends AstNode {
  readonly kind: "assignment";
  readonly name: string;
  readonly nameSpan: SourceSpan;
  readonly expression: Expression;
}

export interface PlotStatement extends AstNode {
  readonly kind: "plot";
  readonly arguments: readonly CallArgument[];
}

export interface HlineStatement extends AstNode {
  readonly kind: "hline";
  readonly arguments: readonly CallArgument[];
}

export type Statement = IndicatorStatement | AssignmentStatement | PlotStatement | HlineStatement;

export interface ParsedProgram {
  readonly kind: "program";
  readonly span: SourceSpan;
  readonly statements: readonly Statement[];
}

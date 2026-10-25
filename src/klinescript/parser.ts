import type {
  AssignmentStatement,
  BinaryOperator,
  CallArgument,
  Expression,
  HlineStatement,
  IdentifierExpression,
  IndicatorStatement,
  ParsedProgram,
  PlotStatement,
  SourceSpan,
  Statement,
} from "./ast.js";
import { diagnostic, type KlineScriptDiagnostic, zeroSpan } from "./diagnostics.js";
import type { KlineScriptToken, KlineScriptTokenKind } from "./lexer.js";

export interface ParseResult {
  readonly program: ParsedProgram;
  readonly diagnostics: readonly KlineScriptDiagnostic[];
}

export function parseKlineScript(tokens: readonly KlineScriptToken[]): ParseResult {
  return new Parser(tokens).parse();
}

class Parser {
  private readonly diagnostics: KlineScriptDiagnostic[] = [];
  private readonly statements: Statement[] = [];
  private cursor = 0;
  private nextNodeId = 1;

  public constructor(private readonly tokens: readonly KlineScriptToken[]) {}

  public parse(): ParseResult {
    while (!this.is("eof")) {
      this.skipLineBoundaries();
      if (this.is("eof")) break;
      const statement = this.parseStatement();
      if (statement !== null) this.statements.push(statement);
      if (!this.is("eof") && !this.matchValue(";")) {
        if (!this.is("newline")) this.error("KS2001", "Expected a line boundary after the statement", this.current().span);
      }
      this.skipLineBoundaries();
    }
    const span = this.statements.length === 0
      ? zeroSpan()
      : { start: this.statements[0]!.span.start, end: this.statements[this.statements.length - 1]!.span.end };
    return { program: { kind: "program", span, statements: this.statements }, diagnostics: this.diagnostics };
  }

  private parseStatement(): Statement | null {
    if (this.isIdentifier("indicator") || this.isIdentifier("plot") || this.isIdentifier("hline")) {
      const keyword = this.current().value;
      const expression = this.parseExpression();
      if (expression?.kind !== "call" || expression.namespace !== undefined || expression.name !== keyword) {
        this.error("KS2002", `${keyword} must be called as a statement`, expression?.span ?? this.current().span);
        this.recoverLine();
        return null;
      }
      if (keyword === "indicator") return { kind: "indicator", arguments: expression.arguments, span: expression.span, nodeId: expression.nodeId } satisfies IndicatorStatement;
      if (keyword === "plot") return { kind: "plot", arguments: expression.arguments, span: expression.span, nodeId: expression.nodeId } satisfies PlotStatement;
      return { kind: "hline", arguments: expression.arguments, span: expression.span, nodeId: expression.nodeId } satisfies HlineStatement;
    }

    if (this.is("identifier") && this.peekValue(1) === "=") {
      const nameToken = this.advance();
      this.advance();
      const expression = this.parseExpression();
      if (expression === null) {
        this.recoverLine();
        return null;
      }
      return {
        kind: "assignment",
        name: nameToken.value,
        nameSpan: nameToken.span,
        expression,
        span: { start: nameToken.span.start, end: expression.span.end },
        nodeId: this.allocateNode(),
      } satisfies AssignmentStatement;
    }

    this.error("KS2003", "Only assignments and indicator, plot, or hline calls are allowed at the top level", this.current().span);
    this.recoverLine();
    return null;
  }

  private parseExpression(): Expression | null {
    return this.parseConditional();
  }

  private parseConditional(): Expression | null {
    const condition = this.parseBinary(0);
    if (condition === null || !this.matchValue("?")) return condition;
    const whenTrue = this.parseExpression();
    this.expectValue(":", "KS2004", "Expected ':' in conditional expression");
    const whenFalse = this.parseExpression();
    if (whenTrue === null || whenFalse === null) return condition;
    return {
      kind: "conditional",
      condition,
      whenTrue,
      whenFalse,
      span: { start: condition.span.start, end: whenFalse.span.end },
      nodeId: this.allocateNode(),
    };
  }

  private parseBinary(minPrecedence: number): Expression | null {
    let left = this.parseUnary();
    if (left === null) return null;
    while (true) {
      const operator = this.binaryOperator(this.current());
      if (operator === null) break;
      const precedence = precedenceOf(operator);
      if (precedence < minPrecedence) break;
      this.advance();
      const right = this.parseBinary(precedence + 1);
      if (right === null) return left;
      left = {
        kind: "binary",
        operator,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
        nodeId: this.allocateNode(),
      };
    }
    return left;
  }

  private parseUnary(): Expression | null {
    const token = this.current();
    if (token.value === "+" || token.value === "-" || (token.kind === "identifier" && token.value === "not")) {
      this.advance();
      const expression = this.parseUnary();
      if (expression === null) return null;
      return {
        kind: "unary",
        operator: token.value as "+" | "-" | "not",
        expression,
        span: { start: token.span.start, end: expression.span.end },
        nodeId: this.allocateNode(),
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expression | null {
    let expression = this.parsePrimary();
    if (expression === null) return null;
    while (true) {
      if (this.matchValue("[")) {
        const index = this.parseExpression();
        const close = this.expectValue("]", "KS2005", "Expected ']' after historical index");
        if (index === null) return expression;
        expression = {
          kind: "index",
          target: expression,
          index,
          span: { start: expression.span.start, end: close?.span.end ?? index.span.end },
          nodeId: this.allocateNode(),
        };
        continue;
      }
      if (this.matchValue(".")) {
        const member = this.expectIdentifier("KS2006", "Expected a member name after '.'");
        if (member === null) return expression;
        expression = {
          kind: "member",
          target: expression,
          name: member.value,
          span: { start: expression.span.start, end: member.span.end },
          nodeId: this.allocateNode(),
        };
        continue;
      }
      break;
    }
    return expression;
  }

  private parsePrimary(): Expression | null {
    const token = this.current();
    if (token.kind === "number") {
      this.advance();
      return this.node({ kind: "literal", value: Number(token.value), span: token.span });
    }
    if (token.kind === "string") {
      this.advance();
      return this.node({ kind: "literal", value: token.value, span: token.span });
    }
    if (token.kind === "identifier") {
      this.advance();
      if (["true", "false", "True", "False", "na", "None"].includes(token.value)) {
        const value = token.value === "na" || token.value === "None" ? null : token.value === "true" || token.value === "True";
        return this.node({ kind: "literal", value, span: token.span });
      }
      let namespace: "ta" | "input" | undefined;
      let name = token.value;
      let span = token.span;
      if ((token.value === "ta" || token.value === "input") && this.current().value === "." && this.tokens[this.cursor + 1]?.kind === "identifier" && this.tokens[this.cursor + 2]?.value === "(") {
        this.advance();
        const member = this.expectIdentifier("KS2007", "Expected an intrinsic name after namespace '.'");
        if (member === null) return null;
        namespace = token.value;
        name = member.value;
        span = { start: token.span.start, end: member.span.end };
      }
      if (this.matchValue("(")) {
        const args = this.parseArguments();
        return this.node({
          kind: "call",
          ...(namespace === undefined ? {} : { namespace }),
          name,
          arguments: args,
          span: { start: span.start, end: this.previous().span.end },
        });
      }
      if (namespace !== undefined) {
        this.error("KS2008", "A namespace must be followed by a call", span);
        return null;
      }
      return this.node({ kind: "identifier", name, span } as IdentifierExpression);
    }
    if (this.matchValue("(")) {
      const expression = this.parseExpression();
      this.expectValue(")", "KS2009", "Expected ')' after expression");
      return expression;
    }
    this.error("KS2010", "Expected an expression", token.span);
    return null;
  }

  private parseArguments(): CallArgument[] {
    const argumentsList: CallArgument[] = [];
    if (this.matchValue(")")) return argumentsList;
    while (!this.is("eof")) {
      const start = this.current().span.start;
      let name: string | undefined;
      if (this.is("identifier") && this.peekValue(1) === "=") {
        name = this.advance().value;
        this.advance();
      }
      const expression = this.parseExpression();
      if (expression !== null) {
        argumentsList.push({
          ...(name === undefined ? {} : { name }),
          expression,
          span: { start, end: expression.span.end },
        });
      }
      if (this.matchValue(")")) break;
      if (!this.matchValue(",")) {
        this.error("KS2011", "Expected ',' or ')' in argument list", this.current().span);
        this.recoverCall();
        break;
      }
      if (this.is("newline")) {
        this.error("KS2012", "Arguments cannot continue on a new line", this.current().span);
        break;
      }
    }
    return argumentsList;
  }

  private binaryOperator(token: KlineScriptToken): BinaryOperator | null {
    if (["+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">="].includes(token.value)) return token.value as BinaryOperator;
    if (token.kind === "identifier" && (token.value === "and" || token.value === "or")) return token.value;
    return null;
  }

  private node<T extends Omit<Expression, "nodeId">>(node: T): T & { readonly nodeId: number } {
    return { ...node, nodeId: this.allocateNode() };
  }

  private allocateNode(): number {
    return this.nextNodeId++;
  }

  private current(): KlineScriptToken {
    return this.tokens[this.cursor] ?? { kind: "eof", value: "", span: zeroSpan() };
  }

  private previous(): KlineScriptToken {
    return this.tokens[Math.max(this.cursor - 1, 0)] ?? this.current();
  }

  private advance(): KlineScriptToken {
    const token = this.current();
    this.cursor = Math.min(this.cursor + 1, this.tokens.length);
    return token;
  }

  private is(kind: KlineScriptTokenKind): boolean {
    return this.current().kind === kind;
  }

  private isIdentifier(value: string): boolean {
    return this.current().kind === "identifier" && this.current().value === value;
  }

  private peekValue(distance: number): string | undefined {
    return this.tokens[this.cursor + distance]?.value;
  }

  private matchValue(value: string): boolean {
    if (this.current().value !== value) return false;
    this.advance();
    return true;
  }

  private expectValue(value: string, code: string, message: string): KlineScriptToken | null {
    if (this.current().value === value) return this.advance();
    this.error(code, message, this.current().span);
    return null;
  }

  private expectIdentifier(code: string, message: string): KlineScriptToken | null {
    if (this.current().kind === "identifier") return this.advance();
    this.error(code, message, this.current().span);
    return null;
  }

  private skipLineBoundaries(): void {
    while (this.is("newline") || this.current().value === ";") this.advance();
  }

  private recoverLine(): void {
    while (!this.is("eof") && !this.is("newline")) this.advance();
  }

  private recoverCall(): void {
    while (!this.is("eof") && !this.is("newline") && this.current().value !== ")") this.advance();
    if (this.current().value === ")") this.advance();
  }

  private error(code: string, message: string, span: SourceSpan): void {
    this.diagnostics.push(diagnostic(code, message, span));
  }
}

function precedenceOf(operator: BinaryOperator): number {
  if (operator === "or") return 1;
  if (operator === "and") return 2;
  if (["==", "!="].includes(operator)) return 3;
  if (["<", "<=", ">", ">="].includes(operator)) return 4;
  if (["+", "-"].includes(operator)) return 5;
  return 6;
}

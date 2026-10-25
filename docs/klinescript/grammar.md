# KlineScript v0.1 grammar

The grammar below is line-oriented. `NEWLINE` and `;` separate statements;
blank lines are ignored.

```ebnf
program       ::= boundary* indicator-statement boundary* statement* boundary* EOF
statement     ::= assignment | plot-statement | hline-statement
assignment    ::= IDENTIFIER "=" expression
indicator-statement ::= "indicator" "(" argument-list ")"
plot-statement ::= "plot" "(" argument-list ")"
hline-statement ::= "hline" "(" argument-list ")"
argument-list ::= [ argument ( "," argument )* ]
argument      ::= [ IDENTIFIER "=" ] expression
expression    ::= conditional
conditional   ::= disjunction [ "?" expression ":" expression ]
disjunction   ::= conjunction ( "or" conjunction )*
conjunction   ::= equality ( "and" equality )*
equality      ::= comparison ( ( "==" | "!=" ) comparison )*
comparison    ::= sum ( ( "<" | "<=" | ">" | ">=" ) sum )*
sum           ::= product ( ( "+" | "-" ) product )*
product       ::= unary ( ( "*" | "/" | "%" ) unary )*
unary         ::= ( "+" | "-" | "not" ) unary | postfix
postfix       ::= primary ( "[" expression "]" | "." IDENTIFIER )*
primary       ::= NUMBER | STRING | "True" | "False" | "None"
                | IDENTIFIER | intrinsic-call | "(" expression ")"
intrinsic-call ::= ( "ta" | "input" ) "." IDENTIFIER "(" argument-list ")"
```

The parser recovers at line boundaries for editor diagnostics. A program with
any error diagnostic is not executable. Namespaces are recognized only for the
fixed `ta` and `input` tokens; the checker rejects every unregistered call.


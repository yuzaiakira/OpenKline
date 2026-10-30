import * as ts from "typescript";

/**
 * Development-only TypeScript AST helpers for explaining a strict API hash
 * change. The package runtime does not import this module and the historical
 * API baseline remains authoritative for the release gate.
 */

function normalize(value) {
  return value
    .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*$/, "")
    .trim();
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function isPublicMember(node) {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword) || hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return false;
  return node.name?.kind !== ts.SyntaxKind.PrivateIdentifier;
}

function memberName(node, sourceFile) {
  if (ts.isCallSignatureDeclaration(node)) return "call";
  if (ts.isConstructSignatureDeclaration(node)) return "construct";
  if (ts.isIndexSignatureDeclaration(node)) return "index";
  return node.name?.getText(sourceFile) ?? "<anonymous>";
}

function propertySignature(node, sourceFile) {
  const readonly = hasModifier(node, ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : "";
  const optional = node.questionToken === undefined ? "" : "?";
  const type = node.type?.getText(sourceFile) ?? "unknown";
  return `${readonly}${memberName(node, sourceFile)}${optional}: ${type}`;
}

function methodSignature(node, sourceFile) {
  const start = node.getStart(sourceFile);
  const end = node.body?.getStart(sourceFile) ?? node.end;
  return normalize(sourceFile.text.slice(start, end));
}

function memberDescriptor(node, sourceFile) {
  const name = memberName(node, sourceFile);
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return {
      name,
      kind: "property",
      optional: node.questionToken !== undefined,
      type: node.type?.getText(sourceFile) ?? "unknown",
      signature: normalize(propertySignature(node, sourceFile)),
    };
  }
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    return {
      name,
      kind: "method",
      optional: node.questionToken !== undefined,
      type: node.type?.getText(sourceFile) ?? "unknown",
      signature: methodSignature(node, sourceFile),
    };
  }
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return {
      name,
      kind: "accessor",
      optional: false,
      type: node.type?.getText(sourceFile) ?? "unknown",
      signature: methodSignature(node, sourceFile),
    };
  }
  return {
    name,
    kind: "signature",
    optional: false,
    type: "unknown",
    signature: normalize(node.getText(sourceFile)),
  };
}

function collectMembers(declaration, sourceFile) {
  const members = new Map();
  for (const member of declaration.members ?? []) {
    if (ts.isConstructorDeclaration(member) || !isPublicMember(member)) continue;
    const descriptor = memberDescriptor(member, sourceFile);
    const entries = members.get(descriptor.name) ?? [];
    entries.push(descriptor);
    members.set(descriptor.name, entries);
  }
  return members;
}

function namedDeclaration(sourceFile, name, expectedKind) {
  return sourceFile.statements.find((statement) => {
    if (!ts.isClassDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) return false;
    if (expectedKind === "class" && !ts.isClassDeclaration(statement)) return false;
    if (expectedKind === "interface" && !ts.isInterfaceDeclaration(statement)) return false;
    return statement.name?.text === name;
  }) ?? null;
}

function declarationKind(declaration) {
  if (declaration === null) return null;
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  return "unknown";
}

function compareMemberGroup(name, beforeMembers, afterMembers, declarationKindName) {
  const before = [...beforeMembers];
  const after = [...afterMembers];
  const matchedBefore = new Set();
  const matchedAfter = new Set();
  for (let afterIndex = 0; afterIndex < after.length; afterIndex += 1) {
    const index = before.findIndex((entry, beforeIndex) => !matchedBefore.has(beforeIndex) && entry.signature === after[afterIndex].signature);
    if (index !== -1) {
      matchedBefore.add(index);
      matchedAfter.add(afterIndex);
    }
  }
  const added = after.filter((_, index) => !matchedAfter.has(index));
  const removed = before.filter((_, index) => !matchedBefore.has(index));
  const findings = [];
  const additive = [];

  for (const entry of added) {
    if (removed.length === 0) {
      const requiredInterfaceProperty = declarationKindName === "interface" && entry.kind === "property" && !entry.optional;
      const addition = {
        name,
        kind: entry.kind,
        signature: entry.signature,
        category: requiredInterfaceProperty
          ? "required-member-addition"
          : entry.kind === "method" && declarationKindName === "class"
          ? "additive-method"
          : entry.kind === "property" && entry.optional
            ? "additive-optional-member"
            : "additive-member",
        ...(requiredInterfaceProperty ? { breaking: true } : {}),
      };
      additive.push(addition);
      if (requiredInterfaceProperty) findings.push({ ...addition, category: "required-member-addition", breaking: true });
    }
  }

  if (removed.length > 0 && added.length === 0) {
    for (const entry of removed) {
      findings.push({
        name,
        kind: entry.kind,
        signature: entry.signature,
        category: before.length > 1 ? "removed-overload" : "removed-member",
        breaking: true,
      });
    }
  } else if (removed.length > 0 && added.length > 0) {
    const beforeProperty = before.length === 1 && before[0]?.kind === "property" ? before[0] : null;
    const afterProperty = after.length === 1 && after[0]?.kind === "property" ? after[0] : null;
    const category = beforeProperty?.optional === true && afterProperty?.optional === false
      ? "optional-to-required"
      : before.length > 1 || after.length > 1
        ? "changed-overload"
        : "changed-signature";
    findings.push({
      name,
      category,
      before: removed.map((entry) => entry.signature),
      after: added.map((entry) => entry.signature),
      breaking: true,
    });
  }

  return { added: additive, findings };
}

/**
 * Compare one named class or interface without resolving imports. This is
 * intentionally structural: the strict declaration hash checker remains the
 * final policy gate, while this result explains whether a change is additive
 * or potentially breaking.
 */
export function compareDeclarationSurfaces(beforeText, afterText, name, expectedKind) {
  const beforeSource = ts.createSourceFile(`${name}.before.ts`, beforeText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const afterSource = ts.createSourceFile(`${name}.after.ts`, afterText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const beforeDeclaration = namedDeclaration(beforeSource, name, expectedKind);
  const afterDeclaration = namedDeclaration(afterSource, name, expectedKind);
  if (beforeDeclaration === null || afterDeclaration === null) {
    return {
      name,
      expectedKind,
      beforeKind: declarationKind(beforeDeclaration),
      afterKind: declarationKind(afterDeclaration),
      added: [],
      removed: [{ name, category: beforeDeclaration === null ? "missing-before-declaration" : "missing-after-declaration", breaking: true }],
      changed: [],
      breaking: true,
    };
  }

  const beforeMembers = collectMembers(beforeDeclaration, beforeSource);
  const afterMembers = collectMembers(afterDeclaration, afterSource);
  const added = [];
  const removed = [];
  const changed = [];
  const names = new Set([...beforeMembers.keys(), ...afterMembers.keys()]);
  for (const member of [...names].sort()) {
    const result = compareMemberGroup(member, beforeMembers.get(member) ?? [], afterMembers.get(member) ?? [], expectedKind);
    added.push(...result.added);
    for (const finding of result.findings) {
      if (finding.category === "removed-member" || finding.category === "removed-overload") removed.push(finding);
      else changed.push(finding);
    }
  }
  return {
    name,
    expectedKind,
    beforeKind: declarationKind(beforeDeclaration),
    afterKind: declarationKind(afterDeclaration),
    added,
    removed,
    changed,
    breaking: removed.length > 0 || changed.length > 0,
  };
}

function rootExportEntries(sourceFile) {
  const entries = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const module = statement.moduleSpecifier?.text ?? ".";
      if (statement.exportClause === undefined) {
        entries.push({ name: "*", kind: "runtime", module });
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        const kind = statement.isTypeOnly || element.isTypeOnly ? "type" : "runtime";
        entries.push({ name: element.name.text, kind, module });
      }
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (statement.name !== undefined) {
      const kind = ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ? "type" : "runtime";
      entries.push({ name: statement.name.text, kind, module: "." });
    }
  }
  return entries.sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`));
}

/** Compare direct/re-exported names from a package root index. */
export function compareRootExports(beforeText, afterText) {
  const beforeSource = ts.createSourceFile("index.before.ts", beforeText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const afterSource = ts.createSourceFile("index.after.ts", afterText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const before = rootExportEntries(beforeSource);
  const after = rootExportEntries(afterSource);
  const key = (entry) => `${entry.kind}:${entry.name}`;
  const beforeMap = new Map(before.map((entry) => [key(entry), entry]));
  const afterMap = new Map(after.map((entry) => [key(entry), entry]));
  const added = after.filter((entry) => !beforeMap.has(key(entry)));
  const removed = before.filter((entry) => !afterMap.has(key(entry)));
  const changed = after.filter((entry) => {
    const previous = beforeMap.get(key(entry));
    return previous !== undefined && previous.module !== entry.module;
  }).map((entry) => ({ before: beforeMap.get(key(entry)), after: entry, breaking: true }));
  return { before, after, added, removed, changed, breaking: removed.length > 0 || changed.length > 0 };
}

/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const path = require('node:path');
const ts = require('typescript');

const MUTATION_METHODS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const NESTED_MUTATION_OPERATORS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'connect', 'connectOrCreate', 'disconnect', 'set']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function isFunctionInitializer(node) {
  return Boolean(node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)));
}

function isExportedHandler(statement) {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return HTTP_METHODS.has(statement.name.text)
      && (statement.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  }
  return ts.isVariableStatement(statement)
    && (statement.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    && statement.declarationList.declarations.some((declaration) => declaration.name
      && ts.isIdentifier(declaration.name)
      && HTTP_METHODS.has(declaration.name.text)
      && isFunctionInitializer(declaration.initializer));
}

function getHandler(statement) {
  if (ts.isFunctionDeclaration(statement)) return { name: statement.name.text, node: statement };
  const declaration = statement.declarationList.declarations.find((item) => item.name
    && ts.isIdentifier(item.name)
    && HTTP_METHODS.has(item.name.text)
    && isFunctionInitializer(item.initializer));
  return declaration ? { name: declaration.name.text, node: declaration.initializer } : null;
}

function resolveSourceModule(fromFile, specifier, root, fileByPath) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(root, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  const extensionless = /\.(?:[cm]?js|jsx)$/.test(base) ? base.replace(/\.(?:[cm]?js|jsx)$/, '') : base;
  const candidates = [
    base,
    `${extensionless}.ts`,
    `${extensionless}.tsx`,
    path.join(extensionless, 'index.ts'),
    path.join(extensionless, 'index.tsx'),
  ].map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => fileByPath.has(candidate)) || null;
}

function hasModifier(node, modifierKind) {
  return (node.modifiers || []).some((modifier) => modifier.kind === modifierKind);
}

function analyzeD1MutationBoundaries(sourceFiles, root) {
  const fileByPath = new Map(sourceFiles.map((file) => [path.resolve(file.filePath), file]));
  const modules = new Map();

  for (const [filePath, file] of fileByPath) {
    const source = ts.createSourceFile(filePath, file.text, ts.ScriptTarget.Latest, true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const moduleInfo = {
      source,
      functions: new Map(),
      exports: new Map(),
      imports: new Map(),
      namespaces: new Map(),
      prismaNames: new Set(['prisma']),
    };

    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const specifier = statement.moduleSpecifier.text;
        const targetFile = resolveSourceModule(filePath, specifier, root, fileByPath);
        if (targetFile) {
          const bindings = statement.importClause.namedBindings;
          if (statement.importClause.name) moduleInfo.imports.set(statement.importClause.name.text, { targetFile, exportName: 'default' });
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
              const exportName = (element.propertyName || element.name).text;
              moduleInfo.imports.set(element.name.text, { targetFile, exportName });
              if (exportName === 'prisma') moduleInfo.prismaNames.add(element.name.text);
            }
          } else if (bindings && ts.isNamespaceImport(bindings)) {
            moduleInfo.namespaces.set(bindings.name.text, targetFile);
          }
        }
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        const name = statement.name.text;
        moduleInfo.functions.set(name, statement);
        if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) moduleInfo.exports.set(name, { localName: name });
        if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) moduleInfo.exports.set('default', { localName: name });
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !isFunctionInitializer(declaration.initializer)) continue;
          const name = declaration.name.text;
          moduleInfo.functions.set(name, declaration.initializer);
          if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) moduleInfo.exports.set(name, { localName: name });
        }
      }
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && statement.exportClause
        && ts.isNamedExports(statement.exportClause)) {
        const targetFile = resolveSourceModule(filePath, statement.moduleSpecifier.text, root, fileByPath);
        if (targetFile) {
          for (const element of statement.exportClause.elements) {
            moduleInfo.exports.set(element.name.text, { targetFile, exportName: (element.propertyName || element.name).text });
          }
        }
      }
      if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
        moduleInfo.exports.set('default', { localName: statement.expression.text });
      }
    }
    modules.set(filePath, moduleInfo);
  }

  function resolveExport(filePath, exportName, seen = new Set()) {
    const key = `${filePath}#${exportName}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const moduleInfo = modules.get(filePath);
    if (!moduleInfo) return null;
    if (moduleInfo.functions.has(exportName)) return { filePath, node: moduleInfo.functions.get(exportName) };
    const target = moduleInfo.exports.get(exportName);
    if (!target) return null;
    if (target.localName) {
      const node = moduleInfo.functions.get(target.localName);
      return node ? { filePath, node } : null;
    }
    return resolveExport(target.targetFile, target.exportName, seen);
  }

  function getNestedFunctions(filePath, rootNode) {
    const nested = new Map();
    const source = modules.get(filePath).source;
    function visit(node, isRoot = false) {
      if (!isRoot && ts.isFunctionDeclaration(node)) {
        if (node.name) nested.set(node.name.text, node);
        return;
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFunctionInitializer(node.initializer)) {
        nested.set(node.name.text, node.initializer);
      }
      ts.forEachChild(node, (child) => visit(child, false));
    }
    visit(rootNode, true);
    return { nested, source };
  }

  function getMutationName(node, moduleInfo) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
    const method = node.expression.name.text;
    const modelExpression = node.expression.expression;
    if (!MUTATION_METHODS.has(method) || !ts.isPropertyAccessExpression(modelExpression)) return null;
    const prismaExpression = modelExpression.expression;
    if (!ts.isIdentifier(prismaExpression) || !moduleInfo.prismaNames.has(prismaExpression.text)) return null;
    return { model: modelExpression.name.text, method };
  }

  function summarizeFunction(filePath, functionNode) {
    const moduleInfo = modules.get(filePath);
    const { nested, source } = getNestedFunctions(filePath, functionNode);
    const mutations = [];
    const calls = [];

    function inspectData(node, insideData = false) {
      const nestedMutations = [];
      function visit(current, inData = false) {
        if (ts.isPropertyAssignment(current)) {
          const propertyName = current.name.getText(source).replace(/^['"]|['"]$/g, '');
          const nextInsideData = inData || propertyName === 'data';
          if (inData && NESTED_MUTATION_OPERATORS.has(propertyName)) {
            const line = source.getLineAndCharacterOfPosition(current.getStart(source)).line + 1;
            nestedMutations.push(`${path.relative(root, filePath)}:${line} ${propertyName}`);
          }
          ts.forEachChild(current, (child) => visit(child, nextInsideData));
          return;
        }
        ts.forEachChild(current, (child) => visit(child, inData));
      }
      visit(node, insideData);
      return nestedMutations;
    }

    function visit(node, isRoot = false, parent = null) {
      if (!isRoot && ts.isFunctionDeclaration(node)) return;
      if (!isRoot && isFunctionInitializer(node) && ts.isVariableDeclaration(parent) && parent.initializer === node) return;
      if (ts.isCallExpression(node)) {
        const mutation = getMutationName(node, moduleInfo);
        if (mutation) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          mutations.push({
            key: `${filePath}:${line}:${mutation.model}.${mutation.method}`,
            display: `${path.relative(root, filePath)}:${line} ${mutation.model}.${mutation.method}`,
            nested: node.arguments[0] ? inspectData(node.arguments[0]) : [],
          });
        } else if (ts.isIdentifier(node.expression)) {
          calls.push({ localName: node.expression.text });
        } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
          const namespaceFile = moduleInfo.namespaces.get(node.expression.expression.text);
          if (namespaceFile) calls.push({ targetFile: namespaceFile, exportName: node.expression.name.text });
        }
      }
      ts.forEachChild(node, (child) => visit(child, false, node));
    }
    visit(functionNode, true);
    return { mutations, calls, nested };
  }

  function collectMutations(filePath, functionNode, ancestry = new Set()) {
    const functionKey = `${filePath}#${functionNode.pos}`;
    if (ancestry.has(functionKey)) return { mutations: [], nestedMutations: [] };
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(functionKey);
    const summary = summarizeFunction(filePath, functionNode);
    const mutations = [...summary.mutations];
    const nestedMutations = summary.mutations.flatMap((mutation) => mutation.nested);

    for (const call of summary.calls) {
      let target;
      if (call.localName && summary.nested.has(call.localName)) {
        target = { filePath, node: summary.nested.get(call.localName) };
      } else if (call.localName && modules.get(filePath).functions.has(call.localName)) {
        target = { filePath, node: modules.get(filePath).functions.get(call.localName) };
      } else if (call.localName && modules.get(filePath).imports.has(call.localName)) {
        const imported = modules.get(filePath).imports.get(call.localName);
        target = resolveExport(imported.targetFile, imported.exportName);
      } else if (call.targetFile) {
        target = resolveExport(call.targetFile, call.exportName);
      }
      if (!target) continue;
      const result = collectMutations(target.filePath, target.node, nextAncestry);
      mutations.push(...result.mutations);
      nestedMutations.push(...result.nestedMutations);
    }
    return { mutations, nestedMutations };
  }

  const handlers = new Map();
  for (const [filePath, moduleInfo] of modules) {
    for (const statement of moduleInfo.source.statements) {
      if (!isExportedHandler(statement)) continue;
      const handler = getHandler(statement);
      if (!handler) continue;
      handlers.set(`${filePath}#${handler.name}`, collectMutations(filePath, handler.node));
    }
  }
  return { handlers };
}

module.exports = { analyzeD1MutationBoundaries };

/* eslint @typescript-eslint/no-require-imports: "off" -- This script is intentionally CommonJS. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const mutationMethods = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const nestedMutationOperators = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'connect', 'connectOrCreate', 'disconnect', 'set']);
const failures = [];
let checkedHandlers = 0;

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(filePath));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(filePath);
  }
  return files;
}

function isExportedHttpHandler(node) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(node.name.text)
      && (node.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  }
  if (ts.isVariableStatement(node)
    && (node.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return node.declarationList.declarations.some((declaration) => declaration.name
      && ts.isIdentifier(declaration.name)
      && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(declaration.name.text));
  }
  return false;
}

function getHandlerName(node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text || 'anonymous handler';
  const declaration = node.declarationList.declarations.find((item) => item.name && ts.isIdentifier(item.name));
  return declaration?.name.getText() || 'anonymous handler';
}

for (const filePath of sourceFiles(sourceRoot)) {
  const text = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

  function findForbiddenTransactions(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source).endsWith('.$transaction')) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      failures.push(`${path.relative(root, filePath)}:${line}: Prisma $transaction is not supported by D1.`);
    }
    ts.forEachChild(node, findForbiddenTransactions);
  }
  findForbiddenTransactions(source);

  for (const statement of source.statements) {
    if (!isExportedHttpHandler(statement)) continue;
    checkedHandlers += 1;
    const directMutations = [];
    const nestedMutations = [];

    function inspectMutationData(node, insideData = false) {
      if (ts.isPropertyAssignment(node)) {
        const propertyName = node.name.getText(source).replace(/^['"]|['"]$/g, '');
        const nextInsideData = insideData || propertyName === 'data';
        if (insideData && nestedMutationOperators.has(propertyName)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          nestedMutations.push(`${propertyName}@${line}`);
        }
        ts.forEachChild(node, (child) => inspectMutationData(child, nextInsideData));
        return;
      }
      ts.forEachChild(node, (child) => inspectMutationData(child, insideData));
    }

    function inspectHandler(node) {
      if (ts.isFunctionDeclaration(node) && node !== statement) return;
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(source);
        const match = expression.match(/^prisma\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
        if (match && mutationMethods.has(match[2])) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          directMutations.push(`${match[1]}.${match[2]}@${line}`);
          if (node.arguments[0]) inspectMutationData(node.arguments[0]);
        }
      }
      ts.forEachChild(node, inspectHandler);
    }

    inspectHandler(statement);
    const handlerName = getHandlerName(statement);
    if (directMutations.length > 1) {
      failures.push(`${path.relative(root, filePath)} ${handlerName}: multiple Prisma mutations must use one atomic D1 batch (${directMutations.join(', ')}).`);
    }
    if (nestedMutations.length > 0) {
      failures.push(`${path.relative(root, filePath)} ${handlerName}: nested Prisma writes must be moved into an explicit D1 batch (${[...new Set(nestedMutations)].join(', ')}).`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: ${checkedHandlers} API handlers have no D1-unsafe Prisma transaction, multiple direct mutation, or nested write patterns.\n`);
}

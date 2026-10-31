/* eslint @typescript-eslint/no-require-imports: "off" -- This repository check uses the TypeScript compiler API. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const testRoots = ['unit-tests', 'tests'].map((directory) => path.join(root, directory));
const catalogFile = path.join(sourceRoot, 'lib', 'ui-strings.constants.ts');
const uiAttributes = new Set([
  'placeholder', 'emptyPlaceholder', 'title', 'alt', 'aria-label', 'aria-description', 'aria-placeholder',
  'aria-valuetext', 'aria-roledescription', 'label', 'subtitle', 'description', 'secondary',
  'actionText', 'emptyText', 'helperText', 'tooltip', 'caption', 'summary', 'message',
  'confirmText', 'cancelText', 'buttonText', 'heading', 'errorMessage', 'successMessage',
]);
const uiProperties = new Set([
  ...uiAttributes, 'text', 'emptyDescription', 'success', 'error', 'warning', 'detail',
  'details', 'desc', 'info', 'actionLabel',
]);
const uiCopyVariableNames = new Set([
  'title', 'subtitle', 'description', 'label', 'heading', 'placeholder', 'emptyPlaceholder',
  'actionText', 'summary', 'caption', 'emptyText', 'helperText', 'statusLabel', 'stageLabel',
]);
const uiCalls = new Set([
  'alert', 'confirm', 'prompt', 'toast', 'showToast', 'setError', 'setSuccess', 'setMessage',
  'setActionError', 'setFormError', 'setUploadError', 'setRatingError', 'setDecisionError',
  'setReversalError', 'setApproverActionError', 'apiError', 'notify', 'addToast',
]);
const violations = [];
const violationDetails = [];

function collectCatalogStrings() {
  const text = fs.readFileSync(catalogFile, 'utf8');
  const sourceFile = ts.createSourceFile(catalogFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = new Map();
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(sourceFile) === 'UI_STRINGS');
  let catalog = declaration?.initializer;
  while (catalog && (ts.isAsExpression(catalog) || ts.isParenthesizedExpression(catalog) || ts.isSatisfiesExpression(catalog))) catalog = catalog.expression;
  function visit(node, parent = []) {
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
      if (!key) continue;
      const path = [...parent, key];
      if (ts.isObjectLiteralExpression(property.initializer)) visit(property.initializer, path);
      else if (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer)) values.set(path.join('.'), property.initializer.text);
    }
  }
  if (catalog) visit(catalog);
  return values;
}

const catalogValues = collectCatalogStrings();
const catalogStrings = [...catalogValues.values()];

function catalogReferenceValue(expression, sourceFile) {
  if (ts.isCallExpression(expression)
    && ['uiStringPattern', 'interpolateUiString'].includes(expression.expression.getText(sourceFile).split('.').pop())) {
    expression = expression.arguments[0];
  }
  const keys = [];
  let current = expression;
  while (current && ts.isPropertyAccessExpression(current)) {
    keys.unshift(current.name.text);
    current = current.expression;
  }
  if (!current || !ts.isIdentifier(current) || current.text !== 'UI_STRINGS') return null;
  return catalogValues.get(keys.join('.')) || null;
}

function normalizeCopy(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function catalogMatches(value) {
  const normalizedValue = normalizeCopy(value);
  if (catalogStrings.some((catalogString) => normalizeCopy(catalogString) === normalizedValue)) return true;
  return catalogStrings.some((template) => {
    template = normalizeCopy(template);
    if (!template.includes('{{')) return false;
    const fixedText = template.replace(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g, '');
    const fixedWords = (fixedText.match(/[A-Za-z]{3,}/g) || []).join('');
    if (fixedWords.length < 3 && !fixedText.includes('₹')) return false;
    const pattern = template
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{\\\{[A-Za-z][A-Za-z0-9_]*\\\}\\\}/g, '[\\s\\S]*?');
    return new RegExp(`^${pattern}$`).test(normalizedValue);
  });
}

function regexMatchesCatalog(regex, sourceFile) {
  const raw = regex.getText(sourceFile);
  const lastSlash = raw.lastIndexOf('/');
  if (lastSlash <= 0) return null;
  const source = raw.slice(1, lastSlash).replace(/\.\*\??|\\s\*\??/g, ' ').replace(/\\(.)/g, '$1');
  if (source.includes('|')) return null;
  const tokens = source.match(/[A-Za-z0-9]+/g)?.map((token) => token.toLowerCase()) || [];
  if (tokens.length === 0) return null;
  return [...catalogValues.values()].some((template) => {
    const fixed = template.replace(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g, ' ');
    const catalogTokens = fixed.match(/[A-Za-z0-9]+/g)?.map((token) => token.toLowerCase()) || [];
    return tokens.length === catalogTokens.length && tokens.every((token, index) => token === catalogTokens[index]);
  });
}

function filesUnder(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) filesUnder(file, files);
    else if (/\.tsx?$/.test(file) && !file.endsWith('.d.ts')) files.push(file);
  }
  return files;
}

function hasCopy(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOutputBranch(node, expression) {
  let current = node;
  while (current && current !== expression) {
    const parent = current.parent;
    if (ts.isConditionalExpression(parent) && current === parent.condition) return false;
    if (ts.isBinaryExpression(parent)) {
      const logical = [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(parent.operatorToken.kind);
      if (!logical || current !== parent.right) return false;
    } else if (!(
      ts.isConditionalExpression(parent)
      || ts.isParenthesizedExpression(parent)
      || ts.isAsExpression(parent)
      || ts.isSatisfiesExpression(parent)
      || ts.isNonNullExpression(parent)
      || ts.isTypeAssertionExpression(parent)
    )) {
      return false;
    }
    current = parent;
  }
  return current === expression;
}

function isJsxCopy(node, sourceFile) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxAttribute(parent)) return false;
    if (ts.isJsxExpression(parent)) {
      if (ts.isJsxAttribute(parent.parent)) {
        return uiAttributes.has(parent.parent.name.getText(sourceFile))
          && isOutputBranch(node, parent.expression);
      }
      return isOutputBranch(node, parent.expression);
    }
  }
  return false;
}

function report(file, node, sourceFile, reason) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const copy = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)
    ? ` (${node.getText(sourceFile)})`
    : '';
  violationDetails.push({
    file: path.relative(root, file),
    line: position.line + 1,
    column: position.character + 1,
    start: node.getStart(sourceFile),
    end: node.end,
    kind: ts.SyntaxKind[node.kind],
    text: node.getText(sourceFile),
    reason,
  });
  violations.push(`${path.relative(root, file)}:${position.line + 1}:${position.character + 1} ${reason}${copy}`);
}

for (const file of filesUnder(sourceRoot)) {
  if (file.endsWith(`${path.sep}ui-strings.constants.ts`)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  function inspectCopyFallback(expression, reason) {
    if (!expression) return;
    if ((ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) && hasCopy(expression.text)) {
      report(file, expression, sourceFile, reason);
      return;
    }
    if (ts.isTemplateExpression(expression)) {
      report(file, expression, sourceFile, reason);
      return;
    }
    if (ts.isConditionalExpression(expression)) {
      inspectCopyFallback(expression.whenTrue, reason);
      inspectCopyFallback(expression.whenFalse, reason);
      return;
    }
    if (ts.isBinaryExpression(expression)
      && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind)) {
      inspectCopyFallback(expression.right, reason);
    }
  }

  function bindingName(binding) {
    if (ts.isIdentifier(binding)) return binding.text;
    if (ts.isStringLiteral(binding)) return binding.text;
    return '';
  }

  function visit(node) {
    if (ts.isParameter(node)) {
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!uiProperties.has(bindingName(element.propertyName || element.name))) continue;
          inspectCopyFallback(element.initializer, 'hardcoded user-facing parameter default; use UI_STRINGS');
        }
      } else if (uiProperties.has(bindingName(node.name))) {
        inspectCopyFallback(node.initializer, 'hardcoded user-facing parameter default; use UI_STRINGS');
      }
    }
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && uiCopyVariableNames.has(node.name.text)) {
      inspectCopyFallback(node.initializer, 'hardcoded user-facing variable copy or fallback; use UI_STRINGS');
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left)
      && uiCopyVariableNames.has(node.left.text)) {
      inspectCopyFallback(node.right, 'hardcoded user-facing variable copy or fallback; use UI_STRINGS');
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].includes(node.expression.name.text)
      && node.arguments[0]
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      report(file, node.arguments[0], sourceFile, 'hardcoded formatting locale; use I18N_CONFIG.defaultLocale');
    }
    if (ts.isNewExpression(node)
      && ['Intl.NumberFormat', 'Intl.DateTimeFormat', 'Intl.RelativeTimeFormat', 'Intl.ListFormat'].includes(node.expression.getText(sourceFile))
      && node.arguments?.[0]
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      report(file, node.arguments[0], sourceFile, 'hardcoded formatting locale; use I18N_CONFIG.defaultLocale');
    }
    if (ts.isJsxText(node) && hasCopy(node.text)) report(file, node, sourceFile, 'hardcoded JSX text; use UI_STRINGS');
    if (ts.isJsxAttribute(node) && uiAttributes.has(node.name.getText(sourceFile)) && node.initializer) {
      const initializer = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if ((ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) && hasCopy(initializer.text)) {
        report(file, initializer, sourceFile, 'hardcoded user-facing attribute; use UI_STRINGS');
      }
      if (ts.isTemplateExpression(initializer)) report(file, initializer, sourceFile, 'hardcoded dynamic attribute; use UI_STRINGS and interpolateUiString');
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isJsxCopy(node, sourceFile) && hasCopy(node.text)) {
      report(file, node, sourceFile, 'hardcoded JSX expression text; use UI_STRINGS');
    }
    if (ts.isTemplateExpression(node) && isJsxCopy(node, sourceFile)) {
      report(file, node, sourceFile, 'hardcoded JSX template; use UI_STRINGS and interpolateUiString');
    }
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
      const value = node.initializer;
      const loginCopy = ['role', 'badge', 'desc'].includes(key) && file.includes(`${path.sep}app${path.sep}login${path.sep}`);
      const uomName = key === 'name' && file.endsWith(`${path.sep}uom-standardise.constants.ts`);
      if ((uiProperties.has(key) || loginCopy || uomName)
        && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
        && hasCopy(value.text)) {
        report(file, value, sourceFile, 'hardcoded user-facing object property; use UI_STRINGS');
      }
      if ((uiProperties.has(key) || loginCopy || uomName) && ts.isTemplateExpression(value)) {
        report(file, value, sourceFile, 'hardcoded dynamic object property; use UI_STRINGS and interpolateUiString');
      }
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && ts.isIdentifier(node.left.expression)
      && /^(errors?|validationErrors|formErrors|fieldErrors)$/i.test(node.left.expression.text)) {
      const value = node.right;
      if ((ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && hasCopy(value.text)) {
        report(file, value, sourceFile, 'hardcoded validation message; use UI_STRINGS');
      }
      if (ts.isTemplateExpression(value)) {
        report(file, value, sourceFile, 'hardcoded dynamic validation message; use UI_STRINGS and interpolateUiString');
      }
    }
    if (ts.isCallExpression(node) && node.arguments.length) {
      const name = node.expression.getText(sourceFile).split('.').pop();
      const toastMethod = ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'toast'
        && ['success', 'error', 'warning', 'info'].includes(node.expression.name.text);
      const inspectMessage = (child) => {
        if (ts.isCallExpression(child) && child.expression.getText(sourceFile).split('.').pop() === 'interpolateUiString') {
          if (child.arguments[0]) inspectMessage(child.arguments[0]);
          const values = child.arguments[1];
          const inspectFallback = (value) => {
            if (ts.isBinaryExpression(value) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(value.operatorToken.kind)) {
              inspectMessage(value.right);
              return;
            }
            ts.forEachChild(value, inspectFallback);
          };
          if (values) inspectFallback(values);
          return;
        }
        if (ts.isPropertyAssignment(child) && child.initializer) {
          inspectMessage(child.initializer);
          return;
        }
        if (ts.isConditionalExpression(child)) {
          inspectMessage(child.whenTrue);
          inspectMessage(child.whenFalse);
          return;
        }
        if (ts.isBinaryExpression(child)
          && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(child.operatorToken.kind)) {
          inspectMessage(child.right);
          return;
        }
        if ((ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) && hasCopy(child.text)) {
          report(file, child, sourceFile, 'hardcoded user-facing message; use UI_STRINGS');
        }
        if (ts.isTemplateExpression(child)) {
          report(file, child, sourceFile, 'hardcoded dynamic message; use UI_STRINGS and interpolateUiString');
          return;
        }
        ts.forEachChild(child, inspectMessage);
      };
      const inspectToastCopy = (child) => {
        if (!child) return;
        if (ts.isObjectLiteralExpression(child)) {
          const toastCopyProperties = new Set(['title', 'message', 'nextStage', 'actionText', 'confirmText', 'cancelText', 'description', 'detail']);
          for (const property of child.properties) {
            if (ts.isPropertyAssignment(property)
              && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
              && toastCopyProperties.has(property.name.text)) inspectToastCopy(property.initializer);
          }
          return;
        }
        if (ts.isConditionalExpression(child)) {
          inspectToastCopy(child.whenTrue);
          inspectToastCopy(child.whenFalse);
          return;
        }
        if (ts.isBinaryExpression(child)
          && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(child.operatorToken.kind)) {
          inspectToastCopy(child.right);
          return;
        }
        inspectMessage(child);
      };
      if (toastMethod) {
        inspectToastCopy(node.arguments[0]);
        const method = node.expression.name.text;
        if (['error', 'warning', 'info'].includes(method)) inspectToastCopy(node.arguments[1]);
        if (method === 'success') inspectToastCopy(node.arguments[2]);
      } else if (uiCalls.has(name) || /^set[A-Z].*(Errors?|Success|Message|Msg|Notice|Toast|Warning|Info)$/.test(name)) {
        const argument = node.arguments[0];
        inspectMessage(argument);
      }
    }
    if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === 'Error' && node.arguments?.length) {
      const inspectErrorMessage = (argument) => {
        if (ts.isCallExpression(argument) && argument.expression.getText(sourceFile).split('.').pop() === 'interpolateUiString') {
          const values = argument.arguments[1];
          const inspectFallback = (value) => {
            if (ts.isBinaryExpression(value)
              && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(value.operatorToken.kind)) {
              inspectErrorMessage(value.right);
              return;
            }
            ts.forEachChild(value, inspectFallback);
          };
          if (values) inspectFallback(values);
          return;
        }
        if (ts.isConditionalExpression(argument)) {
          inspectErrorMessage(argument.whenTrue);
          inspectErrorMessage(argument.whenFalse);
          return;
        }
        if (ts.isBinaryExpression(argument)
          && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(argument.operatorToken.kind)) {
          inspectErrorMessage(argument.right);
          return;
        }
        if ((ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) && hasCopy(argument.text)) {
          report(file, argument, sourceFile, 'hardcoded error message; use UI_STRINGS');
        }
        if (ts.isTemplateExpression(argument)) report(file, argument, sourceFile, 'hardcoded dynamic error; use UI_STRINGS and interpolateUiString');
      };
      inspectErrorMessage(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const textQueryCalls = new Set([
  'getByText', 'getAllByText', 'findByText', 'findAllByText', 'queryByText', 'queryAllByText',
  'getByLabelText', 'getAllByLabelText', 'findByLabelText', 'queryByLabelText',
  'getByPlaceholderText', 'getAllByPlaceholderText', 'findByPlaceholderText', 'queryByPlaceholderText',
  'getByTitle', 'getAllByTitle', 'getByAltText', 'getAllByAltText', 'getByDisplayValue',
  'getAllByDisplayValue', 'findByDisplayValue', 'queryByDisplayValue', 'toHaveTextContent',
  'toHaveAccessibleName', 'toHaveAccessibleDescription',
]);

function testFilesUnder(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) testFilesUnder(file, files);
    else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) files.push(file);
  }
  return files;
}

for (const testRoot of testRoots) for (const file of testFilesUnder(testRoot)) {
  const text = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visitTest(node) {
    if (ts.isCallExpression(node)) {
      const method = node.expression.getText(sourceFile).split('.').pop();
      if (textQueryCalls.has(method)) {
        const argument = node.arguments[0];
        let literal = null;
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) literal = argument;
        if (literal && catalogMatches(literal.text)) {
          report(file, literal, sourceFile, 'test assertion duplicates catalog copy; assert with UI_STRINGS/interpolateUiString');
        }
        const referenced = argument && catalogReferenceValue(argument, sourceFile);
        if (referenced && /^\{\{[A-Za-z][A-Za-z0-9_]*\}\}$/.test(referenced.trim())) {
          report(file, argument, sourceFile, 'test assertion uses a placeholder-only catalog entry; assert on a UI string or a named fixture value');
        }
        if (argument && ts.isRegularExpressionLiteral(argument) && regexMatchesCatalog(argument, sourceFile)) {
          report(file, argument, sourceFile, 'test assertion duplicates catalog copy in a regex; use uiStringPattern(UI_STRINGS...)');
        }
      }
      const expectationTarget = ts.isPropertyAccessExpression(node.expression)
        && ts.isCallExpression(node.expression.expression)
        && node.expression.expression.expression.getText(sourceFile) === 'expect'
        ? node.expression.expression.arguments[0]
        : null;
      const isUserFeedbackExpectation = expectationTarget
        && /(?:mockToast|toast|notify|set[A-Z].*(?:Errors?|Success|Message|Msg|Notice|Toast|Warning|Info))/.test(expectationTarget.getText(sourceFile));
      if (/^toHaveBeenCalledWith$/.test(method) && isUserFeedbackExpectation) {
        const inspectExpectation = (child) => {
          if (ts.isCallExpression(child)
            && ['interpolateUiString', 'uiStringPattern'].includes(child.expression.getText(sourceFile).split('.').pop())) return;
          if ((ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) && catalogMatches(child.text)) {
            report(file, child, sourceFile, 'test assertion duplicates catalog copy; assert with UI_STRINGS/interpolateUiString');
          }
          ts.forEachChild(child, inspectExpectation);
        };
        node.arguments.forEach(inspectExpectation);
      }
      if (['getByRole', 'getAllByRole', 'findByRole', 'queryByRole'].includes(method)) {
        const options = node.arguments[1];
        const role = node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : '';
        if (options && ts.isObjectLiteralExpression(options)) {
          const name = options.properties.find((property) => ts.isPropertyAssignment(property)
            && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            && property.name.text === 'name');
          if (name && ts.isPropertyAssignment(name)
            && (ts.isStringLiteral(name.initializer) || ts.isNoSubstitutionTemplateLiteral(name.initializer))
            && catalogMatches(name.initializer.text)) {
            report(file, name.initializer, sourceFile, 'role-name assertion duplicates catalog copy; assert with UI_STRINGS/interpolateUiString');
          }
          if (name && ts.isPropertyAssignment(name)) {
            const referenced = catalogReferenceValue(name.initializer, sourceFile);
            if (referenced && /^\{\{[A-Za-z][A-Za-z0-9_]*\}\}$/.test(referenced.trim())) {
              report(file, name.initializer, sourceFile, 'role-name assertion uses a placeholder-only catalog entry; assert on a UI string or a named fixture value');
            }
            if (!['row', 'cell'].includes(role) && ts.isRegularExpressionLiteral(name.initializer) && regexMatchesCatalog(name.initializer, sourceFile)) {
              report(file, name.initializer, sourceFile, 'role-name assertion duplicates catalog copy in a regex; use uiStringPattern(UI_STRINGS...)');
            }
          }
        }
      }
    }
    ts.forEachChild(node, visitTest);
  }
  visitTest(sourceFile);
}

if (process.argv[2] === '--json-report' && process.argv[3]) {
  fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(violationDetails, null, 2), 'utf8');
}

if (violations.length) {
  process.stderr.write(`Found ${violations.length} hardcoded user-facing string(s):\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('PASS: application UI copy is referenced through UI_STRINGS.\n');
}

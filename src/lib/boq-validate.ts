import type { BoqLineInput, ValidationMessage, ValidationResult } from "@app-types/lib/boq-validate.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";

export type { BoqLineInput, ValidationMessage, ValidationResult };


export function validateBoqLine(line: BoqLineInput): ValidationResult {
  const messages: ValidationMessage[] = [];

  // Required: Description
  if (!line.originalDescription?.trim() && !line.standardDescription?.trim()) {
    messages.push({ level: 'ERROR', code: 'DESC_MISSING', message: UI_STRINGS.common.descriptionIsRequired });
  }

  // Duplicate line number check
  if (line.isDuplicate) {
    messages.push({ level: 'ERROR', code: 'LINE_DUPLICATE', message: UI_STRINGS.libBoqValidate.duplicateLineNumberDetected });
  }

  // Required: UOM
  if (!line.uomRaw?.trim() && !line.uomId) {
    messages.push({ level: 'ERROR', code: 'UOM_MISSING', message: UI_STRINGS.libBoqValidate.unitOfMeasureUOMIsRequired });
  } else if (line.isInvalidUom) {
    messages.push({ level: 'ERROR', code: 'UOM_INVALID', message: UI_STRINGS.libBoqValidate.invalidOrUnrecognizedUOMStandardizeOrAssignValidUOM });
  }

  // Required: Quantity
  if (line.quantity === null || line.quantity === undefined) {
    messages.push({ level: 'ERROR', code: 'QTY_MISSING', message: UI_STRINGS.libBoqValidate.quantityIsRequired });
  } else if (line.quantity < 0) {
    messages.push({ level: 'ERROR', code: 'QTY_NEGATIVE', message: UI_STRINGS.common.quantityCannotBeNegative });
  } else if (line.quantity === 0) {
    messages.push({ level: 'ERROR', code: 'QTY_ZERO', message: UI_STRINGS.common.quantityMustBeGreaterThanZero });
  } else if (line.quantity > 9999999) {
    messages.push({ level: 'WARNING', code: 'QTY_HIGH', message: UI_STRINGS.libBoqValidate.quantityIsUnusuallyHighPleaseVerify });
  }

  // Warning: No category
  if (!line.categoryId) {
    messages.push({ level: 'WARNING', code: 'CAT_MISSING', message: UI_STRINGS.libBoqValidate.categoryIsNotAssigned });
  }

  // Warning: Short description
  const effectiveDesc = (line.standardDescription || line.originalDescription || '').trim();
  if (effectiveDesc.length > 0 && effectiveDesc.length < 5) {
    messages.push({ level: 'WARNING', code: 'DESC_SHORT', message: UI_STRINGS.libBoqValidate.descriptionIsVeryShortPleaseVerify });
  }

  // Info: Unstandardized description
  if (line.originalDescription?.trim() && !line.standardDescription?.trim()) {
    messages.push({ level: 'INFO', code: 'STD_DESC_MISSING', message: UI_STRINGS.libBoqValidate.standardDescriptionHasNotBeenSetYet });
  } else if (line.originalDescription?.trim() && line.standardDescription === line.originalDescription) {
    messages.push({ level: 'INFO', code: 'DESC_UNSTANDARDIZED', message: UI_STRINGS.libBoqValidate.originalDescriptionMatchesStandardDescriptionWithoutCatalogNormalization });
  }

  const hasErrors = messages.some(m => m.level === 'ERROR');
  const hasWarnings = messages.some(m => m.level === 'WARNING');

  return {
    status: hasErrors ? 'ERROR' : hasWarnings ? 'WARNING' : 'VALID',
    messages,
  };
}

export function computeQualityScore(lines: BoqLineInput[]): number {
  if (lines.length === 0) return 0;
  let score = 0;
  for (const line of lines) {
    const result = validateBoqLine(line);
    if (result.status === 'VALID') score += 100;
    else if (result.status === 'WARNING') score += 70;
    // ERROR = 0
  }
  return Math.round(score / lines.length);
}

export function summarizeIssues(lines: BoqLineInput[]) {
  let missingSpecs = 0;
  let uncategorized = 0;
  let invalidUom = 0;
  let duplicateLines = 0;
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const line of lines) {
    const res = validateBoqLine(line);
    if (!line.standardDescription || line.standardDescription.length < 10) missingSpecs++;
    if (!line.categoryId) uncategorized++;
    if (!line.uomId || line.isInvalidUom) invalidUom++;
    if (line.isDuplicate) duplicateLines++;

    for (const msg of res.messages) {
      if (msg.level === 'ERROR') errorCount++;
      else if (msg.level === 'WARNING') warningCount++;
      else if (msg.level === 'INFO') infoCount++;
    }
  }

  return {
    missingSpecs,
    uncategorized,
    invalidUom,
    duplicateLines,
    errorCount,
    warningCount,
    infoCount,
    qualityScore: computeQualityScore(lines),
  };
}

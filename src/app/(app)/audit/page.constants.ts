import { UI_STRINGS } from "@/lib/ui-strings.constants";
/* Application constants extracted from app/(app)/audit/page.tsx. */

export const ACTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CREATE: { bg: '#dcfce7', text: UI_STRINGS.appAppAuditPageConstants.copy1v7chij, border: '#bbf7d0' },
  UPDATE: { bg: '#e0f2fe', text: UI_STRINGS.appAppAuditPageConstants.copy1tyb2ik, border: '#bae6fd' },
  DELETE: { bg: '#fee2e2', text: UI_STRINGS.appAppAuditPageConstants.b91c1c, border: '#fecaca' },
  SUBMIT: { bg: '#fef3c7', text: UI_STRINGS.appAppAuditPageConstants.b45309, border: '#fde68a' },
  APPROVE: { bg: '#dcfce7', text: UI_STRINGS.appAppAuditPageConstants.copy1v7chij, border: '#bbf7d0' },
  REJECT: { bg: '#fee2e2', text: UI_STRINGS.appAppAuditPageConstants.b91c1c, border: '#fecaca' },
  IMPORT: { bg: '#f3e8ff', text: UI_STRINGS.appAppAuditPageConstants.copyft7b5e, border: '#e9d5ff' },
  UPLOAD: { bg: '#f3e8ff', text: UI_STRINGS.appAppAuditPageConstants.copyft7b5e, border: '#e9d5ff' },
  STANDARDISE: { bg: '#fce7f3', text: UI_STRINGS.appAppAuditPageConstants.be185d, border: '#fbcfe8' },
  VALIDATE: { bg: '#cffafe', text: UI_STRINGS.appAppAuditPageConstants.copy1g1tvor, border: '#a5f3fc' },
  LOGIN: { bg: '#f1f5f9', text: UI_STRINGS.common.copy5npjv8, border: '#e2e8f0' },
};

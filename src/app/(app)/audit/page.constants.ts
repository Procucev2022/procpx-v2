/* Application constants extracted from app/(app)/audit/page.tsx. */

export const ACTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CREATE: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  UPDATE: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  DELETE: { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
  SUBMIT: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  APPROVE: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  REJECT: { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
  IMPORT: { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff' },
  UPLOAD: { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff' },
  STANDARDISE: { bg: '#fce7f3', text: '#be185d', border: '#fbcfe8' },
  VALIDATE: { bg: '#cffafe', text: '#0e7490', border: '#a5f3fc' },
  LOGIN: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
};

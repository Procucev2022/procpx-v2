/* Application constants extracted from app/(app)/procurement/rfqs/new/page.tsx. */

// Approved Five-Step Colour Palette Configuration
export const STEP_THEMES = {
  1: {
    primary: '#2563EB',
    lightBg: '#EFF6FF',
    accentBorder: '#BFDBFE',
    textDark: '#1E40AF',
    badgeBg: '#DBEAFE',
    label: 'Project & BOQ',
    subtitle: 'Baseline Verification',
  },
  2: {
    primary: '#0D9488',
    lightBg: '#F0FDFA',
    accentBorder: '#99F6E4',
    textDark: '#0F766E',
    badgeBg: '#CCFBF1',
    label: 'Scope & Package',
    subtitle: 'Package Lines',
  },
  3: {
    primary: '#9333EA',
    lightBg: '#FAF5FF',
    accentBorder: '#E9D5FF',
    textDark: '#7E22CE',
    badgeBg: '#F3E8FF',
    label: 'Commercial & Technical',
    subtitle: 'Conditions & Specs',
  },
  4: {
    primary: '#D97706',
    lightBg: '#FFFBEB',
    accentBorder: '#FDE68A',
    textDark: '#B45309',
    badgeBg: '#FEF3C7',
    label: 'Vendor Selection',
    subtitle: 'Invite Suppliers',
  },
  5: {
    primary: '#059669',
    lightBg: '#ECFDF5',
    accentBorder: '#A7F3D0',
    textDark: '#047857',
    badgeBg: '#D1FAE5',
    label: 'Review & Release',
    subtitle: 'Validate & Launch',
  },
} as const;

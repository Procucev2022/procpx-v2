/* Shared declarations for components/ApprovalChatDrawer.tsx. */

export interface ApprovalChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'PR' | 'BUDGET';
  entityId: string;
  entityCode: string; // e.g. PR-2026-000001 or BOQ-CPX-P-001
  title?: string;
  costCentre?: string;
  category?: string;
  amount?: number;
  initialEnquiryMode?: boolean;
  onMessageSent?: () => void;
}

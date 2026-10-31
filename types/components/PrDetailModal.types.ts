/* Shared declarations for components/PrDetailModal.tsx. */

export interface PrDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pr: any | null;
  userRole?: string;
  onCreateRfq?: (pr: any) => void;
}

/* Shared declarations for components/RfqChatDrawer.tsx. */

export interface RfqChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rfqId: string;
  rfqNumber: string;
  title?: string;
  vendorId?: string;
  vendorName?: string;
  isVendorUser?: boolean;
}

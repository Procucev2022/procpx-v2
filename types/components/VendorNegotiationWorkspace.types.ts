/* Shared declarations for components/VendorNegotiationWorkspace.tsx. */

export interface VendorNegotiationWorkspaceProps {
  mode: 'RFQ' | 'RATE_CARD';
  data: any; // RFQ object or Rate Card object
  vendorId?: string;
  vendorName?: string;
  isBuyer?: boolean;
  onBack: () => void;
  onSuccess?: () => void;
}

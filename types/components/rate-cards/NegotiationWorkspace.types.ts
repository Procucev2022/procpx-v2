/* Shared declarations for components/rate-cards/NegotiationWorkspace.tsx. */

export interface NegotiationItem {
  id: string;
  itemCode: string;
  description: string;
  specification?: string;
  uom: string;
  qty: number;
  buyerTargetRate: number;
  latestVendorQuote: number;
  currentBuyerOffer: number;
  proposedAmount?: number;
}

export interface NegotiationWorkspaceProps {
  rateCardId?: string;
  vendorName?: string;
  category?: string;
  round?: string;
  items: NegotiationItem[];
  onItemsChange: (updated: NegotiationItem[]) => void;
  onReset: () => void;
  onSaveDraft: () => void;
  onSendOffer: () => void;
  onAcceptQuoteClick?: () => void;
  onBack: () => void;
}

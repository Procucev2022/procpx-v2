/* Shared declarations for components/ProcurementCommercialWorkspace.tsx. */

export interface ProcurementCommercialWorkspaceProps {
  rfq: any;
  comparison: any;
  rateCardMatch: any;
  isDemoMode: boolean;
  onRecordQuote: () => void;
  onOpenRateCards: () => void;
  onReleaseRfq?: () => void;
  onNegotiationSubmitted?: () => void;
  actionLoading?: boolean;
}

export type ProcurementNegotiationHistoryRound = {
  id: string;
  vendorId: string;
  roundNumber: number;
  createdAt: string | Date;
  counterOfferAmount: number | null;
  revisedQuoteAmount: number | null;
  status: string;
  notes: string | null;
};

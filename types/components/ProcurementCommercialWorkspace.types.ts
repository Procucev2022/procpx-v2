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

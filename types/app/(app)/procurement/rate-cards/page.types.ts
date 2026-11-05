import type { AgreementDocumentData } from '@app-types/components/rate-cards/AgreementPreviewModal.types';

/* Shared declarations for app/(app)/procurement/rate-cards/page.tsx. */

export type ViewMode = 'HOME' | 'INITIATE' | 'NEGOTIATION' | 'BUYER_ACCEPTANCE' | 'DETAILS';

export type RateCardNumberish = number | string | null | undefined;

export interface RateCardPageItem {
  id: string;
  itemCode?: string | null;
  description?: string | null;
  specification?: string | null;
  uom?: string | null;
  comparisonRef?: string | null;
  referenceQty?: RateCardNumberish;
  minQuantity?: RateCardNumberish;
  maxQuantity?: RateCardNumberish;
  qty?: RateCardNumberish;
  buyerOffer1?: RateCardNumberish;
  buyerOffer2?: RateCardNumberish;
  vendorQuote1?: RateCardNumberish;
  vendorQuote2?: RateCardNumberish;
  benchmarkRate?: RateCardNumberish;
  rate?: RateCardNumberish;
  proposedRate?: RateCardNumberish;
}

export interface RateCardPageRecord {
  id: string;
  rateCardNumber?: string | null;
  status?: string | null;
  title?: string | null;
  category?: string | null;
  scope?: string | null;
  itemCount?: number | null;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  updatedAt?: string | Date | null;
  vendor?: { name?: string | null; code?: string | null } | null;
  items?: RateCardPageItem[] | null;
  createdAt?: string | Date | null;
  createdBy?: string | null;
  projectApprovedAt?: string | Date | null;
  projectApprovedBy?: string | null;
  financeApprovedAt?: string | Date | null;
  financeApprovedBy?: string | null;
  notes?: string | null;
  agreement?: AgreementDocumentData | null;
}

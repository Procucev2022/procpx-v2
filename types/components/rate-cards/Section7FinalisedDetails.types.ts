/* Shared declarations for components/rate-cards/Section7FinalisedDetails.tsx. */

import type { AgreementDocumentData } from "@/components/rate-cards/AgreementPreviewModal";

export interface FinalisedRateItem {
  id: string;
  itemCode: string;
  category: string;
  subcategory: string;
  description: string;
  specification: string;
  uom: string;
  qty: number;
  buyerTargetRate: number;
  round1VendorQuote: number;
  round2BuyerOffer?: number;
  round2VendorQuote?: number;
  agreedRate: number;
}

export interface Section7Props {
  rateCard?: any;
  rateCardId?: string;
  vendorName?: string;
  vendorCode?: string;
  category?: string;
  subcategory?: string;
  title?: string;
  scope?: string;
  validity?: string;
  location?: string;
  terms?: string;
  status?: string;
  createdBy?: string;
  createdOn?: string;
  items?: FinalisedRateItem[];
  agreement?: AgreementDocumentData | null;
}

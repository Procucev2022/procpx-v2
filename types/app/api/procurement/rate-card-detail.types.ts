export interface RateCardDetailItemInput {
  id?: string;
  description?: string;
  itemCode?: string | null;
  standardBoqItemId?: string | null;
  specification?: string | null;
  category?: string | null;
  subcategory?: string | null;
  uom?: string | null;
  rate?: number | string;
  proposedRate?: number | string;
  historicalRate?: number | string | null;
  benchmarkRate?: number | string | null;
  comparisonRef?: string | null;
  minQuantity?: number | string | null;
  maxQuantity?: number | string | null;
  location?: string | null;
  buyerOffer2?: number | string;
  remarks?: string;
}

export interface RateCardDetailAgreementInput {
  required?: boolean;
  [key: string]: unknown;
}

export interface RateCardItemStateUpdate {
  id: string;
  rate?: number;
  comparisonRef: string;
}

export interface RateCardDetailUpdateBody {
  action?: string;
  items?: RateCardDetailItemInput[];
  remarks?: string;
  roundNumber?: number;
  totalAgreedValue?: number | string;
  agreement?: RateCardDetailAgreementInput | null;
  title?: string;
  category?: string;
  subcategory?: string | null;
  scope?: string | null;
  location?: string | null;
  version?: number | string;
  validFrom?: string;
  validTo?: string;
  terms?: string | null;
  notes?: string | null;
  justification?: string | null;
  comparisonNotes?: string | null;
  status?: string;
}

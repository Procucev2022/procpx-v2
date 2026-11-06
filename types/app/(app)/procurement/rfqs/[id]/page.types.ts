export interface RateCardMatchSummary {
  rateCardId: string;
  rateCardNumber?: string;
  category?: string;
  title?: string;
  directPpoEligible: boolean;
  rateCardTotalValue?: number | null;
  totalSavings?: number | null;
  savingsPercent?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  matchedItemsCount?: number;
  totalItemsCount?: number;
  coveragePercent?: number;
  blockReasons?: string[];
  vendor?: {
    name?: string;
    qualificationStatus?: string | null;
    performanceScore?: number | null;
  };
}

export interface RateCardMatchResponse {
  matchedRateCards: RateCardMatchSummary[];
  page?: number;
  hasMore?: boolean;
  eligibleCount: number;
}

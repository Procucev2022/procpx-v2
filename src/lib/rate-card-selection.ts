import type { RateCardSelectionInput } from '@app-types/lib/rate-card-selection.types';

/**
 * Whether an RFQ can attach a rate card. The rate card list sends isExpired, computed on the server clock, and that
 * flag decides. The browser clock is used only when a response omits the flag.
 */
export function isRateCardSelectable(rateCard: RateCardSelectionInput, browserNow: Date = new Date()): boolean {
  if (rateCard.status !== 'APPROVED') return false;
  if (typeof rateCard.isExpired === 'boolean') return !rateCard.isExpired;
  return !rateCard.validTo || new Date(rateCard.validTo) >= browserNow;
}

/** The rate card fields that decide whether an RFQ can attach the card. */
export interface RateCardSelectionInput {
  status?: string | null;
  validTo?: string | Date | null;
  isExpired?: boolean | null;
}

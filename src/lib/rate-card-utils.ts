import type { ParsedRateCardItemMeta, RateCardNegotiationMeta } from "@app-types/lib/rate-card-utils.types";
export type { ParsedRateCardItemMeta, RateCardNegotiationMeta };

/** Parses persisted JSON objects without treating malformed data as an empty object. */
export function parseStoredJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}


/**
 * Parses the structured comparison metadata stored in VendorRateCardItem.comparisonRef
 */
export function parseItemMeta(item: any): ParsedRateCardItemMeta {
  let parsed: any = {};
  if (item.comparisonRef) {
    try {
      parsed = JSON.parse(item.comparisonRef);
    } catch {
      // not JSON, legacy string
    }
  }

  const buyerOffer1 =
    parsed.buyerOffer1 !== undefined
      ? Number(parsed.buyerOffer1)
      : item.rate !== undefined && item.rate !== null
      ? Number(item.rate)
      : null;

  const vendorQuote1 =
    parsed.vendorQuote1 !== undefined
      ? Number(parsed.vendorQuote1)
      : item.proposedRate !== undefined && item.proposedRate !== null
      ? Number(item.proposedRate)
      : null;

  const buyerOffer2 =
    parsed.buyerOffer2 !== undefined ? Number(parsed.buyerOffer2) : null;

  const vendorQuote2 =
    parsed.vendorQuote2 !== undefined ? Number(parsed.vendorQuote2) : null;

  const finalAgreedRate =
    parsed.finalAgreedRate !== undefined
      ? Number(parsed.finalAgreedRate)
      : item.rate !== undefined && (item.rateCard?.status === 'APPROVED' || item.rateCard?.status === 'FINAL_VENDOR_OFFER_ACCEPTED')
      ? Number(item.rate)
      : null;

  const previousPpoRate =
    parsed.previousPpoRate !== undefined
      ? Number(parsed.previousPpoRate)
      : item.historicalRate !== undefined
      ? Number(item.historicalRate)
      : null;

  const referenceQty =
    parsed.referenceQty !== undefined
      ? Number(parsed.referenceQty)
      : item.minQuantity !== undefined && item.minQuantity !== null
      ? Number(item.minQuantity)
      : 1;

  const remarks = parsed.remarks || '';
  const status = parsed.status || (finalAgreedRate ? 'AGREED' : 'IN_NEGOTIATION');

  return {
    buyerOffer1,
    vendorQuote1,
    buyerOffer2,
    vendorQuote2,
    finalAgreedRate,
    previousPpoRate,
    referenceQty,
    remarks,
    status,
    isExcluded: parsed.isExcluded || false,
    exclusionReason: parsed.exclusionReason || '',
  };
}

/**
 * Serializes item negotiation metadata to JSON string for comparisonRef
 */
export function serializeItemMeta(meta: Partial<ParsedRateCardItemMeta>): string {
  return JSON.stringify(meta);
}

/**
 * Parses negotiation workflow metadata stored in VendorRateCard.notes
 */
export function parseRateCardNegotiation(rateCard: any): RateCardNegotiationMeta {
  let meta: RateCardNegotiationMeta = {
    currentRound: 1,
  };

  if (rateCard.notes) {
    try {
      const parsed = JSON.parse(rateCard.notes);
      if (parsed && typeof parsed === 'object') {
        meta = { ...meta, ...parsed };
      }
    } catch {
      // plain text note, ignore
    }
  }

  // Derive round if not explicitly stored
  if (!meta.currentRound) {
    if (rateCard.status === 'ROUND_2_BUYER_OFFER' || rateCard.status === 'ROUND_2_VENDOR_QUOTE') {
      meta.currentRound = 2;
    } else if (rateCard.status === 'ROUND_3_BUYER_OFFER' || rateCard.status === 'ROUND_3_VENDOR_QUOTE') {
      meta.currentRound = 3;
    } else {
      meta.currentRound = 1;
    }
  }

  return meta;
}

/**
 * Serializes negotiation workflow metadata to JSON string for VendorRateCard.notes
 */
export function serializeRateCardNegotiation(meta: RateCardNegotiationMeta): string {
  return JSON.stringify(meta);
}

/**
 * Human-readable label for Rate Card workflow statuses
 */
export function getRateCardStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft Rate Card';
    case 'ROUND_1_BUYER_OFFER':
    case 'SENT_TO_VENDOR':
      return 'Buyer RC Offer-1 Submitted — Waiting for Vendor RC Quote-1';
    case 'ROUND_1_VENDOR_QUOTE':
      return 'Vendor RC Quote-1 Received — Commercial Review Pending';
    case 'ROUND_2_BUYER_OFFER':
      return 'Buyer RC Offer-2 Submitted — Waiting for Vendor RC Quote-2';
    case 'ROUND_2_VENDOR_QUOTE':
      return 'Vendor RC Quote-2 Received — Final Commercial Review Pending';
    case 'ROUND_3_BUYER_OFFER':
      return 'Buyer RC Offer-3 Submitted';
    case 'ROUND_3_VENDOR_QUOTE':
      return 'Vendor RC Quote-3 Received';
    case 'FINAL_VENDOR_OFFER_ACCEPTED':
      return 'Final Vendor Offer Accepted — Category Manager Acceptance Pending';
    case 'CATEGORY_MANAGER_ACCEPTED':
      return 'Category Manager Accepted — Vendor Acceptance Pending';
    case 'VENDOR_ACCEPTED':
    case 'PENDING_PROJECT_APPROVAL':
      return 'Vendor Accepted — Pending Level 1 Project Approval';
    case 'PENDING_FINANCE_APPROVAL':
      return 'Project Approved — Pending Level 2 Finance Approval';
    case 'APPROVED':
      return 'Active / Contracted Rate Card';
    case 'RETURNED_FOR_CORRECTION':
      return 'Returned for Correction';
    case 'REJECTED':
      return 'Rejected';
    case 'EXPIRED':
      return 'Expired';
    default:
      return status?.replace(/_/g, ' ') || 'Unknown';
  }
}

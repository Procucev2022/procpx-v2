import {
  getRateCardStatusLabel,
  parseStoredJsonObject,
  parseItemMeta,
  parseRateCardNegotiation,
  serializeItemMeta,
  serializeRateCardNegotiation,
} from '../src/lib/rate-card-utils';

describe('item negotiation metadata', () => {
  it('uses legacy columns when comparison metadata is absent or invalid', () => {
    expect(parseItemMeta({
      comparisonRef: 'legacy text',
      rate: 120,
      proposedRate: 130,
      historicalRate: 100,
      minQuantity: 4,
      rateCard: { status: 'APPROVED' },
    })).toMatchObject({
      buyerOffer1: 120,
      vendorQuote1: 130,
      finalAgreedRate: 120,
      previousPpoRate: 100,
      referenceQty: 4,
      status: 'AGREED',
    });
  });

  it('prefers parsed fields and preserves exclusion metadata', () => {
    const meta = parseItemMeta({
      comparisonRef: JSON.stringify({
        buyerOffer1: '90', vendorQuote1: '95', buyerOffer2: '88', vendorQuote2: '91',
        finalAgreedRate: '89', previousPpoRate: '80', referenceQty: '3', remarks: 'accepted',
        status: 'CLOSED', isExcluded: true, exclusionReason: 'Out of scope',
      }),
      rate: 100,
    });

    expect(meta).toMatchObject({
      buyerOffer1: 90,
      vendorQuote1: 95,
      buyerOffer2: 88,
      vendorQuote2: 91,
      finalAgreedRate: 89,
      previousPpoRate: 80,
      referenceQty: 3,
      remarks: 'accepted',
      status: 'CLOSED',
      isExcluded: true,
      exclusionReason: 'Out of scope',
    });
    expect(JSON.parse(serializeItemMeta(meta))).toEqual(meta);
  });

  it('uses safe defaults and recognizes the accepted vendor status', () => {
    expect(parseItemMeta({ rate: 0, rateCard: { status: 'FINAL_VENDOR_OFFER_ACCEPTED' } })).toMatchObject({
      buyerOffer1: 0,
      vendorQuote1: null,
      finalAgreedRate: 0,
      previousPpoRate: null,
      referenceQty: 1,
      remarks: '',
      status: 'IN_NEGOTIATION',
      isExcluded: false,
      exclusionReason: '',
    });
    expect(parseItemMeta({ rate: 5, rateCard: { status: 'DRAFT' } }).finalAgreedRate).toBeNull();
  });
});

describe('stored JSON object parsing', () => {
  it('distinguishes absent data, valid objects, malformed JSON, and non-object JSON', () => {
    expect(parseStoredJsonObject(null)).toEqual({});
    expect(parseStoredJsonObject(JSON.stringify({ agreement: { required: true } })))
      .toEqual({ agreement: { required: true } });
    expect(parseStoredJsonObject('{broken')).toBeNull();
    expect(parseStoredJsonObject('[]')).toBeNull();
    expect(parseStoredJsonObject('null')).toBeNull();
    expect(parseStoredJsonObject(12)).toBeNull();
  });
});

describe('rate card negotiation metadata', () => {
  it.each([
    ['ROUND_2_BUYER_OFFER', 2],
    ['ROUND_2_VENDOR_QUOTE', 2],
    ['ROUND_3_BUYER_OFFER', 3],
    ['ROUND_3_VENDOR_QUOTE', 3],
    ['DRAFT', 1],
  ])('derives round %s', (status, currentRound) => {
    expect(parseRateCardNegotiation({ status, notes: '{"currentRound":0}' }).currentRound).toBe(currentRound);
  });

  it('keeps explicit rounds, parses objects, and defaults malformed or non-object notes', () => {
    const meta = { currentRound: 3, workflowStage: 'FINANCE', round3: { buyerOffer3Actor: 'buyer' } };
    expect(parseRateCardNegotiation({ notes: JSON.stringify(meta) })).toEqual(meta);
    expect(parseRateCardNegotiation({ notes: 'plain text', status: 'DRAFT' })).toEqual({ currentRound: 1 });
    expect(parseRateCardNegotiation({ notes: 'null', status: 'DRAFT' })).toEqual({ currentRound: 1 });
    expect(parseRateCardNegotiation({ status: 'DRAFT' })).toEqual({ currentRound: 1 });
    expect(JSON.parse(serializeRateCardNegotiation(meta))).toEqual(meta);
  });
});

describe('status labels', () => {
  it.each([
    ['DRAFT', 'Draft Rate Card'],
    ['ROUND_1_BUYER_OFFER', expect.stringContaining('Waiting for Vendor')],
    ['SENT_TO_VENDOR', expect.stringContaining('Waiting for Vendor')],
    ['ROUND_1_VENDOR_QUOTE', expect.stringContaining('Commercial Review')],
    ['ROUND_2_BUYER_OFFER', expect.stringContaining('Waiting for Vendor')],
    ['ROUND_2_VENDOR_QUOTE', expect.stringContaining('Final Commercial Review')],
    ['ROUND_3_BUYER_OFFER', 'Buyer RC Offer-3 Submitted'],
    ['ROUND_3_VENDOR_QUOTE', 'Vendor RC Quote-3 Received'],
    ['FINAL_VENDOR_OFFER_ACCEPTED', expect.stringContaining('Category Manager Acceptance')],
    ['CATEGORY_MANAGER_ACCEPTED', expect.stringContaining('Vendor Acceptance')],
    ['VENDOR_ACCEPTED', expect.stringContaining('Project Approval')],
    ['PENDING_PROJECT_APPROVAL', expect.stringContaining('Project Approval')],
    ['PENDING_FINANCE_APPROVAL', expect.stringContaining('Finance Approval')],
    ['APPROVED', 'Active / Contracted Rate Card'],
    ['RETURNED_FOR_CORRECTION', 'Returned for Correction'],
    ['REJECTED', 'Rejected'],
    ['EXPIRED', 'Expired'],
    ['CUSTOM_STATUS', 'CUSTOM STATUS'],
    ['', 'Unknown'],
  ])('labels %s', (status, expected) => {
    expect(getRateCardStatusLabel(status)).toEqual(expected);
  });
});

import { isRateCardSelectable } from '../src/lib/rate-card-selection';

describe('rate card selection for an RFQ', () => {
  const browserNow = new Date('2026-11-17T00:00:00.000Z');

  it('requires an approved rate card', () => {
    expect(isRateCardSelectable({ status: 'DRAFT', validTo: '2027-01-01' }, browserNow)).toBe(false);
  });

  it('follows the server expiry flag when the server supplies one', () => {
    expect(isRateCardSelectable({ status: 'APPROVED', isExpired: true, validTo: '2027-01-01' }, browserNow)).toBe(false);
    expect(isRateCardSelectable({ status: 'APPROVED', isExpired: false, validTo: '2026-01-01' }, browserNow)).toBe(true);
  });

  it('falls back to the browser clock when the server flag is missing', () => {
    expect(isRateCardSelectable({ status: 'APPROVED', validTo: '2026-01-01' }, browserNow)).toBe(false);
    expect(isRateCardSelectable({ status: 'APPROVED', validTo: '2027-01-01' }, browserNow)).toBe(true);
    expect(isRateCardSelectable({ status: 'APPROVED', validTo: null }, browserNow)).toBe(true);
  });
});

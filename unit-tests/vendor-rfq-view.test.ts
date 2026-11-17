import { toVendorRfqView } from '../src/lib/vendor-rfq-view';

describe('vendor RFQ view', () => {
  it('removes buyer reference prices from the RFQ, its lines, and its negotiations', () => {
    const rfq = {
      id: 'rfq-1',
      rfqNumber: 'RFQ-1',
      estimatedBenchmarkValue: 1_000_000,
      lines: [{ id: 'line-1', description: 'Tiles', quantity: 10, benchmarkRate: 42, benchmarkAmount: 420 }],
      negotiations: [{ id: 'neg-1', status: 'ACTIVE', bestQuoteAmount: 880_000, rounds: [{ id: 'round-1', vendorId: 'vendor-1' }] }],
    };

    const view = toVendorRfqView(rfq);

    expect(view).toMatchObject({ id: 'rfq-1', rfqNumber: 'RFQ-1' });
    expect(view).not.toHaveProperty('estimatedBenchmarkValue');
    expect(view.lines).toEqual([{ id: 'line-1', description: 'Tiles', quantity: 10 }]);
    expect(view.negotiations).toEqual([{ id: 'neg-1', status: 'ACTIVE', rounds: [{ id: 'round-1', vendorId: 'vendor-1' }] }]);
  });

  it('leaves records without the optional collections unchanged and does not mutate the input', () => {
    const rfq = { id: 'rfq-2', estimatedBenchmarkValue: 5 };
    expect(toVendorRfqView(rfq)).toEqual({ id: 'rfq-2' });
    expect(rfq).toHaveProperty('estimatedBenchmarkValue', 5);
    expect(toVendorRfqView({ id: 'rfq-3' })).toEqual({ id: 'rfq-3' });
  });
});

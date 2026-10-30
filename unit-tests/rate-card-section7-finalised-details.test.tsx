/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Section7FinalisedDetails from '../src/components/rate-cards/Section7FinalisedDetails';

jest.mock('xlsx', () => ({
  __esModule: true,
  utils: {
    json_to_sheet: jest.fn((rows: unknown[]) => ({ rows })),
    book_new: jest.fn(() => ({ sheets: [] as unknown[] })),
    book_append_sheet: jest.fn((book: { sheets: unknown[] }, sheet: unknown, name: string) => {
      book.sheets.push({ sheet, name });
    }),
  },
  writeFile: jest.fn(),
}));

jest.mock('../src/components/rate-cards/AgreementPreviewModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, agreement }: any) => isOpen
    ? <div role="dialog" aria-label="Agreement preview"><span>{agreement?.documentTitle || 'Agreement'}</span><button onClick={onClose}>Close agreement</button></div>
    : null,
}));

const xlsx = require('xlsx');

describe('rate card Section 7 finalised details', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the baseline information, agreement preview, exported workbook, and all detail tabs', () => {
    render(<Section7FinalisedDetails />);

    expect(screen.getByText('1. Rate Card Overview')).toBeInTheDocument();
    expect(screen.getByText('Ramakrishna Interiors')).toBeInTheDocument();
    expect(screen.getByText('Vendor Code: VND-0006')).toBeInTheDocument();
    expect(screen.getByText('3. Commercial Terms & Conditions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Executed Agreement' }));
    expect(screen.getByRole('dialog', { name: 'Agreement preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close agreement' }));
    expect(screen.queryByRole('dialog', { name: 'Agreement preview' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download Rate Card' }));
    expect(xlsx.utils.json_to_sheet).toHaveBeenCalledTimes(2);
    expect(xlsx.utils.book_append_sheet).toHaveBeenCalledTimes(2);
    expect(xlsx.writeFile).toHaveBeenCalledWith(expect.any(Object), 'proCPX_Finalised_Rate_Card_RC-2026-0006.xlsx');
    expect(screen.getByText('Downloaded Excel')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.queryByText('Downloaded Excel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Agreed Rates/ }));
    expect(screen.getByText('Final Agreed Rates Schedule')).toBeInTheDocument();
    expect(screen.getByText('Gypsum False Ceiling')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Negotiation History' }));
    expect(screen.getByText('Multi-Round Commercial Negotiation Audit Trail')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign-off Timeline' }));
    expect(screen.getByText('Governance Sign-off Timeline & Approvals Chain')).toBeInTheDocument();
    expect(screen.getByText('All Milestones Completed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rate Card Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview / View Executed Agreement' }));
    expect(screen.getByRole('dialog', { name: 'Agreement preview' })).toBeInTheDocument();
  });

  it('maps stored rate card items, notes, agreement and completed approvals into the details', () => {
    const rateCard = {
      rateCardNumber: 'RC-STORED-1',
      vendor: { name: 'Stored Vendor', code: 'ST-1' },
      category: 'Stored Category',
      subcategory: 'Stored Subcategory',
      title: 'Stored title',
      scope: 'Stored scope',
      terms: 'Stored terms',
      location: 'Pune',
      status: 'APPROVED',
      submittedBy: 'Stored actor',
      createdAt: '2026-10-10T08:00:00.000Z',
      validFrom: '2026-10-01T00:00:00.000Z',
      validTo: '2027-09-30T00:00:00.000Z',
      projectApprovedAt: '2026-10-25T04:00:00.000Z',
      financeApprovedAt: '2026-10-25T06:00:00.000Z',
      projectApprovedBy: 'Project Lead',
      financeApprovedBy: 'Finance Lead',
      items: [{
        id: 'stored-item', itemCode: 'ST-001', category: '', subcategory: '', description: 'Stored item',
        specification: '', uom: '', referenceQty: 0, minQuantity: 0, rate: 15,
        comparisonRef: JSON.stringify({ referenceQty: 7, buyerOffer1: 12, vendorQuote1: 11, buyerOffer2: 10, vendorQuote2: 9, finalAgreedRate: 8 }),
      }],
      notes: JSON.stringify({
        round1: { buyerOffer1Date: '2026-10-11T00:00:00.000Z', buyerOffer1Actor: 'Buyer One', vendorQuote1Date: '2026-10-12T00:00:00.000Z', vendorQuote1Actor: 'Vendor One' },
        round2: { buyerOffer2Date: '2026-10-13T00:00:00.000Z', buyerOffer2Actor: 'Buyer Two', vendorQuote2Date: '2026-10-14T00:00:00.000Z', vendorQuote2Actor: 'Vendor Two', vendorQuote2Remarks: 'Aligned' },
        buyerAccepted: { timestamp: '2026-10-15T00:00:00.000Z', actor: 'Final Buyer', remarks: 'Approved terms' },
        vendorAccepted: { timestamp: '2026-10-16T00:00:00.000Z', remarks: 'Signed terms' },
        projectApproved: { timestamp: '2026-10-17T00:00:00.000Z', actor: 'Project Lead', remarks: 'Project approved' },
        financeApproved: { timestamp: '2026-10-18T00:00:00.000Z', actor: 'Finance Lead', remarks: 'Finance approved' },
        agreement: { required: true, type: 'UPLOAD', documentTitle: 'Stored agreement', documentNumber: '', fileName: 'stored.pdf', signatureRequired: true, signature: { verified: false } },
      }),
    };

    render(<Section7FinalisedDetails rateCard={rateCard} />);
    expect(screen.getByText('Stored Vendor')).toBeInTheDocument();
    expect(screen.getByText('Status: Active')).toBeInTheDocument();
    expect(screen.getByText(/01 Oct 2026 to 30 Sep/)).toBeInTheDocument();
    expect(screen.getByText('Stored agreement')).toBeInTheDocument();
    expect(screen.getByText('Pending Signature')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download Rate Card' }));
    const exportedItem = xlsx.utils.json_to_sheet.mock.calls[0][0][0];
    expect(exportedItem).toMatchObject({
      'Item Code': 'ST-001', 'Item Description': 'Stored item', 'Quantity': 7,
      'Category': 'Stored Category', 'Sub-category': 'General',
    });
    const exportedRateKey = Object.keys(exportedItem).find((key) => key.startsWith('Agreed Unit Rate'));
    expect(exportedRateKey).toBeDefined();
    expect(exportedItem[exportedRateKey!]).toBe(8);

    fireEvent.click(screen.getByRole('button', { name: /Agreed Rates/ }));
    expect(screen.getAllByText('Stored item')).toHaveLength(2);
    expect(screen.getByText('SQFT')).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/\b8\b/);

    fireEvent.click(screen.getByRole('button', { name: 'Negotiation History' }));
    expect(screen.getByText(/Rate Card initiated by Buyer One/)).toBeInTheDocument();
    expect(screen.getByText(/Aligned/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign-off Timeline' }));
    expect(screen.getByText('Project approved')).toBeInTheDocument();
    expect(screen.getByText('Finance approved')).toBeInTheDocument();
  });

  it('handles malformed persisted JSON, missing agreements, empty schedules, and workbook export failures', () => {
    const print = jest.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    xlsx.writeFile.mockImplementation(() => { throw new Error('write failure'); });

    render(<Section7FinalisedDetails rateCard={{
      rateCardNumber: 'RC-DRAFT', status: 'DRAFT', notes: '{bad json', items: [{
        id: 'bad-meta', itemCode: 'BAD-1', description: 'Fallback description', rate: 25, minQuantity: 0, comparisonRef: '{bad json',
      }],
    }} agreement={null} />);
    expect(screen.queryByRole('button', { name: 'View Executed Agreement' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download Rate Card' }));
    expect(print).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Agreed Rates/ }));
    expect(screen.getAllByText('Fallback description')).toHaveLength(2);
    expect(screen.getAllByText(/Valuation:/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Negotiation History' }));
    expect(screen.getByText(/Savings:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign-off Timeline' }));
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getAllByText('Pending')).toHaveLength(2);

    cleanup();
    const empty = render(<Section7FinalisedDetails rateCard={{ rateCardNumber: 'RC-EMPTY', status: 'DRAFT', items: [], notes: null }} items={[]} agreement={{ required: false, type: 'NONE' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rate Card Info' }));
    expect(screen.getByText(/Direct Schedule of Rates/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Agreed Rates/ }));
    expect(screen.getAllByText(/Valuation:/).length).toBeGreaterThan(0);
    expect(empty.container).toBeInTheDocument();
  });
});

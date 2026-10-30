/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BoqLineDetailPage from '../src/app/(app)/boq/line/[id]/page';

const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'line-1' };
const mockClipboardWrite = jest.fn();

jest.mock('next/navigation', () => ({ useParams: () => mockParams, useRouter: () => ({ back: mockBack }) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, description, breadcrumbs, actions }: any) => <header>
    <h1>{title}</h1><p>{description}</p><nav>{breadcrumbs?.map((crumb: any) => <a key={crumb.label} href={crumb.href}>{crumb.label}</a>)}</nav>{actions}
  </header>,
}));
jest.mock('../src/components/ui/Card', () => ({
  __esModule: true,
  default: ({ title, children }: any) => <section><h2>{title}</h2>{children}</section>,
}));
jest.mock('../src/components/ui/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: any) => <span data-testid="status-badge">{status}</span>,
}));

const response = (body: any, ok = true) => ({ ok, json: async () => body });
const richLine = {
  id: 'line-1', lineNumber: 5, itemCode: 'ST-05', standardDescription: 'Mild Steel Frame',
  originalDescription: 'Steel support frame', specification: 'IS 2062 grade E250, hot dip galvanized',
  validationStatus: 'WARNING', validationMessages: JSON.stringify([
    { level: 'ERROR', message: 'Dimension missing' },
    { level: 'WARNING', message: 'Confirm finish' },
    { level: 'INFO', message: 'Imported from legacy BOQ' },
  ]),
  quantity: 3, uomRaw: 'kg', uom: { code: 'KG', name: 'Kilogram' }, aiUnitCost: 100, aiTotalCost: 350,
  costBreakdown: {
    materialPercent: 60, materialCost: 60, labourPercent: 20, labourCost: 20,
    otherChargesPercent: 10, otherCharges: 10, contractorMarginPercent: 10,
    contractorMargin: 10, aiUnitCost: 100, aiLineTotal: 300, engineeringBasis: 'Market rate + installation',
  },
  costSource: 'Engineering estimate', costMethod: 'Bottom-up', costConfidence: 0.92, benchmarkEligible: true,
  location: 'North Plant', brand: 'Tata', model: 'MS-250', material: 'Steel', grade: 'E250',
  drawingReference: 'DWG-22', remarks: 'Primer coat included', sourceSheet: 'Items', sourceRow: 12,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', boqRevisionId: 'revision-1',
  revision: { revisionCode: 'R3', boq: {
    id: 'boq-1', boqCode: 'BOQ-001', title: 'Plant Structural Works',
    project: { name: 'North Plant', projectCode: 'NP-01' }, costCentre: { code: 'CC-01', name: 'Civil Works' },
  } },
  category: { name: 'Civil' }, subcategory: { name: 'Steel Works' },
};

describe('BOQ line detail page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'line-1' };
    global.fetch = jest.fn().mockResolvedValue(response({ data: { line: richLine } }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mockClipboardWrite } });
  });

  it('renders full line, engineering cost, classification, diagnostics and traceability details', async () => {
    render(<BoqLineDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Line Item #5: Mild Steel Frame' })).toBeInTheDocument();
    expect(screen.getByText(/hot dip galvanized/)).toBeInTheDocument();
    expect(screen.getByText('Original Uploaded Description')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Raw: kg')).toBeInTheDocument();
    expect(screen.getAllByText('₹ 350').length).toBeGreaterThan(0);
    expect(screen.getByText('Line-Item Cost Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Material Cost')).toBeInTheDocument();
    expect(screen.getByText('Labour Cost')).toBeInTheDocument();
    expect(screen.getByText('Other Charges')).toBeInTheDocument();
    expect(screen.getByText('Contractor Margin')).toBeInTheDocument();
    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0);
    expect(screen.getByText('92% Confidence')).toBeInTheDocument();
    expect(screen.getByText('✓ Benchmark Eligible')).toBeInTheDocument();
    expect(screen.getByText('Dimension missing')).toBeInTheDocument();
    expect(screen.getByText('Confirm finish')).toBeInTheDocument();
    expect(screen.getByText('Imported from legacy BOQ')).toBeInTheDocument();
    expect(screen.getByText(/Sheet: Items/)).toBeInTheDocument();
    expect(screen.getAllByText('BOQ-001').length).toBeGreaterThan(0);
    expect(screen.getByText('Plant Structural Works')).toBeInTheDocument();
    expect(screen.getByText('North Plant (NP-01)')).toBeInTheDocument();
    expect(screen.getByText(/CC-01/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to BOQ' })).toHaveAttribute('href', '/boq/studio?id=boq-1');
    expect(screen.getByRole('link', { name: 'View in BOQ Workspace' })).toHaveAttribute('href', '/boq/studio?id=boq-1');

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(mockClipboardWrite).toHaveBeenCalledWith(richLine.specification);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('uses legacy values and missing-field fallbacks, including invalid validation JSON', async () => {
    const legacyLine = {
      id: 'line-2', lineNumber: 0, originalDescription: 'Legacy item', quantity: 2,
      aiUnitCost: 50, aiTotalCost: 0, costBreakdown: null, validationMessages: '{invalid json',
      benchmarkEligible: false, costConfidence: 0, boqRevisionId: 'revision-2',
      revision: { boq: { description: 'Legacy scope' } },
    };
    global.fetch = jest.fn().mockResolvedValue(response({ line: legacyLine }));
    render(<BoqLineDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Line Item #0: Legacy item' })).toBeInTheDocument();
    expect(screen.getByText('No technical specification text provided for this line.')).toBeInTheDocument();
    expect(screen.getByText('Component estimate unavailable for this legacy rate. Total unit cost is maintained at ₹ 50.')).toBeInTheDocument();
    expect(screen.getAllByText('₹ 100').length).toBeGreaterThan(0);
    expect(screen.getByText('Verified Baseline')).toBeInTheDocument();
    expect(screen.getByText('⚠ Non-benchmark')).toBeInTheDocument();
    expect(screen.getByText('Engineered Cost')).toBeInTheDocument();
    expect(screen.getByText('Method: Standard')).toBeInTheDocument();
    expect(screen.getByText('Rule compliant')).toBeInTheDocument();
    expect(screen.getAllByText('NOS').length).toBeGreaterThan(0);
    expect(screen.getByText('Legacy scope')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to BOQ' })).toHaveAttribute('href', '/boq/revision-2');
  });

  it('handles zero quantities and missing benchmark, classification and import values', async () => {
    const minimalLine = {
      id: 'line-3', lineNumber: 1, originalDescription: 'Unpriced allowance', quantity: 0,
      aiUnitCost: 20, aiTotalCost: 0, costBreakdown: {
        materialPercent: 50, materialCost: 10, labourPercent: 30, labourCost: 6,
        otherChargesPercent: 10, otherCharges: 2, contractorMarginPercent: 10,
        contractorMargin: 2, aiUnitCost: 20, aiLineTotal: 0, engineeringBasis: 'Budgetary estimate',
      },
      validationMessages: '[]', benchmarkEligible: false,
      revision: { boq: { title: '' } },
    };
    global.fetch = jest.fn().mockResolvedValue(response({ data: { line: minimalLine } }));
    render(<BoqLineDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Line Item #1: Unpriced allowance' })).toBeInTheDocument();
    expect(screen.getByText('Quantity required to compute line total')).toBeInTheDocument();
    expect(screen.getByText('— (Pending Qty)')).toBeInTheDocument();
    expect(screen.getByText(/Rate:/)).toHaveTextContent('₹ 20');
    expect(screen.getByText('Rule compliant')).toBeInTheDocument();
    expect(screen.getByText('Commercial Package')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to BOQ' })).toHaveAttribute('href', '/boq');
  });

  it('shows not-found states for failed, missing and unavailable line records', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({ error: 'Access denied' }, false));
    const failed = render(<BoqLineDetailPage />);
    expect(await screen.findByText('Line Item Not Found')).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(mockBack).toHaveBeenCalled();
    failed.unmount();

    global.fetch = jest.fn().mockResolvedValue(response({}, false));
    const genericFailure = render(<BoqLineDetailPage />);
    expect(await screen.findByText('Failed to load line item details')).toBeInTheDocument();
    genericFailure.unmount();

    global.fetch = jest.fn().mockResolvedValue(response({}));
    const missing = render(<BoqLineDetailPage />);
    expect(await screen.findByText('The requested BOQ line item does not exist or you do not have permission to view it.')).toBeInTheDocument();
    missing.unmount();

    global.fetch = jest.fn().mockRejectedValue(new Error('line service offline'));
    render(<BoqLineDetailPage />);
    expect(await screen.findByText('line service offline')).toBeInTheDocument();

    global.fetch = jest.fn().mockRejectedValue({});
    render(<BoqLineDetailPage />);
    expect(await screen.findByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('stays in loading state and skips the request when no line id exists', () => {
    mockParams = {};
    render(<BoqLineDetailPage />);
    expect(screen.getByText('Loading line item details...')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

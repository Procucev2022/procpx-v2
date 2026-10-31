/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BoqLineDetailPage from '../src/app/(app)/boq/line/[id]/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


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
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.lineItemLineNumberValue2) })).toBeInTheDocument();
    expect(screen.getByText(/hot dip galvanized/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.originalUploadedDescription))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.copyezvv42, '', true))).toBeInTheDocument();
    expect(screen.getByText('Raw: kg')).toBeInTheDocument();
    expect(screen.getAllByText(interpolateUiString(UI_STRINGS.common.currencyAmount, { currency: `${UI_STRINGS.common.indianRupeeSymbol} `, amount: 350 })).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.lineItemCostBreakdown))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.materialCost))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.labourCost))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.otherCharges))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.contractorMargin))).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('300');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.roundConfidence))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.benchmarkEligible))).toBeInTheDocument();
    expect(screen.getByText('Dimension missing')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProcurementRfqsIdPage.confirmValue1))).toBeInTheDocument();
    expect(screen.getByText('Imported from legacy BOQ')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.sheetSourceSheet))).toBeInTheDocument();
    expect(screen.getAllByText('BOQ-001').length).toBeGreaterThan(0);
    expect(screen.getByText('Plant Structural Works')).toBeInTheDocument();
    expect(screen.getByText('North Plant (NP-01)')).toBeInTheDocument();
    expect(screen.getByText(/CC-01/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.returnToBOQ) })).toHaveAttribute('href', '/boq/studio?id=boq-1');
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.viewInBOQWorkspace) })).toHaveAttribute('href', '/boq/studio?id=boq-1');

    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.copy) }));
    expect(mockClipboardWrite).toHaveBeenCalledWith(richLine.specification);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.copied) })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.copy) })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.lineItemLineNumberValue2) })).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.noTechnicalSpecificationTextProvidedForThisLine))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.componentEstimateUnavailableForThisLegacyRateTotalUnitCostIsMaintainedAt, { amount: 50 }))).toBeInTheDocument();
    expect(screen.getAllByText(interpolateUiString(UI_STRINGS.common.currencyAmount, { currency: `${UI_STRINGS.common.indianRupeeSymbol} `, amount: 100 })).length).toBeGreaterThan(0);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.verifiedBaseline))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.nonBenchmark))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.engineeredCost))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.methodValue, { value: UI_STRINGS.common.standard }))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.ruleCompliant))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.nOS)).length).toBeGreaterThan(0);
    expect(screen.getByText('Legacy scope')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.returnToBOQ) })).toHaveAttribute('href', '/boq/revision-2');
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
    expect(await screen.findByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.lineItemLineNumberValue2) })).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.quantityRequiredToComputeLineTotal))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.pendingQty))).toBeInTheDocument();
    expect(screen.getByText(interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.rateToLocaleString, { toLocaleString: '20' }))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.ruleCompliant))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.commercialPackage))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.returnToBOQ) })).toHaveAttribute('href', '/boq');
  });

  it('shows not-found states for failed, missing and unavailable line records', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({ error: 'Access denied' }, false));
    const failed = render(<BoqLineDetailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.lineItemNotFound))).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.goBack) }));
    expect(mockBack).toHaveBeenCalled();
    failed.unmount();

    global.fetch = jest.fn().mockResolvedValue(response({}, false));
    const genericFailure = render(<BoqLineDetailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails))).toBeInTheDocument();
    genericFailure.unmount();

    global.fetch = jest.fn().mockResolvedValue(response({}));
    const missing = render(<BoqLineDetailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.theRequestedBOQLineItemDoesNotExistOrYouDoNotHavePermissionToViewIt))).toBeInTheDocument();
    missing.unmount();

    global.fetch = jest.fn().mockRejectedValue(new Error('line service offline'));
    render(<BoqLineDetailPage />);
    expect(await screen.findByText('line service offline')).toBeInTheDocument();

    global.fetch = jest.fn().mockRejectedValue({});
    render(<BoqLineDetailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred))).toBeInTheDocument();
  });

  it('stays in loading state and skips the request when no line id exists', () => {
    mockParams = {};
    render(<BoqLineDetailPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppBoqLineIdPage.loadingLineItemDetails))).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import BudgetVsActualPage from '../src/app/(app)/budget/vs-actual/page';

jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      React.createElement('a', { href, ...props }, children),
  };
});
jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));

const searchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const projects = [
  { id: 'project-1', projectCode: 'P-001', name: 'North Retail' },
  { id: 'project-2', projectCode: 'P-002', name: 'South Office' },
];
const report = {
  kpis: { totalBudget: 1_500, totalCommitted: 1_200, totalActual: 900, totalRemaining: 600, totalBudgetVariance: 600, totalVariancePercent: 40 },
  costCentresSummary: [
    { id: 'cc-1', code: 'CC-1', name: 'Electrical', areaSqFt: 100 },
    { id: 'cc-2', code: 'CC-2', name: 'Mechanical', areaSqFt: 0 },
  ],
  categoriesSummary: [
    { category: 'Electrical & Controls', budgetAmount: 1_000, actualAmount: 0 },
    { category: 'Mechanical', budgetAmount: 0, actualAmount: 200 },
    { category: 'General', budgetAmount: 0, actualAmount: 0 },
  ],
  lineReports: [
    {
      boqLineId: 'line-1', description: 'Power conduit', boqCode: 'BOQ-1', revisionCode: 'R1', itemCode: 'CON-1',
      lineNumber: 'L-01', category: 'Electrical', costCentre: { code: 'CC-1' }, budgetAmount: 1_000,
      budgetQuantity: 10, uom: 'MTR', budgetRate: 100, committedAmount: 700, committedQuantity: 7,
      actualAmount: 900, actualQuantity: 9, budgetVariance: 100, budgetVariancePercent: 10, status: 'APPROVED',
    },
    {
      boqLineId: 'line-2', description: 'Pump bearing', boqCode: 'BOQ-2', revisionCode: 'R2', itemCode: null,
      lineNumber: 'L-02', category: 'Mechanical', costCentre: null, budgetAmount: 0,
      budgetQuantity: 2, uom: 'EA', budgetRate: 0, committedAmount: 0, committedQuantity: 0,
      actualAmount: 200, actualQuantity: 1, budgetVariance: -200, budgetVariancePercent: -100, status: null,
    },
  ],
};

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('budget versus actual page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams.mockReturnValue(new URLSearchParams('projectId=project-1&costCentreId=cc-1') as ReturnType<typeof useSearchParams>);
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response({ data: projects }))
      : Promise.resolve(response({ data: report })));
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('loads filtered budget reports and covers category, line and summary variations', async () => {
    render(<BudgetVsActualPage />);
    expect(await screen.findByText('Power conduit')).toBeInTheDocument();
    expect(screen.getByText('100 Sqft')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getAllByText('Electrical & Controls').length).toBeGreaterThan(0);
    expect(screen.getByText('Pump bearing')).toBeInTheDocument();
    expect(screen.getByText(/L-02/)).toBeInTheDocument();
    expect(screen.getAllByText(/CC-1/).length).toBeGreaterThan(0);
    expect(screen.queryByText('No budget or actual spend records found for selected filter.')).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/financial/budget-vs-actual?projectId=project-1&costCentreId=cc-1');

    const search = screen.getByPlaceholderText('Search description, item code...');
    fireEvent.change(search, { target: { value: 'conduit' } });
    expect(screen.getByText('Power conduit')).toBeInTheDocument();
    expect(screen.queryByText('Pump bearing')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'l-02' } });
    expect(screen.getByText('Pump bearing')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'mechanical' } });
    expect(screen.getByText('Pump bearing')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'brg-02' } });
    expect(screen.getByText('No traceable items found for this selection.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'con-1' } });
    expect(screen.getByText('Power conduit')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nothing' } });
    expect(screen.getByText('No traceable items found for this selection.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });

    const selectors = screen.getAllByRole('combobox');
    fireEvent.change(selectors[1], { target: { value: 'cc-2' } });
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/financial/budget-vs-actual?projectId=project-1&costCentreId=cc-2'));
    fireEvent.change(selectors[2], { target: { value: 'Electrical & Controls' } });
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/financial/budget-vs-actual?projectId=project-1&costCentreId=cc-2&category=Electrical%20%26%20Controls'));
    fireEvent.change(selectors[0], { target: { value: 'project-2' } });
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/financial/budget-vs-actual?projectId=project-2&category=Electrical%20%26%20Controls'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/financial/budget-vs-actual?projectId=project-2&category=Electrical%20%26%20Controls'));
  });

  it('uses defaults for empty reports and handles initial selection and request failures', async () => {
    searchParams.mockReturnValue(new URLSearchParams('projectId=missing&costCentreId=cc-missing') as ReturnType<typeof useSearchParams>);
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response(projects))
      : Promise.resolve(response({ data: { costCentresSummary: [], categoriesSummary: [], lineReports: [] } })));
    render(<BudgetVsActualPage />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/financial/budget-vs-actual?projectId=project-1&costCentreId=cc-missing'));
    expect(await screen.findByText('No budget or actual spend records found for selected filter.')).toBeInTheDocument();
    expect(screen.getByText('No traceable items found for this selection.')).toBeInTheDocument();
    expect(screen.getAllByText('Not specified')).toHaveLength(1);
    expect(screen.getAllByText('Area missing')).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith('/api/financial/budget-vs-actual?projectId=project-1&costCentreId=cc-missing');

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockImplementation((url: string) => url === '/api/projects'
      ? Promise.resolve(response(projects))
      : Promise.reject(new Error('report offline')));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-2' } });
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    consoleError.mockRestore();
  });

  it('keeps a zero project list usable when the projects request fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('projects offline'));
    render(<BudgetVsActualPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByText('TOTAL BUDGET')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    consoleError.mockRestore();
  });
});

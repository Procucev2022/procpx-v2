/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MyPrsPage from '../src/app/(app)/pr/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const toastSuccess = jest.fn();
const toastError = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    require('react').createElement('a', { ...props, href }, children),
}));
jest.mock('../src/components/ui/Toast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));
jest.mock('../src/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({ title, subtitle, actions }: { title: string; subtitle: string; actions: React.ReactNode }) =>
    require('react').createElement('header', null,
      require('react').createElement('h1', null, title),
      require('react').createElement('p', null, subtitle), actions),
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCard: ({ label, value }: { label: string; value: React.ReactNode }) =>
    require('react').createElement('div', null, `${label}: ${value}`),
  SummaryCardGrid: ({ children }: { children: React.ReactNode }) =>
    require('react').createElement('section', null, children),
}));
jest.mock('../src/components/ui/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => require('react').createElement('span', null, status),
}));
jest.mock('../src/components/ui/EmptyState', () => ({
  __esModule: true,
  default: ({ title, description }: { title: string; description: string }) =>
    require('react').createElement('div', null,
      require('react').createElement('strong', null, title),
      require('react').createElement('p', null, description)),
}));
jest.mock('../src/components/ApprovalChatDrawer', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, onMessageSent, entityCode }: {
    isOpen: boolean; onClose: () => void; onMessageSent: () => void; entityCode: string;
  }) => isOpen ? require('react').createElement('aside', null,
    require('react').createElement('span', null, `Chat ${entityCode}`),
    require('react').createElement('button', { onClick: onMessageSent }, 'Message sent'),
    require('react').createElement('button', { onClick: onClose }, 'Close chat')) : null,
}));

const prs = [
  {
    id: 'draft', prNumber: 'PR-DRAFT', title: 'Copper cable package', status: 'PR_DRAFT',
    projectId: 'project-1', project: { name: 'West Campus', projectCode: 'WC-01' },
    costCentreId: 'cc-1', costCentre: { name: 'Electrical', code: 'CC-01' }, boqId: 'boq-1', boq: { boqCode: 'BOQ-01' },
    categories: ['Electrical', 'Cable'], totalLines: 3, totalEstimatedValue: 1200,
  },
  {
    id: 'returned', prNumber: 'PR-RETURN', title: 'Returned panel order', status: 'PR_RETURNED_FOR_CORRECTION',
    projectId: 'project-2', project: { name: 'East Office', projectCode: 'EO-02' }, costCentreId: 'cc-2',
    costCentre: { name: 'Panels', code: 'CC-02' }, boqId: 'boq-2', boq: {}, categories: [], totalLines: 0,
    totalEstimatedValue: 0, rejectionReason: 'Attach a revised quote',
  },
  {
    id: 'pending', prNumber: 'PR-PENDING', title: 'Pending flooring', status: 'PR_PENDING_PROJECT_APPROVAL',
    projectId: 'project-3', project: null, costCentreId: 'cc-3', costCentre: { name: 'Flooring', code: 'CC-03' }, boqId: 'boq-3', boq: null,
    categories: null, totalLines: null, totalEstimatedValue: null,
  },
  {
    id: 'released', prNumber: 'PR-RELEASED', title: 'Released lighting', status: 'PR_RELEASED_TO_PROCUREMENT',
    projectId: 'project-4', project: { name: 'North Plant', projectCode: 'NP-04' }, costCentreId: null, costCentre: {},
    boqId: 'boq-4', boq: { boqCode: 'BOQ-04' }, categories: ['Lighting'], totalLines: 2, totalEstimatedValue: 5400,
  },
  {
    id: 'rejected', prNumber: 'PR-REJECTED', title: 'Rejected concrete', status: 'PR_REJECTED',
    projectId: 'project-5', project: { name: 'South Yard' }, costCentreId: 'cc-5', costCentre: { name: 'South Yard' },
    boqId: 'boq-5', boq: {}, categories: [], totalLines: 1, totalEstimatedValue: 0, rejectionReason: 'Budget exceeded',
  },
];

describe('PR register page', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, json: async () => ({}) } as Response;
      return { ok: true, json: async () => prs } as Response;
    });
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('loads the register, filters across supported fields, submits, and refreshes chat', async () => {
    render(<MyPrsPage />);
    expect(await screen.findByText('PR-DRAFT')).toBeInTheDocument();
    expect(screen.getByText('Total PRs: 5')).toBeInTheDocument();
    expect(screen.getByText('Released to Sourcing: 1')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval: 1')).toBeInTheDocument();
    expect(screen.getByText('Draft / Corrections: 2')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /BOQ-01/ })).toHaveTextContent(`${UI_STRINGS.common.bOQ2}BOQ-01`);
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppPrPage.generalCapex))).toHaveLength(3);
    expect(screen.getByText('Attach a revised quote')).toBeInTheDocument();
    expect(screen.getByText('Budget exceeded')).toBeInTheDocument();
    expect(screen.getByText('North Plant')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppBoqStudioPage.details) })[0]).toHaveAttribute('href', '/boq/studio?boqId=boq-1&projectId=project-1&costCentreId=cc-1');

    const search = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.pRNumber));
    for (const query of ['pr-draft', 'panel order', 'West Campus', 'Flooring']) {
      fireEvent.change(search, { target: { value: query } });
      await waitFor(() => expect(screen.getByRole('row', { name: new RegExp(query, 'i') })).toBeInTheDocument());
    }
    fireEvent.change(search, { target: { value: 'no matching record' } });
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrPage.tryClearingFiltersToFindMoreRecords))).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(await screen.findByText('PR-RETURN')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submit) }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(
      UI_STRINGS.appAppPrPage.pRSubmittedSuccessfully, 'draft', UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover,
    ));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrPage.pRSubmittedSuccessfully))).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/pr/draft/submit', { method: 'POST' });

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.chat) })[0]);
    expect(screen.getByText('Chat PR-DRAFT')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Message sent' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(screen.queryByText('Chat PR-DRAFT')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.common.chat) })[1]);
    expect(screen.getByText('Chat PR-RETURN')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.copy4i33ao) }));
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppPrPage.pRSubmittedSuccessfully))).not.toBeInTheDocument();
  });

  it('applies status filters and reports submit and fetch failures', async () => {
    render(<MyPrsPage />);
    await screen.findByText('PR-DRAFT');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PR_PENDING_PROJECT_APPROVAL' } });
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/pr?status=PR_PENDING_PROJECT_APPROVAL'));
    expect(await screen.findByText('PR-PENDING')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    await screen.findByText('PR-DRAFT');

    (global.fetch as jest.Mock).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, json: async () => ({ error: 'Approval service unavailable' }) };
      return { ok: true, json: async () => [prs[0]] };
    });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submit) }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Approval service unavailable'));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.errorMessage))).toBeInTheDocument();

    (global.fetch as jest.Mock).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => [prs[0]] };
    });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submit) }));
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith('Failed to submit PR'));

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error(''));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.submit) }));
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith('Error submitting PR'));

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.common.pRNumber)), { target: { value: 'no match' } });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PR_REJECTED' } });
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrPage.tryClearingFiltersToFindMoreRecords))).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('shows the default empty-state guidance when there are no PRs', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    render(<MyPrsPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppPrPage.noPRsFound))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppPrPage.createAPROrDeriveOneFromABOQInBOQStudio))).toBeInTheDocument();
  });
});

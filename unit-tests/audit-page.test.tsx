/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuditTrailPage from '../src/app/(app)/audit/page';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/components/ui/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => <header><h1>{title}</h1><p>{subtitle}</p></header>,
}));
jest.mock('../src/components/ui/SummaryCard', () => ({
  SummaryCardGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SummaryCard: ({ label, value, secondary }: { label: string; value: React.ReactNode; secondary: string }) => (
    <section><span>{label}</span><span>{value}</span><span>{secondary}</span></section>
  ),
}));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const response = (data: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(data) });
const baseLog = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, entityType: 'PROJECT', entityId: `entity-${id}`, action: 'UPDATE', description: `Audit event ${id}`,
  createdAt: '2026-10-01T10:00:00.000Z', user: { name: 'Ada User', email: 'ada@example.test' }, ...overrides,
});

describe('audit trail page', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(response({ data: [], total: 0, totalPages: 1 }));
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleError.mockRestore();
  });

  it('shows loading and empty states, and leaves the empty state on unsuccessful responses', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    const view = render(<AuditTrailPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAuditPage.loadingAuditTrail))).toBeInTheDocument();
    view.unmount();

    fetchMock.mockResolvedValueOnce(response({ data: [], total: 0, totalPages: 1 }, false));
    render(<AuditTrailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppAuditPage.noAuditRecordsMatchTheSelectedCriteria))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/audit?page=1&pageSize=25');
  });

  it('renders users, known and fallback actions, and inspects parsed and legacy state diffs', async () => {
    const logs = [
      baseLog('old-values', {
        action: 'UPDATE', oldValues: '{"previous":true}', newValue: 'not-json',
        user: { name: null, email: 'fallback@example.test' },
      }),
      baseLog('no-diff', { action: 'UNLISTED_ACTION', oldValue: null, newValue: null, oldValues: null, newValues: null, user: null }),
      baseLog('parsed', { action: 'CREATE', oldValue: '{"before":1}', newValue: '{"after":2}' }),
    ];
    fetchMock.mockResolvedValueOnce(response({ data: logs, total: 3, totalPages: 1 }));
    render(<AuditTrailPage />);

    expect(await screen.findByText('Audit event old-values')).toBeInTheDocument();
    expect(screen.getByText('fallback@example.test')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.system, '', true))).toBeInTheDocument();
    expect(screen.getByText('UNLISTED_ACTION')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.none))).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.inspectDiff) })[0]);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppAuditPage.auditEventStateDiff, '', false))).toBeInTheDocument();
    const oldAndNew = document.querySelectorAll('pre');
    expect(oldAndNew[0].textContent).toContain('previous');
    expect(oldAndNew[1].textContent).toBe('"not-json"');
    fireEvent.click(screen.getByText(uiStringPattern(UI_STRINGS.appAppAuditPage.auditEventStateDiff, '', false)).parentElement!.querySelector('button')!);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppAuditPage.auditEventStateDiff))).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.inspectDiff) })[1]);
    expect(document.querySelectorAll('pre')[0].textContent).toContain('before');
    expect(document.querySelectorAll('pre')[1].textContent).toContain('after');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.close) }));
  });

  it('applies entity/action filters and bounds page navigation', async () => {
    fetchMock.mockResolvedValue(response({
      data: [baseLog('filtered')], total: 75, totalPages: 3,
    }));
    render(<AuditTrailPage />);
    expect(await screen.findByText('Audit event filtered')).toBeInTheDocument();
    const [entityFilter, actionFilter] = screen.getAllByRole('combobox');
    fireEvent.change(entityFilter, { target: { value: 'PROJECT' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/audit?page=1&pageSize=25&entityType=PROJECT'));
    fireEvent.change(actionFilter, { target: { value: 'CREATE' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/audit?page=1&pageSize=25&entityType=PROJECT&action=CREATE'));

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.next) }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/audit?page=2&pageSize=25&entityType=PROJECT&action=CREATE'));
    expect(screen.getAllByText(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: 2, value2: 3 })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.next) }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/audit?page=3&pageSize=25&entityType=PROJECT&action=CREATE'));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.next) })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.previous) }));
    await waitFor(() => expect(screen.getAllByText(interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: 2, value2: 3 })).length).toBeGreaterThan(0));
    fireEvent.change(entityFilter, { target: { value: '' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/audit?page=1&pageSize=25&action=CREATE'));
  });

  it('supports nested response formats, defaults missing totals, and handles fetch exceptions', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: { data: [baseLog('nested')], total: 1, totalPages: 1 } }));
    const view = render(<AuditTrailPage />);
    expect(await screen.findByText('Audit event nested')).toBeInTheDocument();
    view.unmount();

    fetchMock.mockResolvedValueOnce(response({ data: { unexpected: true } }));
    const empty = render(<AuditTrailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppAuditPage.noAuditRecordsMatchTheSelectedCriteria))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppBudgetPage.copyepw9f3)).length).toBeGreaterThan(0);
    empty.unmount();

    fetchMock.mockRejectedValueOnce(new Error('audit service offline'));
    const { unmount } = render(<AuditTrailPage />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppAuditPage.noAuditRecordsMatchTheSelectedCriteria))).toBeInTheDocument();
    unmount();
  });
});

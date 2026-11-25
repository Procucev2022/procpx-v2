/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import Sidebar from '../src/components/Sidebar';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: Record<string, unknown> & { children?: React.ReactNode }) => require('react').createElement('a', props, props.children),
}));

const pathnameMock = usePathname as unknown as jest.Mock;
const user = (role: string) => ({ role, name: 'Ada', email: 'ada@example.test', tenantName: 'Tenant One' });

describe('Sidebar role navigation', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    pathnameMock.mockReturnValue('/dashboard');
  });

  it.each([
    ['PROCUREMENT_USER', ['Approved PRs', 'RFQs', 'Rate Cards', 'Vendors', 'Negotiations', 'Auctions', 'Awards', 'PPOs & Orders', 'Audit Trail']],
    ['PROJECT_USER', ['Projects', 'Cost Centres', 'Standard BOQ Creation', 'Category Creation', 'BOQ Studio', 'Project Budget', 'Budget Transaction Ledger']],
    ['PROJECT_APPROVER', ['Projects', 'BOQ Approvals', 'Budget Approvals', 'Rate Card Approvals', 'Vendor Performance Approvals', 'Activity & Audit']],
    ['FINANCE_USER', ['Budget Approvals', 'Rate Card Approvals', 'Project Budget', 'Audit Trail']],
    ['FINANCE_APPROVER', ['Budget Approvals', 'Rate Card Approvals', 'Project Budget', 'Audit Trail']],
    ['CATEGORY_MANAGER', ['Projects', 'Category Creation', 'Approved PRs', 'Negotiations', 'PPOs & Orders']],
    ['VENDOR', ['Vendor Dashboard', 'Company Profile', 'My RFQs & Bids', 'Auctions & Bidding', 'PPOs / Orders', 'Rate Cards']],
  ])('renders navigation entries for %s', (role, labels) => {
    pathnameMock.mockReturnValue('/procurement/rfqs/123');
    render(<Sidebar user={user(role)} />);
    for (const label of labels) expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    if (role === 'PROCUREMENT_USER') {
      expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.rFQs) })).toHaveClass('active');
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    }
  });

  it('does not show procurement requests link for any role', () => {
    pathnameMock.mockReturnValue('/pr/pr-123');
    render(<Sidebar user={user('PROJECT_USER')} />);
    expect(screen.queryByRole('link', { name: uiStringPattern(UI_STRINGS.componentsSidebar.procurementRequests) })).not.toBeInTheDocument();

    cleanup();
    render(<Sidebar user={user('SUPER_ADMIN')} />);
    expect(screen.queryByRole('link', { name: uiStringPattern(UI_STRINGS.componentsSidebar.procurementRequests) })).not.toBeInTheDocument();
  });

  it('shows award approvals only to finance roles that can approve awards', () => {
    pathnameMock.mockReturnValue('/procurement/awards');
    render(<Sidebar user={user('FINANCE_USER')} />);
    const link = screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsSidebar.awardApprovals) });
    expect(link).toHaveAttribute('href', '/procurement/awards');
    expect(link).toHaveClass('active');

    cleanup();
    render(<Sidebar user={user('FINANCE_APPROVER')} />);
    expect(screen.queryByRole('link', { name: uiStringPattern(UI_STRINGS.componentsSidebar.awardApprovals) })).not.toBeInTheDocument();
  });

  it('shows permission-filtered admin links for super admins and hides them for viewers', () => {
    render(<Sidebar user={user('SUPER_ADMIN')} />);
    for (const label of ['Projects', 'Cost Centres', 'BOQ Studio', 'BOQs', 'Approved BOQs', 'Vendor Management', 'Rate Card Management', 'Quotes', 'Negotiations', 'Auctions', 'Awards & PPOs', 'Users', 'Masters', 'Audit Trail']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    cleanup();
    render(<Sidebar user={user('VIEWER')} />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.projects) })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: uiStringPattern(UI_STRINGS.common.users) })).not.toBeInTheDocument();
  });

  it('restores, toggles and persists collapsed navigation state', () => {
    localStorage.setItem('sidebar_collapsed', 'true');
    const { container } = render(<div><main className="app-main" /><Sidebar user={user('PROCUREMENT_USER')} /></div>);
    const sidebar = container.querySelector('.app-sidebar');
    const main = container.querySelector('.app-main');
    expect(sidebar).toHaveClass('collapsed');
    expect(main).toHaveClass('sidebar-collapsed');
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.approvedPRs))).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProcurementApprovedPrsPage.approvedPRs) })).toHaveAttribute('title', UI_STRINGS.appAppProcurementApprovedPrsPage.approvedPRs);

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsSidebar.expandSidebar) }));
    expect(sidebar).not.toHaveClass('collapsed');
    expect(main).not.toHaveClass('sidebar-collapsed');
    expect(localStorage.getItem('sidebar_collapsed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsSidebar.collapseSidebar2) }));
    expect(sidebar).toHaveClass('collapsed');
    expect(main).toHaveClass('sidebar-collapsed');
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
  });

  it('toggles when no app-main layout node exists', () => {
    const { container } = render(<Sidebar user={user('VENDOR')} />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsSidebar.collapseSidebar2) }));
    expect(container.querySelector('.app-sidebar')).toHaveClass('collapsed');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsSidebar.expandSidebar) }));
    expect(container.querySelector('.app-sidebar')).not.toHaveClass('collapsed');
  });
});

/** @jest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import Sidebar from '../src/components/Sidebar';

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
      expect(screen.getByRole('link', { name: 'RFQs' })).toHaveClass('active');
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    }
  });

  it('shows permission-filtered admin links for super admins and hides them for viewers', () => {
    render(<Sidebar user={user('SUPER_ADMIN')} />);
    for (const label of ['Projects', 'Cost Centres', 'BOQ Studio', 'BOQs', 'Procurement Requests', 'Approved BOQs', 'Vendor Management', 'Rate Card Management', 'Quotes', 'Negotiations', 'Auctions', 'Awards & PPOs', 'Users', 'Masters', 'Audit Trail']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    cleanup();
    render(<Sidebar user={user('VIEWER')} />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('restores, toggles and persists collapsed navigation state', () => {
    localStorage.setItem('sidebar_collapsed', 'true');
    const { container } = render(<div><main className="app-main" /><Sidebar user={user('PROCUREMENT_USER')} /></div>);
    const sidebar = container.querySelector('.app-sidebar');
    const main = container.querySelector('.app-main');
    expect(sidebar).toHaveClass('collapsed');
    expect(main).toHaveClass('sidebar-collapsed');
    expect(screen.queryByText('Approved PRs')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Approved PRs' })).toHaveAttribute('title', 'Approved PRs');

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(sidebar).not.toHaveClass('collapsed');
    expect(main).not.toHaveClass('sidebar-collapsed');
    expect(localStorage.getItem('sidebar_collapsed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(sidebar).toHaveClass('collapsed');
    expect(main).toHaveClass('sidebar-collapsed');
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
  });

  it('toggles when no app-main layout node exists', () => {
    const { container } = render(<Sidebar user={user('VENDOR')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('.app-sidebar')).toHaveClass('collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(container.querySelector('.app-sidebar')).not.toHaveClass('collapsed');
  });
});

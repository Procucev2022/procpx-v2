/** @jest-environment jsdom */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HomeWorkspace, { RateCardRow } from '../src/components/rate-cards/HomeWorkspace';

const card = (id: string, overrides: Partial<RateCardRow> = {}): RateCardRow => ({
  id,
  rateCardId: id,
  vendor: 'Vendor 1',
  vendorCode: 'V-1',
  category: 'Civil',
  scope: `Unique Scope ${id}`,
  items: 2,
  validFrom: '01 Oct 2026',
  validUntil: '30 Sep 2027',
  status: 'Active',
  nextResponsible: 'Active Contract',
  currentStage: 'Negotiation',
  detailedStatus: 'Round 2',
  latestBuyerOffer: '₹ 100',
  latestSubmittedVendorQuote: '₹ 110',
  lastUpdated: '22 Oct 2026',
  ...overrides,
});

function HomeWorkspaceHarness({ cards, callbacks }: { cards: RateCardRow[]; callbacks: Record<string, jest.Mock> }) {
  const [activeSummaryTab, setActiveSummaryTab] = useState<'finalised' | 'in_progress'>('finalised');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  return <HomeWorkspace
    cards={cards}
    activeSummaryTab={activeSummaryTab}
    onTabChange={(tab) => { setActiveSummaryTab(tab); callbacks.onTabChange(tab); }}
    searchTerm={searchTerm}
    onSearchChange={(value) => { setSearchTerm(value); callbacks.onSearchChange(value); }}
    categoryFilter={categoryFilter}
    onCategoryFilterChange={(value) => { setCategoryFilter(value); callbacks.onCategoryFilterChange(value); }}
    vendorFilter={vendorFilter}
    onVendorFilterChange={(value) => { setVendorFilter(value); callbacks.onVendorFilterChange(value); }}
    statusFilter={statusFilter}
    onStatusFilterChange={(value) => { setStatusFilter(value); callbacks.onStatusFilterChange(value); }}
    onClearFilters={() => {
      setSearchTerm(''); setCategoryFilter('ALL'); setVendorFilter('ALL'); setStatusFilter('ALL'); callbacks.onClearFilters();
    }}
    onInitiateClick={callbacks.onInitiateClick}
    onNegotiateClick={callbacks.onNegotiateClick}
    onBuyerAcceptClick={callbacks.onBuyerAcceptClick}
    onDetailsClick={callbacks.onDetailsClick}
  />;
}

const callbacks = () => ({
  onTabChange: jest.fn(), onSearchChange: jest.fn(), onCategoryFilterChange: jest.fn(), onVendorFilterChange: jest.fn(),
  onStatusFilterChange: jest.fn(), onClearFilters: jest.fn(), onInitiateClick: jest.fn(), onNegotiateClick: jest.fn(),
  onBuyerAcceptClick: jest.fn(), onDetailsClick: jest.fn(),
});

describe('rate card home workspace', () => {
  it('filters, paginates, and routes actions across finalised and in-progress registers', () => {
    const on = callbacks();
    const cards = [
      ...Array.from({ length: 7 }, (_, index) => card(`RC-A${index + 1}`, {
        category: index % 2 ? 'Electrical' : 'Civil',
        vendor: index % 2 ? 'Vendor 2' : 'Vendor 1',
        vendorCode: index === 0 ? undefined : `V-${index + 1}`,
        nextResponsible: index === 0 ? undefined : 'Buyer',
      })),
      card('RC-P1', { status: 'In Progress', currentStage: 'Round 2 Negotiation', latestBuyerOffer: 'Offer one', latestSubmittedVendorQuote: 'Quote one', nextResponsible: 'Vendor', lastUpdated: '25 Oct 2026' }),
      card('RC-P2', { status: 'In Progress', currentStage: '', detailedStatus: 'Custom Stage', latestBuyerOffer: undefined, latestSubmittedVendorQuote: undefined, latestVendorQuote: 'Fallback quote', lastUpdated: undefined, nextResponsible: undefined, vendorCode: undefined }),
      card('RC-P3', { status: 'Draft', currentStage: '', detailedStatus: '', latestBuyerOffer: undefined, latestSubmittedVendorQuote: undefined, latestVendorQuote: undefined, lastUpdated: '', nextResponsible: '', validFrom: 'Fallback date', vendor: '', vendorCode: undefined, category: '', scope: '' }),
    ];
    const view = render(<HomeWorkspaceHarness cards={cards} callbacks={on} />);

    expect(screen.getByRole('heading', { name: 'Rate Card Management - Home' })).toBeInTheDocument();
    expect(screen.getByText('Finalised Summary')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('Showing 1 to 5 of 7 records');
    expect(screen.getByText('Active Contract')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Initiate Rate Card' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Initiate Rate Card' }));
    expect(on.onInitiateClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next Page' }));
    expect(document.body).toHaveTextContent('Showing 6 to 7 of 7 records');
    expect(screen.getByText('RC-A6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous Page' }));
    fireEvent.click(screen.getByRole('button', { name: /^2$/ }));
    expect(document.body).toHaveTextContent('Showing 6 to 7 of 7 records');
    fireEvent.click(screen.getByRole('button', { name: 'Previous Page' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'RC-A1' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'View Details' })[0]);
    expect(on.onDetailsClick).toHaveBeenCalledWith('RC-A1');

    const search = screen.getByPlaceholderText('Search by Rate Card ID, Title, Vendor or Category...');
    fireEvent.change(search, { target: { value: '  rc-a3  ' } });
    expect(document.body).toHaveTextContent('Showing 1 to 1 of 1 records');
    expect(screen.getByText('RC-A3')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'electrical' } });
    expect(document.body).toHaveTextContent('3 records');
    fireEvent.change(search, { target: { value: 'unique scope rc-a5' } });
    expect(screen.getByText('RC-A5')).toBeInTheDocument();

    const selects = view.container.querySelectorAll('select');
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(selects[0], { target: { value: 'Civil' } });
    fireEvent.change(selects[1], { target: { value: 'Vendor 1' } });
    fireEvent.change(selects[2], { target: { value: 'Active' } });
    expect(on.onCategoryFilterChange).toHaveBeenCalledWith('Civil');
    expect(on.onVendorFilterChange).toHaveBeenCalledWith('Vendor 1');
    expect(on.onStatusFilterChange).toHaveBeenCalledWith('Active');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(on.onClearFilters).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Rate Cards in Progress/ }));
    expect(screen.getByText('RC-P1')).toBeInTheDocument();
    expect(screen.getByText('Custom Stage')).toBeInTheDocument();
    expect(screen.getByText('Fallback quote')).toBeInTheDocument();
    expect(screen.getByText('Fallback date')).toBeInTheDocument();
    expect(screen.getAllByText('Category Manager')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'RC-P1' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Negotiate' })[0]);
    expect(on.onNegotiateClick).toHaveBeenCalledWith('RC-P1');

    fireEvent.change(selects[2], { target: { value: 'Active' } });
    expect(screen.getByText('No rate cards in progress found matching the criteria.')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('Showing 0 records');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: /Rate Cards in Progress/ }));
    fireEvent.click(screen.getByRole('button', { name: 'RC-P1' }));
    fireEvent.click(screen.getByRole('button', { name: /Finalised Summary/ }));
    view.rerender(<HomeWorkspaceHarness cards={cards.slice(0, 3)} callbacks={on} />);
    expect(document.body).toHaveTextContent('Showing 1 to 3 of 3 records');
  });

  it('shows empty states for both tabs and resets pagination when the available records shrink', () => {
    const on = callbacks();
    const cards = Array.from({ length: 7 }, (_, index) => card(`RC-${index + 1}`));
    const view = render(<HomeWorkspaceHarness cards={cards} callbacks={on} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next Page' }));
    view.rerender(<HomeWorkspaceHarness cards={cards.slice(0, 2)} callbacks={on} />);
    expect(document.body).toHaveTextContent('Showing 1 to 2 of 2 records');

    view.rerender(<HomeWorkspaceHarness cards={[]} callbacks={on} />);
    expect(screen.getByText('No finalised rate cards found matching the criteria.')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('Showing 0 records');
    fireEvent.click(screen.getByRole('button', { name: /Rate Cards in Progress/ }));
    expect(screen.getByText('No rate cards in progress found matching the criteria.')).toBeInTheDocument();
    expect(on.onTabChange).toHaveBeenCalledWith('in_progress');
  });
});

/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import VendorPipelineDashboardPage from '../src/app/vendor-pipeline/page';
import {
  DEMO_TENANT_NAME,
  DEMO_DEV_VENDOR,
  DEMO_VENDOR_ROLE,
} from '../src/app/vendor-pipeline/page.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { uiStringPattern } from '@/lib/i18n';

describe('VendorPipelineDashboardPage', () => {
  it('renders title, top header, all 8 stat cards, and initial 9 RFQs in table', () => {
    render(<VendorPipelineDashboardPage />);

    // Title & subtitle
    expect(
      screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.vendorSourcingOrderFulfillmentPipeline))
    ).toBeInTheDocument();
    expect(
      screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.persistedCountsDerivedDirectlyFromProductionDatabaseRecords))
    ).toBeInTheDocument();

    // Header elements
    expect(screen.getByPlaceholderText(UI_STRINGS.appVendorPipelinePage.searchPlaceholder)).toBeInTheDocument();
    expect(screen.getByText(DEMO_TENANT_NAME)).toBeInTheDocument();
    expect(screen.getByText(DEMO_DEV_VENDOR)).toBeInTheDocument();
    expect(screen.getByText(DEMO_VENDOR_ROLE)).toBeInTheDocument();

    // Verify all 8 stat cards are present
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.newRFQs))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.quotationsDueSoon))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.quotesSubmitted))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.negotiationsPending))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.finalOffersSubmitted))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.acceptedPPOAwaited))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.pposAwaitingAcceptance))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.acceptedPposActive))).toBeInTheDocument();

    // Verify initial table rows
    expect(screen.getByText('RFQ-2026-000014')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000013')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000012')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000011')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000010')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000009')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000008')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000007')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000015')).toBeInTheDocument();
  });

  it('filters table rows when clicking NEW RFQS stat card and toggles off on second click', () => {
    render(<VendorPipelineDashboardPage />);

    const newRfqsCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.newRFQs)).closest('div')!;
    fireEvent.click(newRfqsCard);

    // 4 rows match NEW_RFQS: 000014, 000013, 000012, 000015
    expect(screen.getByText('RFQ-2026-000014')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000013')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000012')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000015')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000010')).not.toBeInTheDocument();

    // Clicking same card again clears filter
    fireEvent.click(newRfqsCard);
    expect(screen.getByText('RFQ-2026-000010')).toBeInTheDocument();
  });

  it('filters table rows when clicking QUOTATIONS DUE SOON and QUOTES SUBMITTED cards', () => {
    render(<VendorPipelineDashboardPage />);

    // Click QUOTATIONS DUE SOON (count 4: 000014, 000013, 000012, 000011)
    const dueSoonCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.quotationsDueSoon)).closest('div')!;
    fireEvent.click(dueSoonCard);
    expect(screen.getByText('RFQ-2026-000014')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000011')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000010')).not.toBeInTheDocument();

    // Click QUOTES SUBMITTED (count 5: 000011, 000010, 000009, 000008, 000007)
    const quotesSubmittedCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.quotesSubmitted)).closest('div')!;
    fireEvent.click(quotesSubmittedCard);
    expect(screen.getByText('RFQ-2026-000011')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000010')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000009')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000014')).not.toBeInTheDocument();
  });

  it('shows empty state when clicking 0-count cards and clears filter on button click', () => {
    render(<VendorPipelineDashboardPage />);

    // Click NEGOTIATIONS PENDING (count 0)
    const negCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.negotiationsPending)).closest('div')!;
    fireEvent.click(negCard);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.noRFQsFoundForThisFilter))).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000014')).not.toBeInTheDocument();

    // Click Clear Filter in empty state
    const clearBtn = screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.appVendorPipelinePage.clearFilter) })[0];
    fireEvent.click(clearBtn);

    // All rows restored
    expect(screen.getByText('RFQ-2026-000014')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000010')).toBeInTheDocument();

    // Click FINAL OFFERS SUBMITTED (count 0)
    const finalOffersCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.finalOffersSubmitted)).closest('div')!;
    fireEvent.click(finalOffersCard);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.noRFQsFoundForThisFilter))).toBeInTheDocument();

    // Click ACCEPTED — PPO AWAITED (count 0)
    const acceptedPpoCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.acceptedPPOAwaited)).closest('div')!;
    fireEvent.click(acceptedPpoCard);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.noRFQsFoundForThisFilter))).toBeInTheDocument();
  });

  it('filters table rows for PPOS AWAITING ACCEPTANCE and ACCEPTED PPOS (ACTIVE)', () => {
    render(<VendorPipelineDashboardPage />);

    // Click PPOS AWAITING ACCEPTANCE (count 1: row 8 / 000007)
    const ppoAwaitingCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.pposAwaitingAcceptance)).closest('div')!;
    fireEvent.click(ppoAwaitingCard);
    expect(screen.getByText('RFQ-2026-000007')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000014')).not.toBeInTheDocument();

    // Click ACCEPTED PPOS (ACTIVE) (count 1: row 7 / 000008)
    const ppoActiveCard = screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.acceptedPposActive)).closest('div')!;
    fireEvent.click(ppoActiveCard);
    expect(screen.getByText('RFQ-2026-000008')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000007')).not.toBeInTheDocument();
  });

  it('filters rows with the search bar, supports clearing search, and handles focus/blur', () => {
    render(<VendorPipelineDashboardPage />);

    const searchInput = screen.getByPlaceholderText(UI_STRINGS.appVendorPipelinePage.searchPlaceholder);

    // Focus & blur
    fireEvent.focus(searchInput);
    fireEvent.blur(searchInput);

    // Search for Kundanahalli
    fireEvent.change(searchInput, { target: { value: 'Kundanahalli' } });
    expect(screen.getByText('RFQ-2026-000014')).toBeInTheDocument();
    expect(screen.getByText('RFQ-2026-000015')).toBeInTheDocument();
    expect(screen.queryByText('RFQ-2026-000010')).not.toBeInTheDocument();

    // Clear search with X button
    const clearSearchBtn = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appVendorPipelinePage.clearFilter) });
    fireEvent.click(clearSearchBtn);
    expect(searchInput).toHaveValue('');
    expect(screen.getByText('RFQ-2026-000010')).toBeInTheDocument();

    // Search with non-matching query
    fireEvent.change(searchInput, { target: { value: 'xyz-no-match-query' } });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.noRFQsFoundForThisFilter))).toBeInTheDocument();
  });

  it('toggles sidebar collapse and expansion', () => {
    render(<VendorPipelineDashboardPage />);

    const collapseBtn = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appVendorPipelinePage.collapseSidebar) });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.portalSection))).toBeInTheDocument();

    // Collapse
    fireEvent.click(collapseBtn);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.portalSection))).not.toBeInTheDocument();

    // Expand
    const expandBtn = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appVendorPipelinePage.expandSidebar) });
    fireEvent.click(expandBtn);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appVendorPipelinePage.portalSection))).toBeInTheDocument();
  });
});

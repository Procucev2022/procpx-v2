/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import InitiateRateCardWorkspace from '../src/components/rate-cards/InitiateRateCardWorkspace';

const DRAFT_KEY = 'procpx_rate_card_initiate_draft';
const SAVED_TITLE = 'Saved retail fitout draft';

describe('initiate rate card draft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores the saved draft under React Strict Mode without erasing it on mount', () => {
    const savedForm = {
      vendor: 'Saved Vendor (VND-0001)',
      vendorId: 'vendor-saved',
      effectiveFrom: '2026-10-01',
      validUntil: '2027-09-30',
      category: 'Interior Works',
      subcategory: 'Retail Turnkey Fitouts',
      location: 'All India',
      title: SAVED_TITLE,
      commercialTerms: 'Saved commercial terms',
      scope: 'Saved scope',
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: savedForm, items: [] }));

    render(
      <React.StrictMode>
        <InitiateRateCardWorkspace onBack={jest.fn()} onSubmit={jest.fn()} />
      </React.StrictMode>,
    );

    expect(screen.getByDisplayValue(SAVED_TITLE)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}').form.title).toBe(SAVED_TITLE);
  });
});

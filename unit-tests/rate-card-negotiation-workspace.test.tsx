/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NegotiationWorkspace, { NegotiationItem } from '../src/components/rate-cards/NegotiationWorkspace';

const items: NegotiationItem[] = [
  { id: 'line-1', itemCode: 'RC-01', description: 'Ceiling', specification: 'Moisture resistant board', uom: 'SQFT', qty: 10, buyerTargetRate: 100, latestVendorQuote: 95, currentBuyerOffer: 90 },
  { id: 'line-2', itemCode: 'RC-02', description: 'Flooring', uom: 'SQFT', qty: 2, buyerTargetRate: 50, latestVendorQuote: 60, currentBuyerOffer: 70 },
];

describe('rate card negotiation workspace', () => {
  it('updates a matching line, leaves other lines intact, and routes all workspace actions', () => {
    const onItemsChange = jest.fn();
    const onReset = jest.fn();
    const onSaveDraft = jest.fn();
    const onSendOffer = jest.fn();
    const onBack = jest.fn();
    render(<NegotiationWorkspace
      rateCardId="RC-TEST"
      vendorName="Test Vendor"
      category="Test Category"
      round="Round 3"
      items={items}
      onItemsChange={onItemsChange}
      onReset={onReset}
      onSaveDraft={onSaveDraft}
      onSendOffer={onSendOffer}
      onBack={onBack}
    />);

    expect(screen.getByRole('heading', { name: 'Rate Card Negotiation (Item Level)' })).toBeInTheDocument();
    expect(screen.getByText('RC-TEST')).toBeInTheDocument();
    expect(screen.getByText('Test Vendor')).toBeInTheDocument();
    expect(screen.getByText('Total Commercial Valuation:')).toBeInTheDocument();
    expect(screen.getAllByText('SQFT')).toHaveLength(2);

    fireEvent.change(document.querySelectorAll('input[type="number"]')[0], { target: { value: '80' } });
    expect(onItemsChange).toHaveBeenCalledWith([
      { ...items[0], currentBuyerOffer: 80, proposedAmount: 800 },
      items[1],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Negotiation History & Round Audit' }));
    expect(screen.getByText('Multi-Round Commercial Negotiation Audit Trail')).toBeInTheDocument();
    expect(screen.getByText(/Vendor submitted Round 1 Quote/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Item-Level Offers & Calculations/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Target' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Proposed Offer to Vendor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Rate Cards' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSendOffer).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a positive variance when a counter offer exceeds the vendor quote', () => {
    render(<NegotiationWorkspace
      items={[{ ...items[0], qty: 1, buyerTargetRate: 100, latestVendorQuote: 90, currentBuyerOffer: 120 }]}
      onItemsChange={jest.fn()}
      onReset={jest.fn()}
      onSaveDraft={jest.fn()}
      onSendOffer={jest.fn()}
      onBack={jest.fn()}
    />);

    expect(document.body).toHaveTextContent(/\+\s*\u20B9\s*30/);
    expect(document.body).toHaveTextContent('-20.0% vs Target');
  });

  it('supports empty offer and history tables with zero target value', () => {
    render(<NegotiationWorkspace
      items={[]}
      onItemsChange={jest.fn()}
      onReset={jest.fn()}
      onSaveDraft={jest.fn()}
      onSendOffer={jest.fn()}
      onBack={jest.fn()}
    />);

    expect(document.body).toHaveTextContent('0% vs Target');
    expect(screen.getByText('Total Commercial Valuation:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Negotiation History & Round Audit' }));
    expect(screen.getByText('Governance History Summary:')).toBeInTheDocument();
    expect(screen.queryByText('RC-01')).not.toBeInTheDocument();
  });
});

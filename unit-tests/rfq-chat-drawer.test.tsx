/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RfqChatDrawer from '../src/components/RfqChatDrawer';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const onClose = jest.fn();
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });
const fetchMock = jest.fn();

describe('RFQ clarification drawer', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: jest.fn() });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(response({ messages: [] }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing and does not fetch while closed', () => {
    const { container } = render(<RfqChatDrawer isOpen={false} onClose={onClose} rfqId="rfq-1" rfqNumber="RFQ-001" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads vendor-specific history, displays message authors, and closes on request', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [
      { id: 'm1', senderName: 'Buyer', senderRole: 'BUYER', message: 'Please confirm the make.', isVendorSent: false, createdAt: '2026-10-28T10:15:00Z' },
      { id: 'm2', senderName: 'Vendor Rep', senderRole: 'VENDOR', message: 'We confirm Acme.', isVendorSent: true, createdAt: '2026-10-28T11:20:00Z' },
    ] }));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-1" rfqNumber="RFQ-001" title="Cable package" vendorId="vendor-1" isVendorUser />);
    expect(await screen.findByText('Please confirm the make.')).toBeInTheDocument();
    expect(screen.getByText('We confirm Acme.')).toBeInTheDocument();
    expect(screen.getByText(/RFQ-001/).parentElement).toHaveTextContent('Cable package');
    expect(fetchMock).toHaveBeenCalledWith('/api/procurement/rfqs/rfq-1/messages?vendorId=vendor-1');
    const bubbles = [screen.getByText('Please confirm the make.'), screen.getByText('We confirm Acme.')];
    expect(bubbles[0]).toHaveStyle({ background: '#ffffff' });
    expect(bubbles[1]).toHaveStyle({ background: '#2563eb' });
    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports nested API data and shows the empty conversation state', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: { messages: [] } }));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-2" rfqNumber="RFQ-002" />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.noQueriesOrClarificationsYet))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/procurement/rfqs/rfq-2/messages');
  });

  it('shows API and network errors while loading history', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: 'History is unavailable' }, false));
    const { rerender } = render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-3" rfqNumber="RFQ-003" />);
    expect(await screen.findByText('History is unavailable')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('Network offline'));
    rerender(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-4" rfqNumber="RFQ-004" />);
    expect(await screen.findByText('Network offline')).toBeInTheDocument();
    fetchMock.mockRejectedValueOnce({});
    rerender(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-5" rfqNumber="RFQ-005" />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.networkErrorFetchingMessages))).toBeInTheDocument();
  });

  it('sends a trimmed vendor message, reloads history, and uses the representative fallback', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ messages: [{ id: 'after-send', senderName: 'Vendor Representative', senderRole: 'VENDOR', message: 'Updated message', isVendorSent: true, createdAt: '2026-10-29T09:00:00Z' }] }));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-6" rfqNumber="RFQ-006" vendorId="vendor-6" isVendorUser />);
    const input = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.typeQueryOrClarification));
    fireEvent.change(input, { target: { value: '  Clarify delivery date  ' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.send) }));
    expect(await screen.findByText('Updated message')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/procurement/rfqs/rfq-6/messages', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Clarify delivery date', isVendorSent: true, vendorId: 'vendor-6', senderRole: UI_STRINGS.common.vENDOR, senderName: 'Vendor Representative' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/procurement/rfqs/rfq-6/messages?vendorId=vendor-6');
    expect(input).toHaveValue('');
  });

  it('sends buyer messages and ignores blank submissions', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [] }));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-7" rfqNumber="RFQ-007" />);
    const send = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.send) });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.typeQueryOrClarification)), { target: { value: '   ' } });
    expect(send).toBeDisabled();
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.typeQueryOrClarification)), { target: { value: '  Need a revised schedule  ' } });
    fireEvent.click(send);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/procurement/rfqs/rfq-7/messages', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ message: 'Need a revised schedule', isVendorSent: false, vendorId: null, senderRole: 'BUYER', senderName: 'Procurement Manager' }),
    }));
  });

  it('preserves input and reports failed sends and rejected network calls', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [] })).mockResolvedValueOnce(response({ error: 'Message rejected' }, false));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-8" rfqNumber="RFQ-008" vendorId="vendor-8" />);
    const input = screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.typeQueryOrClarification));
    fireEvent.change(input, { target: { value: 'Keep this text' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.send) }));
    expect(await screen.findByText('Message rejected')).toBeInTheDocument();
    expect(input).toHaveValue('Keep this text');

    fetchMock.mockRejectedValueOnce(new Error('Send network offline'));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.send) }));
    expect(await screen.findByText('Send network offline')).toBeInTheDocument();
    fetchMock.mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRfqChatDrawer.send) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.networkErrorSendingMessage))).toBeInTheDocument();
  });
});

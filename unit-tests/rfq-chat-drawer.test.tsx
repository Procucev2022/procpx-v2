/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fetchMock.mockReset().mockResolvedValue(response({ messages: [] }));
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

  it('prepends older pages without changing the visible conversation order', async () => {
    fetchMock
      .mockResolvedValueOnce(response({
        messages: [{ id: 'm2', senderName: 'Vendor', senderRole: 'VENDOR', message: 'Newest reply', createdAt: '2026-10-28T11:20:00Z' }],
        hasMore: true, nextCursor: '2026-10-28T10:15:00.000Z|m2',
      }))
      .mockResolvedValueOnce(response({
        messages: [{ id: 'm1', senderName: 'Buyer', senderRole: 'BUYER', message: 'Older question', createdAt: '2026-10-28T10:15:00Z' }],
        hasMore: false, nextCursor: null,
      }));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-old" rfqNumber="RFQ-OLD" />);
    expect(await screen.findByText('Newest reply')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('Older question')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/procurement/rfqs/rfq-old/messages?cursor=2026-10-28T10%3A15%3A00.000Z%7Cm2');
    const conversation = screen.getByText('Older question').closest('[style]')?.parentElement;
    expect(conversation).toBeTruthy();
  });

  it('reads nested pagination metadata and recovers from older-page failures', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: {
        messages: [{ id: 'newer', senderName: 'Buyer', senderRole: 'BUYER', message: 'Current message', createdAt: '2026-10-30T11:00:00Z' }],
        hasMore: true, nextCursor: 'older-cursor',
      } }))
      .mockResolvedValueOnce({ ok: false, json: jest.fn().mockRejectedValue(new Error('Invalid response')) })
      .mockResolvedValueOnce(response({ data: { messages: [], hasMore: false, nextCursor: null } }));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-nested" rfqNumber="RFQ-NESTED" vendorId="vendor-nested" />);

    expect(await screen.findByText('Current message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadMessageHistory))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/procurement/rfqs/rfq-nested/messages?cursor=older-cursor&vendorId=vendor-nested');

    fetchMock.mockResolvedValueOnce(response({ data: { messages: [], hasMore: false, nextCursor: null } }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    await waitFor(() => expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses the default message-history error when an API response omits its message', async () => {
    fetchMock.mockResolvedValueOnce(response({}, false));
    render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-error" rfqNumber="RFQ-ERROR" />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.common.userMessages.failedToLoadMessageHistory))).toBeInTheDocument();
  });

  it('does not show a late reply from the previous RFQ after the drawer moves to another RFQ', async () => {
    let finishFirstThread!: (value: unknown) => void;
    fetchMock
      .mockReturnValueOnce(new Promise(resolve => { finishFirstThread = resolve; }))
      .mockResolvedValueOnce(response({ messages: [
        { id: 'second-rfq', senderName: 'Buyer', senderRole: 'BUYER', message: 'Reply on the second RFQ', isVendorSent: false, createdAt: '2026-10-28T11:20:00Z' },
      ] }));
    const { rerender } = render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-first" rfqNumber="RFQ-FIRST" />);
    rerender(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-second" rfqNumber="RFQ-SECOND" />);

    expect(await screen.findByText('Reply on the second RFQ')).toBeInTheDocument();

    await act(async () => {
      finishFirstThread(response({ messages: [
        { id: 'first-rfq', senderName: 'Buyer', senderRole: 'BUYER', message: 'Reply on the first RFQ', isVendorSent: false, createdAt: '2026-10-28T10:00:00Z' },
      ] }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(screen.queryByText('Reply on the first RFQ')).not.toBeInTheDocument();
    expect(screen.getByText('Reply on the second RFQ')).toBeInTheDocument();
  });

  it('discards a failed reply for the previous RFQ that settles after the drawer moves on', async () => {
    let rejectFirstThread!: (error: Error) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirstThread = reject; }))
      .mockResolvedValueOnce(response({ messages: [
        { id: 'current-rfq', senderName: 'Buyer', senderRole: 'BUYER', message: 'Current RFQ reply', isVendorSent: false, createdAt: '2026-10-28T12:00:00Z' },
      ] }));
    const { rerender } = render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-c" rfqNumber="RFQ-C" />);
    rerender(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-d" rfqNumber="RFQ-D" />);

    expect(await screen.findByText('Current RFQ reply')).toBeInTheDocument();

    await act(async () => { rejectFirstThread(new Error('Previous RFQ failed')); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(screen.queryByText('Previous RFQ failed')).not.toBeInTheDocument();
    expect(screen.getByText('Current RFQ reply')).toBeInTheDocument();
  });

  it('does not append an older page that was requested for the previous RFQ', async () => {
    let finishOlderPage!: (value: unknown) => void;
    fetchMock
      .mockResolvedValueOnce(response({ messages: [
        { id: 'newest-a', senderName: 'Buyer', senderRole: 'BUYER', message: 'Newest on RFQ A', isVendorSent: false, createdAt: '2026-10-28T11:00:00Z' },
      ], hasMore: true, nextCursor: 'cursor-a' }))
      .mockReturnValueOnce(new Promise(resolve => { finishOlderPage = resolve; }))
      .mockResolvedValueOnce(response({ messages: [
        { id: 'newest-b', senderName: 'Buyer', senderRole: 'BUYER', message: 'Newest on RFQ B', isVendorSent: false, createdAt: '2026-10-28T13:00:00Z' },
      ], hasMore: false, nextCursor: null }));
    const { rerender } = render(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-a" rfqNumber="RFQ-A" />);

    expect(await screen.findByText('Newest on RFQ A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    rerender(<RfqChatDrawer isOpen onClose={onClose} rfqId="rfq-b" rfqNumber="RFQ-B" />);
    expect(await screen.findByText('Newest on RFQ B')).toBeInTheDocument();

    await act(async () => {
      finishOlderPage(response({ messages: [
        { id: 'older-a', senderName: 'Buyer', senderRole: 'BUYER', message: 'Older on RFQ A', isVendorSent: false, createdAt: '2026-10-28T10:00:00Z' },
      ], hasMore: false, nextCursor: null }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(screen.queryByText('Older on RFQ A')).not.toBeInTheDocument();
    expect(screen.getByText('Newest on RFQ B')).toBeInTheDocument();
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

/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApprovalChatDrawer from '../src/components/ApprovalChatDrawer';

const fetchMock = jest.fn();
const onClose = jest.fn();
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });

describe('approval communication drawer', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: jest.fn() });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(response({ messages: [] }));
  });

  it('renders nothing and does not fetch while closed', () => {
    const { container } = render(<ApprovalChatDrawer isOpen={false} onClose={onClose} entityType="PR" entityId="pr-1" entityCode="PR-001" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads PR history, displays decision and enquiry styles, and shows optional metadata', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [
      { id: 'enquiry', senderName: 'Buyer', senderRole: 'APPROVER', type: 'ENQUIRY', content: 'Please clarify the delivery date.', timestamp: '2026-10-29T09:00:00Z' },
      { id: 'approved', senderName: 'Finance', senderRole: 'APPROVER', type: 'APPROVED', content: 'Budget approved.', timestamp: '2026-10-29T09:01:00Z' },
      { senderName: 'Requester', senderRole: 'REQUESTER', type: 'REJECTED', content: 'Decision recorded.', timestamp: '2026-10-29T09:02:00Z' },
      { id: 'note', senderName: 'Buyer', senderRole: 'BUYER', type: 'MESSAGE', content: 'Internal note.', timestamp: '2026-10-29T09:03:00Z' },
    ] }));
    render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-1" entityCode="PR-001" title="Lighting package" costCentre="CC-01" category="Electrical" amount={123456.78} />);

    expect(await screen.findByText('Please clarify the delivery date.')).toBeInTheDocument();
    expect(screen.getByText('PR Enquiry & Messages')).toBeInTheDocument();
    expect(screen.getByText('Lighting package')).toBeInTheDocument();
    expect(screen.getByText('CC-01')).toBeInTheDocument();
    expect(screen.getByText('Electrical')).toBeInTheDocument();
    expect(screen.getByText(/1,23,456\.78/)).toBeInTheDocument();
    expect(screen.getByText('Clarification Enquiry')).toBeInTheDocument();
    expect(screen.getByText('Budget approved.').parentElement).toHaveStyle({ background: '#f0fdf4' });
    expect(screen.getByText('Decision recorded.').parentElement).toHaveStyle({ background: '#f0fdf4' });
    expect(screen.getByText('Internal note.').parentElement).toHaveStyle({ background: '#ffffff' });
    expect(fetchMock).toHaveBeenCalledWith('/api/approvals/messages?prId=pr-1');
  });

  it('shows the loading and empty states for a budget contribution', async () => {
    let finishRequest!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { finishRequest = resolve; }));
    render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="BUDGET" entityId="contribution-1" entityCode="BUD-001" />);
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();
    expect(screen.getByText('Budget Enquiry & Messages')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/approvals/messages?contributionId=contribution-1');
    finishRequest(response({ messages: null }));
    expect(await screen.findByText('No messages or enquiries yet')).toBeInTheDocument();
    expect(screen.queryByText(/Cost Centre:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Category:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Value:/)).not.toBeInTheDocument();
  });

  it('reports API and network errors while loading, including default messages', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: 'History unavailable' }, false));
    const view = render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-2" entityCode="PR-002" />);
    expect(await screen.findByText('History unavailable')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response({}, false));
    view.rerender(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-3" entityCode="PR-003" />);
    expect(await screen.findByText('Failed to load message history.')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('Network offline'));
    view.rerender(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-4" entityCode="PR-004" />);
    expect(await screen.findByText('Network offline')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce({});
    view.rerender(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-5" entityCode="PR-005" />);
    expect(await screen.findByText('Network error fetching messages.')).toBeInTheDocument();
  });

  it('switches message modes and sends a trimmed PR enquiry, then refreshes and calls back', async () => {
    const onMessageSent = jest.fn();
    fetchMock
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ messages: [{ id: 'new', senderName: 'Requester', senderRole: 'REQUESTER', type: 'ENQUIRY', content: 'Updated question', timestamp: '2026-10-29T10:00:00Z' }] }));
    render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-6" entityCode="PR-006" onMessageSent={onMessageSent} />);

    const input = screen.getByPlaceholderText('Type a message or note retained against this approval...');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Send Message' })).toBeDisabled();
    fireEvent.submit(input.closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Request Clarification (Enquiry)' }));
    expect(screen.getByPlaceholderText('Ask for clarification regarding line items, rates, specs, or documents...')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Please confirm lead time  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Enquiry' }));
    expect(await screen.findByText('Updated question')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/approvals/messages', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Please confirm lead time', type: 'ENQUIRY', prId: 'pr-6' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/approvals/messages?prId=pr-6');
    expect(input).toHaveValue('');
    expect(onMessageSent).toHaveBeenCalledTimes(1);
  });

  it('sends a budget note and shows submitting state while the request is pending', async () => {
    let finishSend!: (value: unknown) => void;
    const onMessageSent = jest.fn();
    fetchMock.mockResolvedValueOnce(response({ messages: [] }));
    render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="BUDGET" entityId="contribution-2" entityCode="BUD-002" initialEnquiryMode onMessageSent={onMessageSent} />);
    fireEvent.click(screen.getByRole('button', { name: 'Message / Note' }));
    const input = screen.getByPlaceholderText('Type a message or note retained against this approval...');
    fireEvent.change(input, { target: { value: 'Budget note' } });
    fetchMock.mockReturnValueOnce(new Promise(resolve => { finishSend = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(await screen.findByText('Sending...')).toBeInTheDocument();
    expect(input).toBeDisabled();
    finishSend(response({}));
    await waitFor(() => expect(onMessageSent).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/approvals/messages', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ message: 'Budget note', type: 'MESSAGE', contributionId: 'contribution-2' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/approvals/messages?contributionId=contribution-2');
  });

  it('handles failed send responses and network rejections without clearing input', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [] })).mockResolvedValueOnce(response({ error: 'Cannot send' }, false));
    render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-7" entityCode="PR-007" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Keep this note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(await screen.findByText('Cannot send')).toBeInTheDocument();
    expect(input).toHaveValue('Keep this note');

    fetchMock.mockResolvedValueOnce(response({}, false));
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(await screen.findByText('Failed to send message.')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('Send offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(await screen.findByText('Send offline')).toBeInTheDocument();
    fetchMock.mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(await screen.findByText('Failed to send message.')).toBeInTheDocument();
  });

  it('closes from the close control and backdrop, while clicks inside remain contained', async () => {
    const { container } = render(<ApprovalChatDrawer isOpen onClose={onClose} entityType="PR" entityId="pr-8" entityCode="PR-008" />);
    await screen.findByText('No messages or enquiries yet');
    const overlay = container.firstChild as HTMLElement;
    const panel = overlay.firstChild as HTMLElement;
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

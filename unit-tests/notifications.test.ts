import { createWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';
import { dispatchNotificationOutbox, enqueueNotificationOutbox } from '../src/lib/notification-outbox';

jest.mock('../src/lib/notification-outbox', () => ({
  dispatchNotificationOutbox: jest.fn(), enqueueNotificationOutbox: jest.fn(),
}));
jest.mock('../src/lib/d1-batch', () => ({ getD1BatchDatabase: jest.fn(() => ({ batch: jest.fn(), prepare: jest.fn() })) }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn() }));

const enqueue = enqueueNotificationOutbox as jest.Mock;
const dispatch = dispatchNotificationOutbox as jest.Mock;
const lastPayload = () => enqueue.mock.calls.at(-1)?.[0] as Record<string, unknown>;

const eventCases = [
  ['PR_RELEASED', 'PROCUREMENT_USER', 'PR RFQ-1 Ready for Sourcing', 'PR'],
  ['RFQ_RELEASED', 'PROCUREMENT_USER', 'RFQ RFQ-1 Released to Vendors', 'RFQ'],
  ['QUOTE_SUBMITTED', 'PROCUREMENT_USER', 'New Quotation for RFQ-1', 'QUOTE'],
  ['COUNTER_OFFER_SENT', 'PROCUREMENT_USER', 'Counter-Offer Dispatched: RFQ-1', 'NEGOTIATION'],
  ['REVISED_QUOTE_RECEIVED', 'PROCUREMENT_USER', 'Revised Quote Received: RFQ-1', 'QUOTE'],
  ['FINAL_RATES_LOCKED', 'PROCUREMENT_USER', 'Commercial Rates Locked: RFQ-1', 'RFQ'],
  ['AWARD_RECOMMENDED', 'FINANCE_USER', 'Award Sign-off Required: RFQ-1', 'AWARD'],
  ['AWARD_APPROVED', 'PROCUREMENT_USER', 'Award Approved for RFQ-1', 'AWARD'],
  ['AWARD_REJECTED', 'PROCUREMENT_USER', 'Award Returned: RFQ-1', 'AWARD'],
  ['PPO_CREATED', 'FINANCE_USER', 'PPO RFQ-1 Generated', 'PPO'],
  ['ENQUIRY_SENT', null, 'Clarification Enquiry on RFQ-1', 'RFQ'],
  ['FINAL_OFFER_SUBMITTED', 'PROCUREMENT_USER', 'Binding Final Offer on RFQ-1', 'NEGOTIATION'],
  ['COMMERCIAL_AWARD_APPROVED', 'PROCUREMENT_USER', 'Offer Accepted for RFQ-1', 'NEGOTIATION'],
  ['NEGOTIATION_CLOSED', 'PROCUREMENT_USER', 'Negotiation Concluded for RFQ-1', 'NEGOTIATION'],
  ['PPO_ACCEPTED_BY_VENDOR', 'PROCUREMENT_USER', 'PPO RFQ-1 Accepted by Vendor', 'PPO'],
  ['PPO_ISSUE_RAISED', 'PROCUREMENT_USER', 'Issue Raised on PPO RFQ-1', 'PPO'],
] as const;

describe('createWorkflowNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enqueue.mockResolvedValue('notification-1');
    dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
  });

  it('queues optional fields with defaults, attempts immediate delivery, and returns a notification record', async () => {
    await expect(createWorkflowNotification({ tenantId: 'tenant-1', title: 'Title', message: 'Message' }))
      .resolves.toMatchObject({ id: 'notification-1', tenantId: 'tenant-1', title: 'Title', message: 'Message', type: 'INFO', isRead: false });
    expect(enqueue).toHaveBeenCalledWith({
      tenantId: 'tenant-1', userId: null, targetRole: null, title: 'Title', message: 'Message', type: 'INFO',
      entityType: undefined, entityId: undefined, recordNumber: undefined, link: undefined,
    }, expect.any(Date));
    expect(dispatch).toHaveBeenCalledWith(expect.anything(), { onlyId: 'notification-1', now: expect.any(Date), batchSize: 1 });
  });

  it('preserves provided fields, defers failed delivery, and contains enqueue errors', async () => {
    await createWorkflowNotification({
      tenantId: 'tenant-1', userId: 'user-1', targetRole: 'FINANCE_USER', title: 'Ready', message: 'Approve',
      type: 'ACTION_REQUIRED', entityType: 'PPO', entityId: 'ppo-1', recordNumber: 'PPO-1', link: '/ppos/1',
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', targetRole: 'FINANCE_USER', type: 'ACTION_REQUIRED', entityType: 'PPO',
      entityId: 'ppo-1', recordNumber: 'PPO-1', link: '/ppos/1',
    }), expect.any(Date));

    dispatch.mockRejectedValueOnce(new Error('transient delivery failure'));
    await expect(createWorkflowNotification({ tenantId: 'tenant-1', title: 'Deferred', message: 'Retry' }))
      .resolves.toMatchObject({ id: 'notification-1', title: 'Deferred' });
    expect(enqueue).toHaveBeenCalledTimes(2);

    const error = new Error('outbox write failed');
    const logError = jest.requireMock('../src/lib/observability/server-logger').writeStructuredLog as jest.Mock;
    enqueue.mockRejectedValueOnce(error);
    await expect(createWorkflowNotification({ tenantId: 'tenant-1', title: 'Title', message: 'Message' })).resolves.toBeNull();
    expect(logError).toHaveBeenCalledWith('error', 'workflow_notification.enqueue_failed', expect.objectContaining({ tenantId: 'tenant-1' }), 'application');
  });
});

describe('notifyNextResponsibleParty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enqueue.mockImplementation(async (payload: Record<string, unknown>) => {
      dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
      return `notice-${String(payload.entityId || 'none')}`;
    });
    dispatch.mockResolvedValue({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
  });

  it.each(eventCases)('maps %s to its workflow notification', async (event, targetRole, title, entityType) => {
    const result = await notifyNextResponsibleParty({
      tenantId: 'tenant-1', event, recordNumber: 'RFQ-1', entityId: 'rfq-1',
    });

    expect(result).toMatchObject({ tenantId: 'tenant-1', targetRole, title, entityType, entityId: 'rfq-1' });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('returns the mapped payload for an atomic business batch without enqueueing early', async () => {
    const payload = await notifyNextResponsibleParty({
      tenantId: 'tenant-1', event: 'PR_RELEASED', recordNumber: 'PR-001', entityId: 'pr-1',
    }, { prepareOnly: true });

    expect(payload).toMatchObject({ tenantId: 'tenant-1', targetRole: 'PROCUREMENT_USER', entityType: 'PR', entityId: 'pr-1' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('formats optional quote, counter-offer, and award details with safe fallbacks', async () => {
    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'QUOTE_SUBMITTED', recordNumber: 'R1', entityId: 'e1',
      details: { vendorName: 'Vendor A', amount: 1200 },
    });
    expect(lastPayload()).toEqual(expect.objectContaining({ message: expect.stringContaining('Vendor A submitted quotation') }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'COUNTER_OFFER_SENT', recordNumber: 'R1', entityId: 'e1',
      details: { vendorName: '', amount: 0, roundNumber: 0 },
    });
    expect(lastPayload()).toEqual(expect.objectContaining({ message: expect.stringContaining('Round 1 counter-offer') }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'AWARD_RECOMMENDED', recordNumber: 'R1', entityId: 'e1',
      details: { vendorName: 'Vendor B', amount: 5000 },
    });
    expect(lastPayload()).toEqual(expect.objectContaining({ targetRole: 'FINANCE_USER', message: expect.stringContaining('Vendor B') }));
  });

  it('uses supplied enquiry link and actor fallbacks for PPO events', async () => {
    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'ENQUIRY_SENT', recordNumber: 'R1', entityId: 'e1',
      details: { link: '/custom-link' },
    });
    expect(lastPayload()).toEqual(expect.objectContaining({ link: '/custom-link', message: 'User sent a message/enquiry on R1.' }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'PPO_ACCEPTED_BY_VENDOR', recordNumber: 'P1', entityId: 'p1',
      actorName: 'Signatory', details: { vendorName: 'Supplier' },
    });
    expect(lastPayload()).toEqual(expect.objectContaining({ message: expect.stringContaining('Supplier (Signatory)') }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'PPO_ISSUE_RAISED', recordNumber: 'P1', entityId: 'p1',
      details: { vendorName: 'Supplier', issueRemarks: 'Please clarify delivery address' },
    });
    expect(lastPayload()).toEqual(expect.objectContaining({ message: expect.stringContaining('Please clarify delivery address') }));
  });

  it.each([
    ['REVISED_QUOTE_RECEIVED', { vendorName: 'Supplier' }, 'Supplier submitted revised quotation'],
    ['FINAL_RATES_LOCKED', { amount: 5 }, '5'],
    ['AWARD_APPROVED', { vendorName: 'Supplier' }, 'Supplier'],
    ['PPO_CREATED', { amount: 5, vendorName: 'Supplier' }, 'Supplier'],
    ['FINAL_OFFER_SUBMITTED', { amount: 5, vendorName: 'Supplier' }, 'Supplier submitted a binding final offer'],
    ['COMMERCIAL_AWARD_APPROVED', { amount: 5, vendorName: 'Supplier' }, 'Supplier'],
    ['NEGOTIATION_CLOSED', { vendorName: 'Supplier' }, 'Supplier was closed'],
  ] as const)('uses populated event details for %s', async (event, details, messagePart) => {
    await notifyNextResponsibleParty({ tenantId: 't1', event, recordNumber: 'R1', entityId: 'e1', details });
    expect(lastPayload().message).toContain(messagePart);
  });

  it('returns undefined for an unrecognized event', async () => {
    await expect(notifyNextResponsibleParty({
      tenantId: 't1', event: 'UNKNOWN' as never, recordNumber: 'R1', entityId: 'e1',
    })).resolves.toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

import { prisma } from '../src/lib/prisma';
import { createWorkflowNotification, notifyNextResponsibleParty } from '../src/lib/notifications';

jest.mock('../src/lib/prisma', () => ({ prisma: { notification: { create: jest.fn() } } }));

const createNotification = (prisma.notification as unknown as { create: jest.Mock }).create;

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
  beforeEach(() => jest.clearAllMocks());

  it('stores optional fields with defaults and returns the created record', async () => {
    const notification = { id: 'notification-1' };
    createNotification.mockResolvedValue(notification);

    await expect(createWorkflowNotification({ tenantId: 'tenant-1', title: 'Title', message: 'Message' }))
      .resolves.toBe(notification);
    expect(createNotification).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', userId: null, targetRole: null, title: 'Title', message: 'Message', type: 'INFO',
      entityType: null, entityId: null, recordNumber: null, link: null,
    } });
  });

  it('preserves provided fields and contains persistence errors', async () => {
    createNotification.mockResolvedValueOnce({ id: 'notification-2' });
    await createWorkflowNotification({
      tenantId: 'tenant-1', userId: 'user-1', targetRole: 'FINANCE_USER', title: 'Ready', message: 'Approve',
      type: 'ACTION_REQUIRED', entityType: 'PPO', entityId: 'ppo-1', recordNumber: 'PPO-1', link: '/ppos/1',
    });
    expect(createNotification).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'user-1', targetRole: 'FINANCE_USER', type: 'ACTION_REQUIRED', entityType: 'PPO',
      entityId: 'ppo-1', recordNumber: 'PPO-1', link: '/ppos/1',
    }) });

    const error = new Error('write failed');
    const logError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    createNotification.mockRejectedValueOnce(error);
    await expect(createWorkflowNotification({ tenantId: 'tenant-1', title: 'Title', message: 'Message' })).resolves.toBeNull();
    expect(logError).toHaveBeenCalledWith('Failed to create workflow notification:', error);
    logError.mockRestore();
  });
});

describe('notifyNextResponsibleParty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createNotification.mockImplementation(async ({ data }) => ({ id: 'notice', ...data }));
  });

  it.each(eventCases)('maps %s to its workflow notification', async (event, targetRole, title, entityType) => {
    const result = await notifyNextResponsibleParty({
      tenantId: 'tenant-1', event, recordNumber: 'RFQ-1', entityId: 'rfq-1',
    });

    expect(result).toMatchObject({ tenantId: 'tenant-1', targetRole, title, entityType, entityId: 'rfq-1' });
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('formats optional quote, counter-offer, and award details with safe fallbacks', async () => {
    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'QUOTE_SUBMITTED', recordNumber: 'R1', entityId: 'e1',
      details: { vendorName: 'Vendor A', amount: 1200 },
    });
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ message: expect.stringContaining('Vendor A submitted quotation') }),
    }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'COUNTER_OFFER_SENT', recordNumber: 'R1', entityId: 'e1',
      details: { vendorName: '', amount: 0, roundNumber: 0 },
    });
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ message: expect.stringContaining('Round 1 counter-offer') }),
    }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'AWARD_RECOMMENDED', recordNumber: 'R1', entityId: 'e1',
      details: { vendorName: 'Vendor B', amount: 5000 },
    });
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ targetRole: 'FINANCE_USER', message: expect.stringContaining('Vendor B') }),
    }));
  });

  it('uses supplied enquiry link and actor fallbacks for PPO events', async () => {
    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'ENQUIRY_SENT', recordNumber: 'R1', entityId: 'e1',
      details: { link: '/custom-link' },
    });
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ link: '/custom-link', message: 'User sent a message/enquiry on R1.' }),
    }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'PPO_ACCEPTED_BY_VENDOR', recordNumber: 'P1', entityId: 'p1',
      actorName: 'Signatory', details: { vendorName: 'Supplier' },
    });
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ message: expect.stringContaining('Supplier (Signatory)') }),
    }));

    await notifyNextResponsibleParty({
      tenantId: 't1', event: 'PPO_ISSUE_RAISED', recordNumber: 'P1', entityId: 'p1',
      details: { vendorName: 'Supplier', issueRemarks: 'Please clarify delivery address' },
    });
    expect(createNotification).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ message: expect.stringContaining('Please clarify delivery address') }),
    }));
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
    const [{ data }] = createNotification.mock.calls.at(-1) as [{ data: { message: string } }];
    expect(data.message).toContain(messagePart);
  });

  it('returns undefined for an unrecognized event', async () => {
    await expect(notifyNextResponsibleParty({
      tenantId: 't1', event: 'UNKNOWN' as never, recordNumber: 'R1', entityId: 'e1',
    })).resolves.toBeUndefined();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

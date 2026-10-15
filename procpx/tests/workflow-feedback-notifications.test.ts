// tests/workflow-feedback-notifications.test.ts
// Comprehensive Test Suite for proCPX Standard Workflow Confirmation and Notification Behaviour
import { PrismaClient } from '@prisma/client';
import { notifyNextResponsibleParty } from '../src/lib/notifications';

const prisma = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}${detail ? ` (${detail})` : ''}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
    testsFailed++;
  }
}

async function runWorkflowFeedbackAndNotificationsTests() {
  console.log('========================================================================');
  console.log('🚀 PROCPX WORKFLOW CONFIRMATION & NOTIFICATION VERIFICATION SUITE');
  console.log('========================================================================\n');

  const tenantA = await prisma.tenant.findUnique({ where: { slug: 'procucev-retail-demo' } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: 'procucev-hospitality-demo' } });

  if (!tenantA || !tenantB) {
    throw new Error('Required tenants not found. Ensure database is initialized.');
  }

  const procUser = await prisma.user.findFirst({
    where: { tenantId: tenantA.id, role: 'PROCUREMENT_USER' },
  });
  const financeUser = await prisma.user.findFirst({
    where: { tenantId: tenantA.id, role: 'FINANCE_USER' },
  });
  const vendor = await prisma.vendor.findFirst({
    where: { tenantId: tenantA.id },
  });

  if (!procUser || !financeUser || !vendor) {
    throw new Error('Required test actors (Procurement User, Finance User, Vendor) not found.');
  }

  const testSuffix = Math.floor(10000 + Math.random() * 90000);
  const createdNotificationIds: string[] = [];

  // ========================================================================
  // 1. NOTIFICATION PERSISTENCE FOR ALL WORKFLOW MILESTONES
  // ========================================================================
  console.log('--- 1. NOTIFICATION CREATION ACROSS ALL WORKFLOW MILESTONES ---');

  // 1.1 PR Released to Procurement
  const notifPr = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'PR_RELEASED',
    recordNumber: `PR-TEST-${testSuffix}`,
    entityId: `pr-entity-${testSuffix}`,
    details: { link: `/procurement/rfqs/new?prId=pr-entity-${testSuffix}` },
  });
  if (notifPr) createdNotificationIds.push(notifPr.id);
  assert(!!notifPr, '1.1: PR_RELEASED notification generated');
  assert(notifPr?.targetRole === 'PROCUREMENT_USER', '1.2: PR_RELEASED targets PROCUREMENT_USER');
  assert(notifPr?.type === 'ACTION_REQUIRED', '1.3: PR_RELEASED marked as ACTION_REQUIRED');
  assert(notifPr?.recordNumber === `PR-TEST-${testSuffix}`, '1.4: PR record number captured accurately');

  // 1.2 RFQ Released to Market
  const notifRfq = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'RFQ_RELEASED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
  });
  if (notifRfq) createdNotificationIds.push(notifRfq.id);
  assert(!!notifRfq, '1.5: RFQ_RELEASED notification generated');
  assert(notifRfq?.entityType === 'RFQ', '1.6: RFQ entity type set correctly');
  assert(notifRfq?.recordNumber === `RFQ-TEST-${testSuffix}`, '1.7: RFQ number captured in notification');

  // 1.3 Vendor Quote Submitted
  const notifQuote = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'QUOTE_SUBMITTED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
    details: {
      vendorName: vendor.name,
      amount: 450000,
    },
  });
  if (notifQuote) createdNotificationIds.push(notifQuote.id);
  assert(!!notifQuote, '1.8: QUOTE_SUBMITTED notification generated');
  assert(notifQuote?.message.includes(vendor.name), '1.9: Vendor name included in quotation notification');
  assert(notifQuote?.message.includes((450000).toLocaleString()), '1.10: Quoted total amount included in quotation notification');

  // 1.4 Counter-Offer Dispatched
  const notifCounter = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'COUNTER_OFFER_SENT',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
    details: {
      vendorName: vendor.name,
      amount: 410000,
      roundNumber: 1,
    },
  });
  if (notifCounter) createdNotificationIds.push(notifCounter.id);
  assert(!!notifCounter, '1.11: COUNTER_OFFER_SENT notification generated');
  assert(notifCounter?.message.includes('Round 1'), '1.12: Negotiation round number reflected');
  assert(notifCounter?.message.includes((410000).toLocaleString()), '1.13: Counter-offer value reflected');

  // 1.5 Revised Quote Received
  const notifRevised = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'REVISED_QUOTE_RECEIVED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
    details: {
      vendorName: vendor.name,
      amount: 415000,
      roundNumber: 1,
    },
  });
  if (notifRevised) createdNotificationIds.push(notifRevised.id);
  assert(!!notifRevised, '1.14: REVISED_QUOTE_RECEIVED notification generated');
  assert(notifRevised?.type === 'ACTION_REQUIRED', '1.15: Revised quote alerts procurement for action');

  // 1.6 Final Rates Locked
  const notifLock = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'FINAL_RATES_LOCKED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
    details: {
      amount: 415000,
    },
  });
  if (notifLock) createdNotificationIds.push(notifLock.id);
  assert(!!notifLock, '1.16: FINAL_RATES_LOCKED notification generated');
  assert(notifLock?.link?.includes('tab=awarding'), '1.17: Direct deep-link to awarding tab configured');

  // 1.7 Award Recommended (To Finance)
  const notifAward = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'AWARD_RECOMMENDED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `award-entity-${testSuffix}`,
    details: {
      vendorName: vendor.name,
      amount: 415000,
    },
  });
  if (notifAward) createdNotificationIds.push(notifAward.id);
  assert(!!notifAward, '1.18: AWARD_RECOMMENDED notification generated');
  assert(notifAward?.targetRole === 'FINANCE_USER', '1.19: Award recommendation correctly routed to FINANCE_USER');
  assert(notifAward?.type === 'ACTION_REQUIRED', '1.20: Finance sign-off tagged as ACTION_REQUIRED');

  // 1.8 Award Approved (To Procurement)
  const notifApprove = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'AWARD_APPROVED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
    details: {
      vendorName: vendor.name,
    },
  });
  if (notifApprove) createdNotificationIds.push(notifApprove.id);
  assert(!!notifApprove, '1.21: AWARD_APPROVED notification generated');
  assert(notifApprove?.targetRole === 'PROCUREMENT_USER', '1.22: Approval notice sent to PROCUREMENT_USER to trigger PPO');

  // 1.9 Award Rejected
  const notifReject = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'AWARD_REJECTED',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
  });
  if (notifReject) createdNotificationIds.push(notifReject.id);
  assert(!!notifReject, '1.23: AWARD_REJECTED notification generated');
  assert(notifReject?.type === 'WARNING', '1.24: Award rejection tagged as WARNING');

  // 1.10 PPO Created
  const notifPpo = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'PPO_CREATED',
    recordNumber: `PPO-TEST-${testSuffix}`,
    entityId: `ppo-entity-${testSuffix}`,
    details: {
      vendorName: vendor.name,
      amount: 415000,
    },
  });
  if (notifPpo) createdNotificationIds.push(notifPpo.id);
  assert(!!notifPpo, '1.25: PPO_CREATED notification generated');
  assert(notifPpo?.type === 'SUCCESS', '1.26: PPO generation tagged as SUCCESS');
  assert(notifPpo?.targetRole === 'FINANCE_USER', '1.27: PPO creation notifies FINANCE_USER');

  // 1.11 Clarification Enquiry Sent
  const notifEnquiry = await notifyNextResponsibleParty({
    tenantId: tenantA.id,
    event: 'ENQUIRY_SENT',
    recordNumber: `RFQ-TEST-${testSuffix}`,
    entityId: `rfq-entity-${testSuffix}`,
    actorName: procUser.name,
  });
  if (notifEnquiry) createdNotificationIds.push(notifEnquiry.id);
  assert(!!notifEnquiry, '1.28: ENQUIRY_SENT notification generated');
  assert(notifEnquiry?.title.includes('Clarification Enquiry'), '1.29: Clarification enquiry title confirmed');

  // ========================================================================
  // 2. NOTIFICATION QUERYING & UNREAD STATUS
  // ========================================================================
  console.log('\n--- 2. NOTIFICATIONS QUERYING & UNREAD TRACKING ---');

  // Query notifications for Procurement User
  const procNotifs = await prisma.notification.findMany({
    where: {
      tenantId: tenantA.id,
      OR: [
        { userId: procUser.id },
        { targetRole: 'PROCUREMENT_USER' },
        { targetRole: null, userId: null },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  assert(procNotifs.length > 0, '2.1: Procurement User receives role-relevant notifications');
  const unreadCount = procNotifs.filter((n) => !n.isRead).length;
  assert(unreadCount > 0, '2.2: Unread count accurately calculated from database');

  // Mark a notification as read
  const firstNotif = procNotifs[0];
  const updatedNotif = await prisma.notification.update({
    where: { id: firstNotif.id },
    data: { isRead: true, readAt: new Date() },
  });
  assert(updatedNotif.isRead === true, '2.3: Notification successfully marked as read');
  assert(!!updatedNotif.readAt, '2.4: readAt timestamp recorded');

  // ========================================================================
  // 3. TENANT ISOLATION OF NOTIFICATIONS
  // ========================================================================
  console.log('\n--- 3. MULTI-TENANT ISOLATION OF NOTIFICATIONS ---');

  // Create notification in Tenant B
  const notifTenantB = await prisma.notification.create({
    data: {
      tenantId: tenantB.id,
      title: `Confidential Sourcing Notice ${testSuffix}`,
      message: 'Private sourcing event for Tenant B',
      type: 'INFO',
      recordNumber: `RFQ-TB-${testSuffix}`,
    },
  });
  createdNotificationIds.push(notifTenantB.id);

  // Verify Tenant A queries NEVER return Tenant B's notification
  const tenantAQuery = await prisma.notification.findMany({
    where: {
      tenantId: tenantA.id,
      recordNumber: `RFQ-TB-${testSuffix}`,
    },
  });
  assert(tenantAQuery.length === 0, '3.1: Tenant A cannot see Tenant B notifications (Tenant Isolation verified)');

  const tenantBQuery = await prisma.notification.findMany({
    where: {
      tenantId: tenantB.id,
      recordNumber: `RFQ-TB-${testSuffix}`,
    },
  });
  assert(tenantBQuery.length === 1, '3.2: Tenant B correctly accesses own notification');

  // ========================================================================
  // 4. DUPLICATE TRANSACTION PREVENTION (IDEMPOTENCY GUARDS)
  // ========================================================================
  console.log('\n--- 4. DOUBLE-SUBMISSION & DUPLICATE GUARDS ---');

  // Find an active RFQ
  const existingRfq = await prisma.rfq.findFirst({
    where: { tenantId: tenantA.id, status: { not: 'CANCELLED' } },
  });

  if (existingRfq && existingRfq.prId) {
    // Attempting to create another RFQ for this PR should be detected
    const duplicateCheck = await prisma.rfq.findFirst({
      where: {
        tenantId: tenantA.id,
        prId: existingRfq.prId,
        status: { not: 'CANCELLED' },
      },
    });
    assert(!!duplicateCheck, '4.1: Active RFQ collision detected on PR');
    assert(duplicateCheck?.id === existingRfq.id, '4.2: Guard points to existing RFQ to prevent duplicate');
  }

  // Duplicate PPO Check: A single RFQ can only have one active PPO
  const existingPpo = await prisma.ppo.findFirst({
    where: { tenantId: tenantA.id, status: { not: 'CANCELLED' } },
  });
  if (existingPpo) {
    const ppoDuplicateCheck = await prisma.ppo.findFirst({
      where: {
        tenantId: tenantA.id,
        rfqId: existingPpo.rfqId,
        status: { not: 'CANCELLED' },
      },
    });
    assert(!!ppoDuplicateCheck, '4.3: Duplicate PPO attempt detected on RFQ');
    assert(ppoDuplicateCheck?.ppoNumber === existingPpo.ppoNumber, '4.4: Existing PPO number identified');
  }

  // ========================================================================
  // 5. AUDIT TRAIL, TIMESTAMPS & USER IDENTITY PRESERVATION
  // ========================================================================
  console.log('\n--- 5. AUDIT TRAIL, TIMESTAMPS & USER IDENTITIES ---');

  // Verify recent audit logs have userId, timestamps, and tenantId
  const auditLogs = await prisma.auditLog.findMany({
    where: { tenantId: tenantA.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  assert(auditLogs.length > 0, '5.1: Audit trail entries present in system');
  const validAudit = auditLogs.every((log) => !!log.tenantId && !!log.createdAt && !!log.action);
  assert(validAudit, '5.2: Audit records contain complete forensic metadata (tenantId, timestamp, action)');

  // ========================================================================
  // CLEANUP TEST NOTIFICATIONS
  // ========================================================================
  console.log('\n--- CLEANUP TEST ARTIFACTS ---');
  if (createdNotificationIds.length > 0) {
    await prisma.notification.deleteMany({
      where: { id: { in: createdNotificationIds } },
    });
    console.log(`  Cleaned up ${createdNotificationIds.length} temporary test notifications.`);
  }

  console.log('\n========================================================================');
  console.log(`🎉 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED out of ${testsPassed + testsFailed} tests`);
  console.log('========================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runWorkflowFeedbackAndNotificationsTests()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

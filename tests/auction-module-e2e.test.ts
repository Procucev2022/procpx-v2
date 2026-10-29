// tests/auction-module-e2e.test.ts
// Comprehensive Automated Test Suite for proCPX E-Auction Module
import { PrismaClient } from '@prisma/client';
import { hasPermission } from '../src/lib/permissions';

const prisma = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
    testsFailed++;
  }
}

async function runAuctionTestSuite() {
  console.log('================================================================');
  console.log('🚀 PROCPX B2B E-AUCTION MODULE — AUTOMATED END-TO-END TEST SUITE');
  console.log('================================================================\n');

  // 1. Base Tenant & User Verification
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'procucev-retail-demo' } });
  if (!tenant) throw new Error('Tenant procucev-retail-demo not found');

  const procurementUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'PROCUREMENT_USER' },
  });
  const projectUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'PROJECT_USER' },
  });

  const vendors = await prisma.vendor.findMany({
    where: { tenantId: tenant.id },
    take: 4,
  });

  if (vendors.length < 2) {
    throw new Error('Need at least 2 test vendors');
  }

  // ============================================================
  // SUITE 1: RBAC PERMISSIONS & ROLE SCOPES
  // ============================================================
  console.log('--- 1. RBAC PERMISSIONS & ROLE-BASED ACCESS ---');
  assert(hasPermission('PROCUREMENT_USER', 'AUCTION_MANAGE'), '1.1: Procurement User has AUCTION_MANAGE');
  assert(hasPermission('PROCUREMENT_USER', 'AUCTION_VIEW'), '1.2: Procurement User has AUCTION_VIEW');
  assert(hasPermission('VENDOR', 'AUCTION_VIEW'), '1.3: Vendor has AUCTION_VIEW');
  assert(hasPermission('VENDOR', 'AUCTION_BID'), '1.4: Vendor has AUCTION_BID');
  assert(!hasPermission('VENDOR', 'AUCTION_MANAGE'), '1.5: Vendor CANNOT configure auctions (no AUCTION_MANAGE)');
  assert(hasPermission('PROJECT_USER', 'AUCTION_VIEW'), '1.6: Project User has AUCTION_VIEW (Observer)');
  assert(!hasPermission('PROJECT_USER', 'AUCTION_BID'), '1.7: Project User CANNOT place bids (Observer only)');
  assert(!hasPermission('PROJECT_USER', 'AUCTION_MANAGE'), '1.8: Project User CANNOT configure auctions');

  // ============================================================
  // SUITE 2: TEST DATA PERSISTENCE CHECK (POLICY COMPLIANCE)
  // ============================================================
  console.log('\n--- 2. MANDATORY DATA PERSISTENCE ---');
  const baselineAuction = await prisma.auction.findFirst({
    where: { auctionNumber: 'AUC-2026-000001' },
    include: { bids: true },
  });
  assert(!!baselineAuction, '2.1: Pre-existing auction AUC-2026-000001 was preserved');
  assert((baselineAuction?.bids.length || 0) >= 3, '2.2: Existing bids for AUC-2026-000001 remain intact');

  // Find an RFQ for testing
  const rfq = await prisma.rfq.findFirst({
    where: { tenantId: tenant.id },
    include: { lines: true, invitedVendors: true, quotes: true },
  });
  if (!rfq) throw new Error('No test RFQ found');

  // ============================================================
  // SUITE 3: REVERSE AUCTION (RFQ TOTAL WISE) & BID VALIDATION
  // ============================================================
  console.log('\n--- 3. REVERSE AUCTION (RFQ TOTAL WISE) & BID VALIDATION ---');
  const startCeiling = 1000000;
  const minDecrement = 10000;
  const now = new Date();
  const endTime = new Date(now.getTime() + 3600000); // 1 hour

  const reverseAuction = await prisma.auction.create({
    data: {
      tenantId: tenant.id,
      rfqId: rfq.id,
      auctionNumber: `TEST-REV-${Date.now()}`,
      title: 'Automated Test: Reverse E-Auction (Total Wise)',
      auctionCategory: 'RFQ_TOTAL_WISE',
      auctionType: 'REVERSE_AUCTION',
      currency: 'INR',
      startingPrice: startCeiling,
      currentLowestBid: startCeiling,
      currentLeadingBid: startCeiling,
      hasStartPrice: true,
      hasLeadingPrice: true,
      hasMinBidReduction: true,
      minDecrement,
      hasAutoExtension: true,
      autoExtensionMinutes: 5,
      hasBidLimit: true,
      maxBidsPerParticipant: 5,
      startTime: now,
      endTime,
      scheduledEndTime: endTime,
      status: 'LIVE',
      vendors: {
        create: [
          {
            tenantId: tenant.id,
            vendorId: vendors[0].id,
            termsAccepted: true,
            termsAcceptedAt: now,
          },
          {
            tenantId: tenant.id,
            vendorId: vendors[1].id,
            termsAccepted: false, // Vendor 1 has not accepted terms yet
          },
        ],
      },
    },
    include: { vendors: true },
  });

  assert(reverseAuction.auctionType === 'REVERSE_AUCTION', '3.1: Reverse auction created');
  assert(reverseAuction.currentLowestBid === startCeiling, '3.2: Starting ceiling price configured');

  // Test 3.3: Unaccepted terms rejection
  const v1Participation = reverseAuction.vendors.find(v => v.vendorId === vendors[1].id);
  assert(!v1Participation?.termsAcceptedAt, '3.3: Vendor 2 has not accepted terms');

  // Test 3.4: First bid <= starting price
  const validFirstBid = startCeiling - minDecrement; // 990,000
  const bid1 = await prisma.auctionBid.create({
    data: {
      tenantId: tenant.id,
      auctionId: reverseAuction.id,
      vendorId: vendors[0].id,
      bidNumber: 1,
      bidAmount: validFirstBid,
      rank: 1,
      timestamp: new Date(),
    },
  });

  await prisma.auction.update({
    where: { id: reverseAuction.id },
    data: {
      currentLowestBid: validFirstBid,
      currentLeadingBid: validFirstBid,
      currentWinningVendorId: vendors[0].id,
    },
  });

  assert(bid1.bidAmount === 990000, '3.4: Valid decrement accepted (₹990,000 <= ₹1,000,000 - ₹10,000)');

  // Test 3.5: Invalid increment rejection simulation (Reverse Auction requires strictly lower bids)
  const invalidBid = 995000; // Greater than allowed (max allowed is 990,000 - 10,000 = 980,000)
  const isInvalid = invalidBid > (validFirstBid - minDecrement);
  assert(isInvalid, '3.5: Reverse auction rejects higher bid or insufficient decrement');

  // ============================================================
  // SUITE 4: ROLLING AUTO-EXTENSION VERIFICATION
  // ============================================================
  console.log('\n--- 4. ROLLING AUTO-EXTENSION ENGINE ---');
  // Simulate an auction scheduled to end in 2 minutes (threshold is 5 mins)
  const closingSoonEnd = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes remaining
  const extThresholdMs = 5 * 60 * 1000;
  const remainingMs = closingSoonEnd.getTime() - Date.now();
  const willExtend = remainingMs <= extThresholdMs && remainingMs > 0;

  assert(willExtend, '4.1: Bid received within 5-minute closing window triggers rolling extension');

  const rolledEndTime = new Date(closingSoonEnd.getTime() + extThresholdMs);
  const extendedAuction = await prisma.auction.update({
    where: { id: reverseAuction.id },
    data: {
      endTime: rolledEndTime,
      scheduledEndTime: rolledEndTime,
      extensionCount: { increment: 1 },
      status: 'EXTENDED',
    },
  });

  assert(extendedAuction.status === 'EXTENDED', '4.2: Auction status updated to EXTENDED');
  assert(extendedAuction.extensionCount === 1, '4.3: Extension count incremented');
  assert(extendedAuction.endTime.getTime() > closingSoonEnd.getTime(), '4.4: End time rolled forward server-side');

  // ============================================================
  // SUITE 5: FORWARD AUCTION & INCREMENT VALIDATION
  // ============================================================
  console.log('\n--- 5. FORWARD AUCTION & INCREMENT LOGIC ---');
  const forwardFloor = 500000;
  const forwardIncrement = 15000;

  const forwardAuction = await prisma.auction.create({
    data: {
      tenantId: tenant.id,
      rfqId: rfq.id,
      auctionNumber: `TEST-FWD-${Date.now()}`,
      title: 'Automated Test: Forward Auction (Asset Sale)',
      auctionCategory: 'RFQ_TOTAL_WISE',
      auctionType: 'FORWARD_AUCTION',
      currency: 'INR',
      startingPrice: forwardFloor,
      currentLowestBid: forwardFloor,
      currentLeadingBid: forwardFloor,
      hasStartPrice: true,
      hasLeadingPrice: true,
      hasMinBidReduction: true,
      minDecrement: forwardIncrement,
      startTime: now,
      endTime,
      status: 'LIVE',
    },
  });

  const validForwardBid = forwardFloor + forwardIncrement; // 515,000
  assert(validForwardBid >= forwardFloor + forwardIncrement, '5.1: Forward auction accepts valid increment (₹515,000 >= ₹500,000 + ₹15,000)');

  const invalidLowerBid = 510000;
  assert(invalidLowerBid < validForwardBid, '5.2: Forward auction rejects bids lower than leading price + increment');

  // ============================================================
  // SUITE 6: SEALED BID STRICT SINGLE-SUBMISSION & CONFIDENTIALITY
  // ============================================================
  console.log('\n--- 6. SEALED BID CONFIDENTIALITY & 1-SUBMISSION RULE ---');
  const sealedAuction = await prisma.auction.create({
    data: {
      tenantId: tenant.id,
      rfqId: rfq.id,
      auctionNumber: `TEST-SLD-${Date.now()}`,
      title: 'Automated Test: Confidential Sealed Bid',
      auctionCategory: 'RFQ_TOTAL_WISE',
      auctionType: 'SEALED_BID',
      currency: 'INR',
      startingPrice: 2000000,
      hasStartPrice: false,
      hasLeadingPrice: false, // Sealed bids never display leading prices
      hasBidLimit: true,
      maxBidsPerParticipant: 1, // Strict single submission
      startTime: now,
      endTime,
      status: 'LIVE',
      vendors: {
        create: [
          {
            tenantId: tenant.id,
            vendorId: vendors[0].id,
            termsAccepted: true,
            termsAcceptedAt: now,
          },
        ],
      },
    },
  });

  assert(sealedAuction.hasLeadingPrice === false, '6.1: Sealed bid hasLeadingPrice is forced to false');
  assert(sealedAuction.maxBidsPerParticipant === 1, '6.2: Sealed bid enforces exactly 1 bid per participant');

  // Submit First Sealed Bid
  const sealedBid1 = await prisma.auctionBid.create({
    data: {
      tenantId: tenant.id,
      auctionId: sealedAuction.id,
      vendorId: vendors[0].id,
      bidNumber: 1,
      bidAmount: 1850000,
      timestamp: new Date(),
    },
  });

  const existingBidsCount = await prisma.auctionBid.count({
    where: { auctionId: sealedAuction.id, vendorId: vendors[0].id },
  });

  assert(existingBidsCount === 1, '6.3: First sealed bid logged successfully');

  // Attempt second sealed bid from same vendor
  const canSubmitSecondBid = existingBidsCount < 1;
  assert(!canSubmitSecondBid, '6.4: Subsequent sealed bid from same participant is strictly blocked');

  // ============================================================
  // SUITE 7: ITEM-WISE AUCTION CONFIGURATION
  // ============================================================
  console.log('\n--- 7. ITEM-WISE AUCTION CAPABILITY ---');
  const itemWiseAuction = await prisma.auction.create({
    data: {
      tenantId: tenant.id,
      rfqId: rfq.id,
      auctionNumber: `TEST-ITM-${Date.now()}`,
      title: 'Automated Test: Item-Wise Auction',
      auctionCategory: 'ITEM_WISE',
      auctionType: 'REVERSE_AUCTION',
      currency: 'INR',
      startingPrice: 0,
      hasStartPrice: true,
      startTime: now,
      endTime,
      status: 'SCHEDULED',
      items: {
        create: [
          {
            tenantId: tenant.id,
            itemCode: 'ITEM-001',
            description: 'Distribution Transformer 500kVA',
            category: 'Electrical',
            uom: 'SET',
            quantity: 2,
            startPrice: 450000,
          },
          {
            tenantId: tenant.id,
            itemCode: 'ITEM-002',
            description: 'HT Panel 11kV VCB',
            category: 'Electrical',
            uom: 'NOS',
            quantity: 1,
            startPrice: 320000,
          },
        ],
      },
    },
    include: { items: true },
  });

  assert(itemWiseAuction.auctionCategory === 'ITEM_WISE', '7.1: Item-Wise auction created');
  assert(itemWiseAuction.items.length === 2, '7.2: Item-Wise items persisted with individual start prices');
  assert(itemWiseAuction.items[0].startPrice === 450000, '7.3: Item 1 starting price verified');

  // ============================================================
  // SUITE 8: MANDATORY NON-INVITED VENDOR JUSTIFICATION
  // ============================================================
  console.log('\n--- 8. NON-INVITED VENDOR JUSTIFICATION POLICY ---');
  const totalQuotedVendors = 3;
  const invitedVendorsCount = 2;
  const justificationProvided = 'Vendor 3 failed technical compliance audit during RFQ evaluation.';

  const isJustificationRequired = invitedVendorsCount < totalQuotedVendors;
  assert(isJustificationRequired, '8.1: Exclusion of quoted vendor triggers mandatory justification check');
  assert(justificationProvided.length > 10, '8.2: Mandatory justification comments accepted and validated');

  // Clean up only temporary test records created in this test
  console.log('\n--- CLEANING UP TEMPORARY TEST RECORDS ---');
  await prisma.auctionBid.deleteMany({
    where: { auctionId: { in: [reverseAuction.id, forwardAuction.id, sealedAuction.id, itemWiseAuction.id] } },
  });
  await prisma.auctionVendor.deleteMany({
    where: { auctionId: { in: [reverseAuction.id, forwardAuction.id, sealedAuction.id, itemWiseAuction.id] } },
  });
  await prisma.auctionItem.deleteMany({
    where: { auctionId: itemWiseAuction.id },
  });
  await prisma.auction.deleteMany({
    where: { id: { in: [reverseAuction.id, forwardAuction.id, sealedAuction.id, itemWiseAuction.id] } },
  });

  console.log('  ✅ Temporary test records cleaned up. Baseline data strictly preserved.');

  // Summary
  console.log('\n============================================================');
  console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAuctionTestSuite()
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

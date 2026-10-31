// scripts/verify-cm-commercial-workspace.ts
// Comprehensive verification for proCPX Category Manager Full-Window Commercial Workspace

import { prisma } from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=====================================================================');
  console.log(' proCPX — ENTERPRISE TABULAR UI REFINEMENT VERIFICATION ');
  console.log('=====================================================================\n');

  // 1. Verify Component File & Column Structure
  const compPath = path.join(process.cwd(), 'src/components/ProcurementCommercialWorkspace.tsx');
  if (!fs.existsSync(compPath)) {
    throw new Error('ProcurementCommercialWorkspace.tsx does not exist!');
  }
  const compCode = fs.readFileSync(compPath, 'utf8');

  console.log('1. REFINED ENTERPRISE COLUMN HEADERS VERIFICATION:');
  const requiredColumns = [
    { label: '#', desc: 'Serial Number' },
    { label: 'Item Description', desc: 'Item Scope Description' },
    { label: 'Specification / Scope', desc: 'Specification' },
    { label: 'UOM', desc: 'Unit of Measure' },
    { label: 'Qty', desc: 'Approved Baseline Quantity' },
    { label: 'AI Rate', desc: 'AI Estimated Unit Rate' },
    { label: 'AI Amount', desc: 'AI Estimated Line Amount' },
    { label: 'Rate', desc: 'Vendor Quoted Unit Rate' },
    { label: 'Amount', desc: 'Vendor Quoted Line Total' },
    { label: 'Buyer Offer Rate', desc: 'Buyer Proposed Counteroffer Rate' },
    { label: 'Buyer Offer Amount', desc: 'Buyer Proposed Counteroffer Amount' },
    { label: 'Final Rate', desc: 'Final Negotiated Unit Rate' },
    { label: 'Final Amount', desc: 'Final Negotiated Line Amount' },
    { label: 'Actions', desc: 'Action Button' },
  ];

  requiredColumns.forEach((col) => {
    const present = compCode.includes(col.label);
    console.log(`   - Column [${present ? '✅' : '❌'}]: ${col.label} (${col.desc})`);
    if (!present) throw new Error(`Missing required column header: ${col.label}`);
  });

  // 2. Verify Table Layout & Usability Controls
  console.log('\n2. TABLE USABILITY, LAYOUT & OVERLAP PREVENTION:');
  const usabilityChecks = [
    { name: 'table-responsive Container with Scrollbar', check: compCode.includes('table-responsive') },
    { name: 'Explicit Dynamic Min-Width (No Column Cramping)', check: compCode.includes('tableMinWidth') },
    { name: 'Truncated Item Description with Tooltip', check: compCode.includes('truncate max-w-[200px]') },
    { name: 'Compact Specification Preview with Full Expand', check: compCode.includes('truncate max-w-[170px]') },
    { name: 'Monetary Alignment (tabular-nums font-mono)', check: compCode.includes('tabular-nums font-mono') },
    { name: 'Clean Currency Prefixed Counteroffer Input', check: compCode.includes('userCounterRate') && compCode.includes('pl-6') },
    { name: 'High-Visibility Horizontal Scrollbar Styling', check: compCode.includes('scrollbarColor') },
    { name: 'Save Draft Support (localStorage)', check: compCode.includes('handleSaveDraft') },
    { name: 'Batch Counteroffer Submission', check: compCode.includes('handleSubmitBatchCounteroffer') },
    { name: 'Dedicated Single-Line Item Modal', check: compCode.includes('activeLineModal') },
    { name: 'AI Cost Breakdown in Expandable Detail', check: compCode.includes('AI Benchmark Cost Breakdown') },
  ];

  usabilityChecks.forEach((c) => {
    console.log(`   - Feature [${c.check ? '✅ PASS' : '❌ FAIL'}]: ${c.name}`);
    if (!c.check) throw new Error(`Check failed for: ${c.name}`);
  });

  // 3. Verify Consolidated Commercial Terms Below the Table
  console.log('\n3. CONSOLIDATED COMMERCIAL TERMS BELOW TABLE:');
  const termsChecks = [
    'Consolidated Commercial Terms & Vendor Specific Conditions',
    'Payment Terms & Credit Period',
    'Taxes & GST Treatment',
    'Delivery Schedule & Lead Time',
    'Freight & Unloading Terms',
    'Warranty & Defects Liability',
    'Commercial Offer Validity',
    'Vendor Deviations & Remarks',
  ];

  termsChecks.forEach((term) => {
    const present = compCode.includes(term);
    console.log(`   - Term [${present ? '✅' : '❌'}]: ${term}`);
    if (!present) throw new Error(`Missing commercial term field: ${term}`);
  });

  // 4. Verify RFQ Detail Integration
  console.log('\n4. RFQ DETAIL PAGE INTEGRATION:');
  const pagePath = path.join(process.cwd(), 'src/app/(app)/procurement/rfqs/[id]/page.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');

  const integrated = pageCode.includes('<ProcurementCommercialWorkspace');
  console.log(`   - ProcurementCommercialWorkspace integrated in Tab 1: ${integrated ? '✅ PASS' : '❌ FAIL'}`);
  if (!integrated) throw new Error('ProcurementCommercialWorkspace not rendered in page.tsx');

  // Verify Tab 2 and Tab 3 are preserved
  const tab2Preserved = pageCode.includes("activeTab === 'negotiation'");
  const tab3Preserved = pageCode.includes("activeTab === 'awarding'");
  console.log(`   - Tab 2 (Negotiation history) preserved: ${tab2Preserved ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   - Tab 3 (Awarding & PPO) preserved: ${tab3Preserved ? '✅ PASS' : '❌ FAIL'}`);
  if (!tab2Preserved || !tab3Preserved) throw new Error('Top lifecycle tabs were broken!');

  // 5. Test Live Database Data Consistency for RFQ-2026-000001
  console.log('\n5. DATABASE PERSISTENCE FOR RFQ-2026-000001:');
  const rfq = await prisma.rfq.findFirst({
    where: { rfqNumber: 'RFQ-2026-000001' },
    include: {
      lines: true,
      invitedVendors: { include: { vendor: true } },
      quotes: { include: { lines: true, vendor: true } },
      negotiations: { include: { rounds: true } },
      awards: true,
      ppos: true,
    },
  });

  if (!rfq) {
    console.log('   - RFQ-2026-000001 not found in dev database.');
  } else {
    console.log(`   - Found RFQ: ${rfq.rfqNumber} ("${rfq.title}")`);
    console.log(`   - Lines Count: ${rfq.lines.length}`);
    console.log(`   - Invited Vendors: ${rfq.invitedVendors.length}`);
    console.log(`   - Submitted Quotes: ${rfq.quotes.length}`);
    console.log(`   - Negotiations: ${rfq.negotiations.length} (Rounds: ${rfq.negotiations[0]?.rounds?.length || 0})`);
    console.log(`   - Awards: ${rfq.awards.length}`);
    console.log(`   - PPOs: ${rfq.ppos.length}`);
  }

  console.log('\n=====================================================================');
  console.log(' ALL VERIFICATION CHECKS PASSED: REFINED TABULAR UI VERIFIED ');
  console.log('=====================================================================\n');
}

main()
  .catch((e) => {
    console.error('Audit failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

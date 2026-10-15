import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface BaselineSnapshot {
  timestamp: string;
  counts: {
    tenants: number;
    users: number;
    categories: number;
    projects: number;
    costCentres: number;
    boqs: number;
    boqLines: number;
    prs: number;
    prLines: number;
    approvedPrs: number;
    vendors: number;
    rfqs: number;
    rfqLines: number;
    quotes: number;
    quoteLines: number;
    negotiations: number;
    awards: number;
    ppos: number;
    ppoLines: number;
  };
  sampleIdentifiers: {
    categories: Array<{ id: string; code: string | null; name: string }>;
    projects: Array<{ id: string; projectCode: string; name: string }>;
    costCentres: Array<{ id: string; code: string; name: string }>;
    boqs: Array<{ id: string; boqCode: string; title: string | null; status: string }>;
    prs: Array<{ id: string; prNumber: string; title: string; status: string }>;
    vendors: Array<{ id: string; code: string | null; name: string }>;
    rfqs: Array<{ id: string; rfqNumber: string; title: string; status: string }>;
    quotes: Array<{ id: string; quoteNumber: string; status: string; totalQuoteAmount: number | null }>;
    awards: Array<{ id: string; status: string }>;
    ppos: Array<{ id: string; ppoNumber: string; status: string }>;
  };
}

async function captureSnapshot(): Promise<BaselineSnapshot> {
  const tenantsCount = await prisma.tenant.count();
  const usersCount = await prisma.user.count();
  const categories = await prisma.category.findMany({ select: { id: true, name: true, code: true } });
  const projects = await prisma.project.findMany({ select: { id: true, projectCode: true, name: true } });
  const costCentres = await prisma.costCentre.findMany({ select: { id: true, code: true, name: true } });
  const boqs = await prisma.boq.findMany({ select: { id: true, boqCode: true, title: true, status: true } });
  const boqLinesCount = await prisma.boqLine.count();
  const prs = await prisma.procurementRequest.findMany({ select: { id: true, prNumber: true, title: true, status: true } });
  const prLinesCount = await prisma.pRLine.count();
  const approvedPrsCount = await prisma.procurementRequest.count({
    where: { status: { in: ['PR_APPROVED', 'PR_RELEASED_TO_PROCUREMENT', 'APPROVED', 'RELEASED'] } }
  });
  const vendors = await prisma.vendor.findMany({ select: { id: true, name: true, code: true } });
  const rfqs = await prisma.rfq.findMany({ select: { id: true, rfqNumber: true, title: true, status: true } });
  const rfqLinesCount = await prisma.rfqLine.count();
  const quotes = await prisma.quote.findMany({ select: { id: true, quoteNumber: true, status: true, totalQuoteAmount: true } });
  const quoteLinesCount = await prisma.quoteLine.count();
  const negotiationsCount = await prisma.negotiation.count();
  const awards = await prisma.awardRecommendation.findMany({ select: { id: true, status: true } });
  const ppos = await prisma.ppo.findMany({ select: { id: true, ppoNumber: true, status: true } });
  const ppoLinesCount = await prisma.ppoLine.count();

  return {
    timestamp: new Date().toISOString(),
    counts: {
      tenants: tenantsCount,
      users: usersCount,
      categories: categories.length,
      projects: projects.length,
      costCentres: costCentres.length,
      boqs: boqs.length,
      boqLines: boqLinesCount,
      prs: prs.length,
      prLines: prLinesCount,
      approvedPrs: approvedPrsCount,
      vendors: vendors.length,
      rfqs: rfqs.length,
      rfqLines: rfqLinesCount,
      quotes: quotes.length,
      quoteLines: quoteLinesCount,
      negotiations: negotiationsCount,
      awards: awards.length,
      ppos: ppos.length,
      ppoLines: ppoLinesCount
    },
    sampleIdentifiers: {
      categories: categories.slice(0, 5),
      projects: projects.slice(0, 5),
      costCentres: costCentres.slice(0, 5),
      boqs: boqs.slice(0, 5),
      prs: prs.slice(0, 5),
      vendors: vendors.slice(0, 5),
      rfqs: rfqs.slice(0, 5),
      quotes: quotes.slice(0, 5),
      awards: awards.slice(0, 5),
      ppos: ppos.slice(0, 5)
    }
  };
}

async function run() {
  const args = process.argv.slice(2);
  const snapshot = await captureSnapshot();
  const snapshotPath = path.join(__dirname, '../prisma/backups/latest-integrity-snapshot.json');

  console.log('===============================================================');
  console.log('   proCPX TEST DATA INTEGRITY & REGRESSION BASELINE REPORT     ');
  console.log('===============================================================');
  console.log(`Timestamp: ${snapshot.timestamp}`);
  console.log('RECORD COUNTS:');
  console.table(snapshot.counts);

  // Policy Section 3 Compliance Check
  const checks = [
    { requirement: 'At least 2 Categories', satisfied: snapshot.counts.categories >= 2, count: snapshot.counts.categories },
    { requirement: 'At least 1 Project', satisfied: snapshot.counts.projects >= 1, count: snapshot.counts.projects },
    { requirement: 'At least 2 Cost Centres', satisfied: snapshot.counts.costCentres >= 2, count: snapshot.counts.costCentres },
    { requirement: 'At least 1 BOQ with Line Items', satisfied: snapshot.counts.boqs >= 1 && snapshot.counts.boqLines > 0, count: `${snapshot.counts.boqs} boqs / ${snapshot.counts.boqLines} lines` },
    { requirement: 'At least 1 PR linked with Line Items', satisfied: snapshot.counts.prs >= 1 && snapshot.counts.prLines > 0, count: `${snapshot.counts.prs} prs / ${snapshot.counts.prLines} lines` },
    { requirement: 'At least 1 Approved PR for RFQ creation', satisfied: snapshot.counts.approvedPrs >= 1, count: snapshot.counts.approvedPrs },
    { requirement: 'At least 3 Test Vendors', satisfied: snapshot.counts.vendors >= 3, count: snapshot.counts.vendors },
    { requirement: 'At least 1 RFQ with Quotes & Negotiation', satisfied: snapshot.counts.rfqs >= 1 && snapshot.counts.quotes >= 1 && snapshot.counts.negotiations >= 1, count: `${snapshot.counts.rfqs} rfqs / ${snapshot.counts.quotes} quotes / ${snapshot.counts.negotiations} negs` },
    { requirement: 'At least 1 Award / PPO workflow record', satisfied: snapshot.counts.awards >= 1 && snapshot.counts.ppos >= 1, count: `${snapshot.counts.awards} awards / ${snapshot.counts.ppos} ppos` }
  ];

  console.log('\nPOLICY SECTION 3 BASELINE COMPLIANCE:');
  console.table(checks);

  const allPassed = checks.every(c => c.satisfied);
  if (allPassed) {
    console.log('STATUS: FULLY COMPLIANT with baseline dataset requirements.');
  } else {
    console.warn('STATUS: WARNING - Some baseline requirements are below threshold.');
  }

  // If comparing or previous snapshot exists
  if (fs.existsSync(snapshotPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as BaselineSnapshot;
      console.log(`\nCOMPARING AGAINST SAVED SNAPSHOT (${prev.timestamp}):`);
      const comparisons: Array<{ entity: string; baseline: number; current: number; delta: number; status: string }> = [];

      for (const [key, currentVal] of Object.entries(snapshot.counts)) {
        const prevVal = (prev.counts as any)[key] ?? 0;
        const delta = currentVal - prevVal;
        const status = delta < 0 ? '❌ REDUCED (DATA LOSS)' : delta > 0 ? '➕ INCREASED' : '✅ UNCHANGED';
        comparisons.push({
          entity: key,
          baseline: prevVal,
          current: currentVal,
          delta,
          status
        });
      }
      console.table(comparisons);
      const regressions = comparisons.filter(c => c.delta < 0);
      if (regressions.length > 0) {
        console.error('❌ ALERT: Data reduction detected on baseline entities:', regressions);
      } else {
        console.log('✅ PASS: No baseline records were unintentionally deleted or reduced.');
      }
    } catch (e) {
      console.warn('Could not read previous snapshot for comparison:', e);
    }
  }

  // Save current snapshot
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`\nIntegrity snapshot updated at: ${snapshotPath}`);
  console.log('===============================================================\n');

  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Integrity check failed:', err);
  process.exit(1);
});

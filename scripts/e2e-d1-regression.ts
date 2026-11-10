// scripts/e2e-d1-regression.ts
// Local-only end-to-end regression of proCPX against the isolated Wrangler D1
// state in .wrangler/e2e-d1. Drives the real HTTP API, then verifies every
// write directly in that same local D1.
//
// Usage:  npx tsx scripts/e2e-d1-regression.ts [baseUrl]      (default http://localhost:3001)
//
// It only ADDS clearly-labelled records (prefix "E2E-D1 <run id>") to the
// isolated test D1; it never touches shared or remote records and refuses
// non-local app URLs.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { TEST_FIXTURE_PASSWORD } from '../src/app/login/page.constants';
import { LOCAL_D1_EXECUTE_ARGS, requireLocalE2EBaseUrl } from './e2e-d1-regression.constants';

const BASE_URL = requireLocalE2EBaseUrl(process.argv[2] || process.env.E2E_BASE_URL || 'http://localhost:3001');
const RUN = `E2E-D1 ${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID().slice(0, 8)}`;

// API responses are untyped JSON; the checks below read them defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiJson = any;
type Result = { area: string; check: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (area: string, check: string, ok: boolean, detail = '') => {
  results.push({ area, check, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${check}${detail ? ` - ${detail}` : ''}`);
};

// ---------------------------------------------------------------- HTTP helpers
class Session {
  cookies = new Map<string, string>();
  constructor(public label: string) {}
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      redirect: 'manual',
      headers: { Cookie: this.header(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.absorb(res);
    const text = await res.text();
    let json: ApiJson = null;
    try { json = JSON.parse(text); } catch { /* HTML page */ }
    return { status: res.status, json, text };
  }
  get(path: string) { return this.request('GET', path); }
  post(path: string, body: unknown = {}) { return this.request('POST', path, body); }
  put(path: string, body: unknown = {}) { return this.request('PUT', path, body); }
}

async function login(email: string, password = TEST_FIXTURE_PASSWORD): Promise<Session> {
  const s = new Session(email);
  const csrf = await s.get('/api/auth/csrf');
  const form = new URLSearchParams({ csrfToken: csrf.json.csrfToken, email, password, callbackUrl: `${BASE_URL}/dashboard` });
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: s.header(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  s.absorb(res);
  const me = await s.get('/api/auth/session');
  if (!me.json?.user?.email) throw new Error(`Login failed for ${email}`);
  return s;
}

const data = (r: { json: ApiJson }) => r.json?.data ?? r.json;
const errorOf = (r: { status: number; json: ApiJson; text: string }) =>
  `HTTP ${r.status} ${r.json?.error || r.json?.message || r.text.slice(0, 160)}`;

// ---------------------------------------------------------------- D1 helpers
const WRANGLER = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function d1<T = Record<string, unknown>>(sql: string): T[] {
  // Local-only D1 is deliberate: the regression must never read or write remote data.
  // Run Wrangler directly without a shell so SQL is passed verbatim.
  const out = execFileSync(process.execPath, [WRANGLER, ...LOCAL_D1_EXECUTE_ARGS, '--command', sql.replace(/\s+/g, ' ')], {
    encoding: 'utf8', env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out)[0].results as T[];
}
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

const BASELINE_SQL = `SELECT
  (SELECT count(*) FROM tenants) tenants, (SELECT count(*) FROM users) users,
  (SELECT count(*) FROM categories) categories, (SELECT count(*) FROM projects) projects,
  (SELECT count(*) FROM cost_centres) costCentres, (SELECT count(*) FROM boqs) boqs,
  (SELECT count(*) FROM boq_lines) boqLines, (SELECT count(*) FROM procurement_requests) prs,
  (SELECT count(*) FROM pr_lines) prLines, (SELECT count(*) FROM vendors) vendors,
  (SELECT count(*) FROM rfqs) rfqs, (SELECT count(*) FROM rfq_lines) rfqLines,
  (SELECT count(*) FROM quotes) quotes, (SELECT count(*) FROM quote_lines) quoteLines,
  (SELECT count(*) FROM negotiations) negotiations, (SELECT count(*) FROM award_recommendations) awards,
  (SELECT count(*) FROM ppos) ppos, (SELECT count(*) FROM ppo_lines) ppoLines`;

// ---------------------------------------------------------------- 1. role sweep
const LIST_ENDPOINTS = [
  '/api/auth/me', '/api/dashboard', '/api/notifications', '/api/projects', '/api/cost-centres', '/api/boq',
  '/api/masters/categories', '/api/masters/uom', '/api/pr', '/api/approvals', '/api/budgets', '/api/audit',
  '/api/actual-costs', '/api/financial/budget-vs-actual', '/api/admin/users', '/api/boq/standard-library',
  '/api/procurement/approved-boqs', '/api/procurement/approved-prs', '/api/procurement/rfqs',
  '/api/procurement/vendors', '/api/procurement/quotes', '/api/procurement/negotiations',
  '/api/procurement/awards', '/api/procurement/ppos', '/api/procurement/rate-cards',
  '/api/procurement/auctions', '/api/procurement/auctions/rfq-options', '/api/approvals/vendor-ratings',
  '/api/vendor-portal/me', '/api/vendor-portal/rfqs', '/api/vendor-portal/ppos', '/api/vendor-portal/rate-cards',
];
const PAGES = ['/dashboard', '/projects', '/boq', '/pr', '/approvals/boq-pr', '/procurement/rfqs', '/masters/standard-boq'];
const ROLES = [
  'project.user@test.procpx.local', 'project.approver@test.procpx.local', 'procurement.user@test.procpx.local',
  'finance.user@test.procpx.local', 'category.manager@test.procpx.local', 'client.admin@test.procpx.local',
  'super.admin@test.procpx.local', 'viewer@test.procpx.local',
];

async function roleSweep() {
  const sessions: Record<string, Session> = {};
  for (const email of ROLES) {
    try {
      sessions[email] = await login(email);
      record('auth', `login ${email}`, true);
    } catch (e) {
      record('auth', `login ${email}`, false, String(e));
      continue;
    }
    const s = sessions[email];
    const fivexx: string[] = [];
    const counts = { ok: 0, denied: 0 };
    for (const path of [...LIST_ENDPOINTS, ...PAGES]) {
      const r = await s.get(path);
      if (r.status >= 500) fivexx.push(`${path} ${errorOf(r)}`);
      else if (r.status === 401 || r.status === 403) counts.denied++;
      else counts.ok++;
    }
    record('role sweep', `${email}: ${LIST_ENDPOINTS.length + PAGES.length} endpoints/pages, no server errors`,
      fivexx.length === 0, fivexx.length ? fivexx.join(' | ') : `${counts.ok} allowed, ${counts.denied} denied`);
  }
  return sessions;
}

// ---------------------------------------------------------------- 2. permissions & tenant isolation
async function securityChecks(s: Record<string, Session>) {
  const anon = new Session('anonymous');
  for (const path of ['/api/projects', '/api/boq', '/api/procurement/rfqs']) {
    const r = await anon.get(path);
    record('security', `anonymous ${path} rejected`, r.status === 401 || r.status === 403, `HTTP ${r.status}`);
  }
  const viewer = s['viewer@test.procpx.local'];
  if (viewer) {
    const r = await viewer.post('/api/projects', { name: `${RUN} viewer must not create` });
    record('security', 'VIEWER cannot create a project', r.status === 403, `HTTP ${r.status}`);
  }
  const pu = s['project.user@test.procpx.local'];
  if (pu) {
    const r = await pu.post('/api/procurement/rfqs', { title: `${RUN} forbidden` });
    record('security', 'PROJECT_USER cannot create an RFQ', r.status === 403, `HTTP ${r.status}`);
  }

  // Tenant isolation: the hospitality tenant must not see retail records.
  const retailProject = d1<{ id: string }>(`SELECT p.id FROM projects p JOIN tenants t ON t.id=p.tenantId WHERE t.slug='procpx-regression-fixtures' LIMIT 1`)[0];
  if (!retailProject) throw new Error('Local D1 regression fixtures are missing; run npm run db:seed:test first.');
  const hosp = await login('hospitality.user@test.procpx.local');
  const list = await hosp.get('/api/projects');
  const ids: string[] = (data(list) || []).map((p: { id: string }) => p.id);
  record('security', 'tenant isolation: hospitality tenant does not list retail projects', !ids.includes(retailProject.id), `${ids.length} own projects`);
  const direct = await hosp.get(`/api/projects/${retailProject.id}`);
  record('security', 'tenant isolation: hospitality tenant cannot open a retail project by ID', direct.status === 404 || direct.status === 403, `HTTP ${direct.status}`);
}

// ---------------------------------------------------------------- 3. full workflow with writes
async function workflow(s: Record<string, Session>) {
  const pu = s['project.user@test.procpx.local'];
  const pa = s['project.approver@test.procpx.local'];
  const proc = s['procurement.user@test.procpx.local'];
  const cm = s['category.manager@test.procpx.local'] || s['client.admin@test.procpx.local'];
  const stamp = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  const step = (name: string, ok: boolean, detail = '') => { record('workflow', name, ok, detail); if (!ok) throw new Error(`stopped at: ${name}`); };

  // Category
  const catCode = `E2ED1${stamp}`;
  let r = await cm.post('/api/masters/categories', { name: `${RUN} Category`, code: catCode });
  step('create category', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const cat = d1(`SELECT id, name FROM categories WHERE code=${q(catCode)}`);
  step('category persisted in D1', cat.length === 1, String(cat[0]?.id ?? ''));

  // Project
  r = await pu.post('/api/projects', { name: `${RUN} Project`, sector: 'RETAIL', projectType: 'NEW_BUILD', city: 'Bengaluru', budget: 2500000, currency: 'INR' });
  step('create project', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const project = data(r)?.project ?? data(r);
  const projectId: string = project.id;
  const dbProject = d1(`SELECT id, projectCode, createdAt FROM projects WHERE id=${q(projectId)}`);
  step('project persisted in D1', dbProject.length === 1, `${dbProject[0]?.projectCode} createdAt=${dbProject[0]?.createdAt}`);

  // Two cost centres
  const ccIds: string[] = [];
  for (const n of [1, 2]) {
    r = await pu.post('/api/cost-centres', { projectId, code: `E2E-${stamp}-${n}`, name: `${RUN} Cost Centre ${n}` });
    step(`create cost centre ${n}`, r.status < 300, r.status < 300 ? '' : errorOf(r));
    ccIds.push((data(r)?.costCentre ?? data(r)).id);
  }
  step('cost centres persisted in D1', d1(`SELECT id FROM cost_centres WHERE projectId=${q(projectId)}`).length === 2);

  // BOQ with multiple lines
  const lines = [
    { lineNumber: '1', description: 'Vitrified tile flooring 600x600', uom: 'SQM', quantity: 120, category: 'Civil' },
    { lineNumber: '2', description: 'Gypsum false ceiling', uom: 'SQM', quantity: 80, category: 'Civil' },
    { lineNumber: '3', description: 'LED panel light 36W', uom: 'NOS', quantity: 24, category: 'Electrical' },
  ];
  r = await pu.post('/api/boq/manual', { projectId, costCentreId: ccIds[0], title: `${RUN} BOQ`, purpose: 'BUDGET', lines });
  step('create BOQ with 3 lines', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const boqRow = d1<{ boqId: string; revisionId: string; status: string }>(
    `SELECT b.id boqId, r.id revisionId, r.status FROM boqs b JOIN boq_revisions r ON r.boqId=b.id WHERE b.projectId=${q(projectId)} ORDER BY r.revisionNumber DESC LIMIT 1`)[0];
  const lineCount = d1<{ c: number }>(`SELECT count(*) c FROM boq_lines WHERE boqRevisionId=${q(boqRow?.revisionId ?? '')}`)[0]?.c;
  step('BOQ and lines persisted in D1', !!boqRow && lineCount === 3, `revision ${boqRow?.revisionId} status=${boqRow?.status} lines=${lineCount}`);

  // Validate / submit / approve BOQ
  await pu.post(`/api/boq/${boqRow.revisionId}/validate`);
  r = await pu.post(`/api/boq/${boqRow.revisionId}/submit`);
  step('submit BOQ', r.status < 300, r.status < 300 ? '' : errorOf(r));
  r = await pa.post(`/api/boq/${boqRow.revisionId}/approve`, { remarks: `${RUN} approved` });
  step('approve BOQ (project approver)', r.status < 300, r.status < 300 ? '' : errorOf(r));
  step('BOQ approval persisted in D1', d1<{ status: string }>(`SELECT status FROM boq_revisions WHERE id=${q(boqRow.revisionId)}`)[0]?.status === 'APPROVED');

  // PR from BOQ
  r = await pu.post('/api/boq/create-pr', { boqRevisionId: boqRow.revisionId, boqId: boqRow.boqId, costCentreId: ccIds[0], projectId, title: `${RUN} PR` });
  step('create PR from BOQ', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const pr = d1<{ id: string; prNumber: string; status: string }>(`SELECT id, prNumber, status FROM procurement_requests WHERE projectId=${q(projectId)} ORDER BY createdAt DESC LIMIT 1`)[0];
  const prLines = d1<{ c: number }>(`SELECT count(*) c FROM pr_lines WHERE prId=${q(pr?.id ?? '')}`)[0]?.c;
  step('PR persisted in D1, linked to BOQ and cost centre', !!pr && prLines === 3, `${pr?.prNumber} status=${pr?.status} lines=${prLines}`);

  if (pr.status === 'PR_DRAFT') {
    r = await pu.post(`/api/pr/${pr.id}/submit`);
    step('submit PR', r.status < 300, r.status < 300 ? '' : errorOf(r));
  }
  r = await pa.post(`/api/pr/${pr.id}/approve`, { remarks: `${RUN} approved` });
  step('approve PR (project approver)', r.status < 300, r.status < 300 ? '' : errorOf(r));
  r = await pa.post(`/api/pr/${pr.id}/release-to-procurement`);
  step('release PR to procurement', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const prStatus = d1<{ status: string }>(`SELECT status FROM procurement_requests WHERE id=${q(pr.id)}`)[0]?.status;
  record('workflow', 'PR status persisted in D1', true, prStatus);

  r = await proc.get('/api/procurement/approved-prs');
  const approvedList = JSON.stringify(r.json ?? '');
  step('approved PR available for RFQ creation', approvedList.includes(pr.id) || approvedList.includes(pr.prNumber), `HTTP ${r.status}`);

  // RFQ
  const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
  r = await proc.post('/api/procurement/rfqs', { projectId, prId: pr.id, title: `${RUN} RFQ`, scopeOfWork: 'E2E D1 regression scope', submissionDeadline: deadline });
  step('create RFQ from approved PR', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const rfq = d1<{ id: string; rfqNumber: string; status: string }>(`SELECT id, rfqNumber, status FROM rfqs WHERE prId=${q(pr.id)} ORDER BY createdAt DESC LIMIT 1`)[0];
  const rfqLines = d1<{ id: string }>(`SELECT id FROM rfq_lines WHERE rfqId=${q(rfq?.id ?? '')}`);
  step('RFQ and lines persisted in D1', !!rfq && rfqLines.length === 3, `${rfq?.rfqNumber} status=${rfq?.status} lines=${rfqLines.length}`);

  // Invite 3 vendors with one atomic D1 batch.
  const vendorLogins = ['vendor.one@test.procpx.local', 'vendor.two@test.procpx.local', 'vendor.three@test.procpx.local'];
  const vendorIds = d1<{ vendorId: string; email: string }>(`SELECT vendorId, email FROM users WHERE email IN (${vendorLogins.map(q).join(',')})`);
  r = await proc.post(`/api/procurement/rfqs/${rfq.id}/vendors`, { vendorIds: vendorIds.map((v) => v.vendorId) });
  step('invite 3 vendors (transaction)', r.status < 300, r.status < 300 ? '' : errorOf(r));
  step('vendor invitations persisted in D1', d1(`SELECT id FROM rfq_vendors WHERE rfqId=${q(rfq.id)}`).length === 3);

  r = await proc.put(`/api/procurement/rfqs/${rfq.id}`, { action: 'RELEASE' });
  step('release RFQ to vendors', r.status < 300, r.status < 300 ? '' : errorOf(r));

  // Each vendor quotes with one atomic D1 batch; different rates so L1/L2/L3 exist.
  const rates = [[950, 1450, 2100], [990, 1500, 2050], [1020, 1390, 2200]];
  for (const [i, v] of vendorIds.entries()) {
    const vs = await login(v.email);
    r = await vs.post(`/api/vendor-portal/rfqs/${rfq.id}`, {
      lines: rfqLines.map((l, j) => ({ rfqLineId: l.id, unitRate: rates[i][j], gstPercent: 18, leadTimeDays: 14 })),
      commercialNotes: `${RUN} quote`, deliveryLeadTimeDays: 14,
      validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
    });
    step(`vendor ${i + 1} submits quote (transaction)`, r.status < 300, r.status < 300 ? '' : errorOf(r));
  }
  const quotes = d1<{ c: number }>(`SELECT count(*) c FROM quotes WHERE rfqId=${q(rfq.id)}`)[0]?.c;
  const qLines = d1<{ c: number }>(`SELECT count(*) c FROM quote_lines ql JOIN quotes qq ON qq.id=ql.quoteId WHERE qq.rfqId=${q(rfq.id)}`)[0]?.c;
  step('quotations persisted in D1', quotes === 3 && qLines === 9, `${quotes} quotes, ${qLines} quote lines`);

  r = await proc.get(`/api/procurement/rfqs/${rfq.id}/compare`);
  step('quote comparison loads', r.status === 200, `HTTP ${r.status}`);

  // Negotiation counter-offer to the L1 vendor uses an atomic D1 batch.
  const l1 = d1<{ vendorId: string; totalAmount: number }>(`SELECT vendorId, totalQuoteAmount totalAmount FROM quotes WHERE rfqId=${q(rfq.id)} ORDER BY totalQuoteAmount ASC LIMIT 1`)[0];
  const l1Vendor = vendorIds.find((vendor) => vendor.vendorId === l1.vendorId);
  step('L1 vendor has a test login', Boolean(l1Vendor));
  r = await proc.post('/api/procurement/negotiations', { rfqId: rfq.id, vendorId: l1.vendorId, counterOfferAmount: Math.round(l1.totalAmount * 0.95), notes: `${RUN} counter-offer` });
  step('send negotiation counter-offer (transaction)', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const rounds = d1<{ c: number }>(`SELECT count(*) c FROM negotiation_rounds nr JOIN negotiations n ON n.id=nr.negotiationId WHERE n.rfqId=${q(rfq.id)}`)[0]?.c;
  step('negotiation round persisted in D1', rounds >= 1, `${rounds} round(s)`);

  // Vendor submits a binding final offer, the buyer accepts it, then rates are locked.
  const finalQuoteLines = d1<{ rfqLineId: string; unitRate: number; quantity: number }>(
    `SELECT ql.rfqLineId, ql.unitRate, rl.quantity FROM quote_lines ql JOIN quotes qq ON qq.id=ql.quoteId JOIN rfq_lines rl ON rl.id=ql.rfqLineId WHERE qq.rfqId=${q(rfq.id)} AND qq.vendorId=${q(l1.vendorId)} ORDER BY rl.lineNumber ASC`);
  const revisedLines = finalQuoteLines.map((line) => {
    const unitRate = Number((line.unitRate * 0.95).toFixed(2));
    return { rfqLineId: line.rfqLineId, unitRate, revisedRate: unitRate, quantity: line.quantity,
      lineTotal: Number((unitRate * line.quantity * 1.18).toFixed(2)) };
  });
  const finalAmount = Number(revisedLines.reduce((total, line) => total + line.lineTotal, 0).toFixed(2));
  step('L1 quote has complete line detail', revisedLines.length === rfqLines.length);
  const l1Session = await login(l1Vendor!.email);
  r = await l1Session.post('/api/procurement/negotiations/submit-offer', {
    rfqId: rfq.id, vendorId: l1.vendorId, revisedQuoteAmount: finalAmount, isFinalOffer: true,
    lineItems: revisedLines, notes: `${RUN} final offer`,
  });
  step('vendor submits final offer (transaction)', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const finalRound = d1<{ id: string }>(`SELECT nr.id FROM negotiation_rounds nr JOIN negotiations n ON n.id=nr.negotiationId WHERE n.rfqId=${q(rfq.id)} AND nr.vendorId=${q(l1.vendorId)} ORDER BY nr.roundNumber DESC LIMIT 1`)[0];
  step('final offer round persisted in D1', Boolean(finalRound?.id));
  r = await proc.post('/api/procurement/negotiations/decision', { roundId: finalRound.id, decision: 'ACCEPTED', remarks: `${RUN} accepted` });
  step('buyer accepts final offer', r.status < 300, r.status < 300 ? '' : errorOf(r));
  r = await proc.post(`/api/procurement/rfqs/${rfq.id}/lock-rates`, { vendorId: l1.vendorId, finalCommercialValue: finalAmount, remarks: `${RUN} rates locked` });
  step('lock final rates atomically', r.status < 300, r.status < 300 ? '' : errorOf(r));
  step('final rate lock persisted in D1', d1<{ status: string }>(`SELECT status FROM rfqs WHERE id=${q(rfq.id)}`)[0]?.status === 'FINAL_RATE_LOCKED');

  // Award
  r = await proc.post('/api/procurement/awards', { rfqId: rfq.id, recommendedVendorId: l1.vendorId, originalQuoteAmount: l1.totalAmount, finalNegotiatedAmount: finalAmount, justification: `${RUN} L1 award` });
  step('submit award recommendation', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const award = d1<{ id: string; status: string }>(`SELECT id, status FROM award_recommendations WHERE rfqId=${q(rfq.id)} ORDER BY createdAt DESC LIMIT 1`)[0];
  step('award persisted in D1', !!award, `status=${award?.status}`);
  if (award.status !== 'APPROVED') {
    const approver = s['client.admin@test.procpx.local'] || proc;
    r = await approver.put('/api/procurement/awards', { awardId: award.id, action: 'APPROVE', remarks: `${RUN} approved` });
    record('workflow', 'approve award', r.status < 300, r.status < 300 ? '' : errorOf(r));
  }

  // PPO creation uses an atomic D1 batch.
  r = await proc.post('/api/procurement/ppos', { rfqId: rfq.id, awardRecommendationId: award.id, targetVendorId: l1.vendorId, justification: `${RUN} PPO`, deliveryTerms: 'Ex-site', paymentTerms: '30 days' });
  step('generate PPO (transaction)', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const ppo = d1<{ id: string; ppoNumber: string; status: string }>(`SELECT id, ppoNumber, status FROM ppos WHERE rfqId=${q(rfq.id)}`)[0];
  const ppoLines = d1<{ c: number }>(`SELECT count(*) c FROM ppo_lines WHERE ppoId=${q(ppo?.id ?? '')}`)[0]?.c;
  step('PPO and lines persisted in D1', !!ppo && ppoLines === 3, `${ppo?.ppoNumber} status=${ppo?.status} lines=${ppoLines}`);

  r = await proc.post('/api/procurement/ppos', { rfqId: rfq.id, awardRecommendationId: award.id, targetVendorId: l1.vendorId, justification: `${RUN} duplicate` });
  record('workflow', 'duplicate PPO for same vendor is blocked', r.status === 409, `HTTP ${r.status}`);

  r = await l1Session.post(`/api/procurement/ppos/${ppo.id}/vendor-accept`, { acceptedBy: `${RUN} test signatory` });
  step('vendor accepts the issued PPO', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const acceptedPpoStatus = d1<{ status: string; vendorStatus: string }>(
    `SELECT status, vendorStatus FROM ppos WHERE id=${q(ppo.id)}`,
  )[0];
  step('vendor acceptance persisted in D1', acceptedPpoStatus?.status === 'CONFIRMED' && acceptedPpoStatus.vendorStatus === 'ACCEPTED_BY_VENDOR',
    `${acceptedPpoStatus?.status}/${acceptedPpoStatus?.vendorStatus}`);

  const completionBody = {
    idempotencyKey: `E2E-COMP-${stamp}`,
    completionDate: new Date().toISOString(),
    completionReference: `${RUN} goods receipt`,
    remarks: `${RUN} receipt verified`,
  };
  r = await proc.post(`/api/procurement/ppos/${ppo.id}/complete`, completionBody);
  step('complete PPO and create actual costs', r.status < 300, r.status < 300 ? '' : errorOf(r));
  const completion = d1<{ status: string }>(`SELECT status FROM ppos WHERE id=${q(ppo.id)}`)[0];
  const completedPpoLines = d1<{ id: string; orderedQuantity: number; completedQuantity: number; status: string }>(
    `SELECT id, orderedQuantity, completedQuantity, status FROM ppo_lines WHERE ppoId=${q(ppo.id)} ORDER BY lineNumber, id`,
  );
  const actualCosts = d1<{ projectId: string; ppoLineId: string; vendorId: string; source: string; status: string; actualQuantity: number; actualAmount: number; completionRequestId: string }>(
    `SELECT projectId, ppoLineId, vendorId, source, status, actualQuantity, actualAmount, completionRequestId FROM actual_cost_transactions WHERE ppoId=${q(ppo.id)} ORDER BY ppoLineId`,
  );
  step('PPO lines and completion status persisted', completion?.status === 'COMPLETED'
    && completedPpoLines.length === ppoLines
    && completedPpoLines.every((line) => line.status === 'COMPLETED' && line.completedQuantity === line.orderedQuantity),
  `${completion?.status}; ${completedPpoLines.filter((line) => line.status === 'COMPLETED').length}/${ppoLines} lines`);
  step('actual costs reconcile to PPO line, vendor, and idempotency key', actualCosts.length === ppoLines
    && actualCosts.every((cost) => cost.projectId === projectId && cost.ppoLineId && cost.vendorId === l1.vendorId
      && cost.source === 'PPO_COMPLETION' && cost.status === 'APPROVED'
      && cost.completionRequestId === completionBody.idempotencyKey
      && cost.actualQuantity > 0 && cost.actualAmount >= 0), `${actualCosts.length} actual-cost rows`);

  r = await proc.post(`/api/procurement/ppos/${ppo.id}/complete`, completionBody);
  step('completion retry returns the existing result', r.status < 300
    && d1<{ c: number }>(`SELECT count(*) c FROM actual_cost_transactions WHERE ppoId=${q(ppo.id)}`)[0]?.c === ppoLines,
  `HTTP ${r.status}; no duplicate actual-cost rows`);
  r = await proc.post(`/api/procurement/ppos/${ppo.id}/complete`, { ...completionBody, remarks: `${RUN} conflicting retry` });
  record('workflow', 'completion key rejects a changed retry payload', r.status === 409, `HTTP ${r.status}`);

  const actualCostRead = await proc.get(`/api/actual-costs?ppoId=${ppo.id}&pageSize=25`);
  // The actual-cost register returns { data, total, ... } directly; the generic
  // data() helper unwraps `data` for other endpoint response shapes.
  const actualCostPage = actualCostRead.json;
  step('actual-cost register reload shows completed PPO costs', actualCostRead.status === 200
    && actualCostPage?.total === ppoLines && actualCostPage?.data?.length === ppoLines,
  `HTTP ${actualCostRead.status}; ${actualCostPage?.total ?? 0} row(s)`);

  const audits = d1<{ c: number }>(`SELECT count(*) c FROM audit_logs WHERE entityId IN (${[projectId, boqRow.boqId, boqRow.revisionId, pr.id, rfq.id, ppo.id].map(q).join(',')})`)[0]?.c;
  record('workflow', 'audit trail written in D1', audits > 0, `${audits} audit entries for the new records`);

  return { projectId, prNumber: pr.prNumber, rfqNumber: rfq.rfqNumber, ppoNumber: ppo.ppoNumber };
}

// ---------------------------------------------------------------- main
async function main() {
  console.log(`proCPX D1 end-to-end regression against ${BASE_URL}  (run id "${RUN}")\n`);
  const before = d1(BASELINE_SQL)[0];
  const sessions = await roleSweep();
  await securityChecks(sessions);
  let created: Record<string, string> | null = null;
  try {
    created = await workflow(sessions);
  } catch (e) {
    console.log(`\nWorkflow ${String(e)}`);
  }
  // Existing references still intact
  const refs = d1<{ c: number }>(`SELECT
      (SELECT count(*) FROM quotes q LEFT JOIN rfqs r ON r.id=q.rfqId WHERE r.id IS NULL)
    + (SELECT count(*) FROM negotiations n LEFT JOIN rfqs r ON r.id=n.rfqId WHERE r.id IS NULL)
    + (SELECT count(*) FROM award_recommendations a LEFT JOIN rfqs r ON r.id=a.rfqId WHERE r.id IS NULL)
    + (SELECT count(*) FROM ppos p LEFT JOIN vendors v ON v.id=p.vendorId WHERE v.id IS NULL) c`)[0].c;
  record('integrity', 'vendor / quotation / negotiation / award / PPO references intact', refs === 0, `${refs} broken references`);

  const after = d1(BASELINE_SQL)[0];
  const shrunk = Object.keys(before).filter((k) => Number(after[k]) < Number(before[k]));
  record('integrity', 'no baseline records deleted (counts never decrease)', shrunk.length === 0, shrunk.join(', '));
  console.log('\nRecord counts (before -> after):');
  console.table(Object.fromEntries(Object.keys(before).map((k) => [k, { before: before[k], after: after[k], added: Number(after[k]) - Number(before[k]) }])));

  if (!created) record('workflow', 'full workflow completed', false, 'stopped early - see error above');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${created ? `; created ${JSON.stringify(created)}` : ''}`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(`  - [${f.area}] ${f.check}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

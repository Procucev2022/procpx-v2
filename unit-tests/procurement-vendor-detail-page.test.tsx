/** @jest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VendorProfilePage from '../src/app/(app)/procurement/vendors/[id]/page';

const mockReplace = jest.fn();
const mockToast = { success: jest.fn(), error: jest.fn() };
const mockSearchParams = jest.fn(() => new URLSearchParams());
const mockSourcingDashboard = jest.fn(({ vendorName }: { vendorName: string }) => <div>Orders for {vendorName}</div>);

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    <a href={href} {...props}>{children}</a>,
}));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'vendor-1' }),
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  useSearchParams: () => mockSearchParams(),
}));
jest.mock('../src/components/VendorSourcingDashboard', () => ({
  __esModule: true,
  default: (props: { vendorName: string }) => mockSourcingDashboard(props),
}));
jest.mock('../src/components/ui/BoqDescriptionCell', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => mockToast }));

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
const rating = (id: string, status: string): any => ({
  id,
  status,
  overallScore: 4.4,
  qualityScore: 5,
  deliveryScore: 4,
  commercialComplianceScore: 4,
  responsivenessScore: 5,
  documentationClosureScore: 4,
  qualityComments: 'Quality confirmed',
  deliveryComments: 'Delivered on time',
  commercialComments: 'Rates matched',
  documentationComments: 'Documents complete',
  responsivenessComments: 'Responsive team',
  overallImprovement: 'Continue the same controls',
  comments: 'Assessment note',
  ratedByName: 'Morgan Buyer',
  ratedAt: '2026-01-10T12:00:00.000Z',
  approverComments: 'Approved after review',
  approvedAt: '2026-01-12T12:00:00.000Z',
  approvedByName: 'Casey Approver',
  decisionHistory: [{ action: 'SUBMITTED', performedByName: 'Morgan Buyer', timestamp: '2026-01-10T12:00:00.000Z', comments: 'Ready for review' }],
  ppo: {
    id: `ppo-${id}`,
    ppoNumber: `PPO-${id}`,
    title: `Order ${id}`,
    totalValue: 250000,
    project: { name: 'Central Project' },
    costCentre: { name: 'Electrical' },
  },
});

const fullVendor = () => ({
  id: 'vendor-1',
  code: 'VND-001',
  name: 'Apex Infrastructure',
  vendorType: 'CLIENT_VENDOR',
  onboardingStatus: 'ONBOARDED',
  qualificationStatus: 'QUALIFIED',
  qualificationScore: 88,
  qualificationDecision: 'RECOMMENDED',
  performanceScore: 4.4,
  contactPerson: 'Asha Rao',
  email: 'asha@example.test',
  phone: '+91 98765 43210',
  categories: 'Electrical, Civil',
  operatingLocation: 'Pune, Maharashtra',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  legalStructure: 'Private Limited',
  gstin: '27ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  website: 'https://apex.example.test',
  address: '12 Market Road, Pune',
  experienceYears: 12,
  turnoverCrores: 24.5,
  capabilities: 'Electrical installation and commissioning',
  serviceCoverage: 'West India',
  clientReferences: 'Metro Rail, North Plant',
  certifications: 'ISO 9001, ISO 14001',
  documents: '[]',
  status: 'ACTIVE',
  createdAt: '2025-05-01T00:00:00.000Z',
  evaluations: [{
    businessProfileScore: 81,
    financialStrengthScore: 82,
    previousClientsScore: 83,
    referencesScore: 84,
    technicalCapabilityScore: 85,
    complianceRiskScore: 86,
    status: 'QUALIFIED',
    qualificationOutcome: 'RECOMMENDED',
    decisionRemarks: 'Strong profile',
  }],
  ppoRatings: ['DRAFT', 'SUBMITTED', 'RETURNED_FOR_CORRECTION', 'APPROVED', 'REJECTED'].map((status, index) => rating(`r${index + 1}`, status)),
  ppos: [],
});

let mockFetch: jest.Mock;
let originalFetch: typeof fetch;
let vendorRecord: any;
let currentRole: string;
let authBody: any;
let authOk: boolean;
let authThrows: boolean;
let profileBody: any;
let profileOk: boolean;
let aiBody: any;
let aiOk: boolean;
let evaluationOk: boolean;
let ratingOk: boolean;
let decisionOk: boolean;
let updateOk: boolean;

function setupFetch() {
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/me') {
      if (authThrows) throw new Error('Auth unavailable');
      return reply(authBody, authOk);
    }
    if (url === '/api/procurement/vendors/vendor-1/evaluate-ai') return reply(aiBody, aiOk);
    if (url === '/api/procurement/vendors/vendor-1/evaluation') return reply(evaluationOk ? {} : { error: 'Evaluation could not be saved' }, evaluationOk);
    if (url === '/api/procurement/vendors/vendor-1/ppo-ratings') return reply(ratingOk ? {} : { error: 'Rating could not be saved' }, ratingOk);
    if (url === '/api/approvals/vendor-ratings') return reply(decisionOk ? {} : { error: 'Decision could not be saved' }, decisionOk);
    if (url === '/api/procurement/vendors/vendor-1' && init?.method === 'PUT') return reply(updateOk ? {} : { error: 'Update failed' }, updateOk);
    if (url === '/api/procurement/vendors/vendor-1') return reply(profileBody, profileOk);
    return reply({});
  });
  global.fetch = mockFetch as typeof fetch;
}

function renderProfile(tab = '') {
  mockSearchParams.mockReturnValue(new URLSearchParams(tab ? `tab=${tab}` : ''));
  return render(<VendorProfilePage />);
}

describe('procurement vendor profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    mockFetch = jest.fn();
    vendorRecord = fullVendor();
    currentRole = 'CATEGORY_MANAGER';
    authBody = { user: { role: currentRole } };
    authOk = true;
    authThrows = false;
    profileBody = {
      vendor: vendorRecord,
      performanceSummary: {
        ppoRatingsCount: 5,
        averagePpoRating: 4.4,
        avgQuality: 4.6,
        avgDelivery: 4.2,
        avgCommercial: 4.1,
        avgResponsiveness: 4.7,
        avgDocumentation: 4.3,
        mostRecentRating: rating('recent', 'APPROVED'),
      },
      eligiblePposToRate: [{ id: 'eligible-1', ppoNumber: 'PPO-ELIGIBLE', title: 'Completed generator order', totalValue: 150000 }],
      auditLogs: [{ id: 'audit-1', action: 'PROFILE_UPDATED', description: 'Vendor profile reviewed', createdAt: '2026-01-11T12:00:00.000Z', user: { name: 'Taylor Admin', role: 'CATEGORY_MANAGER' } }],
    };
    profileOk = true;
    aiBody = {
      report: {
        overallWeightedScore: 86,
        qualificationOutcome: 'CONDITIONAL',
        strengths: ['Experienced local delivery team'],
        verificationGaps: ['Latest statutory return pending'],
        criticalRiskFlags: ['One certificate needs verification'],
        criteria: {
          businessProfile: { suggestedScore: 91, rationale: 'Twelve years delivering comparable work' },
          financialStrength: { score: 80, rationale: 'Audited turnover supports the package' },
          previousClients: {},
          references: { suggestedScore: 82, rationale: 'Two references verified' },
          technicalCapability: { score: 89, rationale: 'Qualified commissioning staff' },
          complianceRisk: { suggestedScore: 84, rationale: 'No material compliance exceptions' },
        },
      },
    };
    aiOk = true;
    evaluationOk = true;
    ratingOk = true;
    decisionOk = true;
    updateOk = true;
    setupFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('renders vendor identity, switches tabs, and shows audit events and sourcing orders', async () => {
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Apex Infrastructure' })).toBeInTheDocument();
    expect(screen.getAllByText('VND-001')).toHaveLength(2);
    expect(screen.getByText('Legal Identity')).toBeInTheDocument();
    expect(screen.getByText('12 Market Road, Pune')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Documents & Audit/ }));
    expect(await screen.findByText('Statutory Documents & Certifications')).toBeInTheDocument();
    expect(screen.getByText('27ABCDE1234F1Z5')).toBeInTheDocument();
    expect(screen.getByText('PROFILE UPDATED')).toBeInTheDocument();
    expect(screen.getByText('Taylor Admin (CATEGORY_MANAGER)')).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/procurement/vendors/vendor-1?tab=documents', { scroll: false });

    fireEvent.click(screen.getByRole('button', { name: 'Sourcing & Orders (Preview)' }));
    expect(screen.getByText('Orders for Apex Infrastructure')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PPO Performance/ }));
    expect(screen.getByText('Aggregated Performance Scorecard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByText('Business Profile')).toBeInTheDocument();
  });

  it('shows error and empty states when the profile cannot be loaded', async () => {
    profileOk = false;
    profileBody = { error: 'Vendor access denied' };
    setupFetch();
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Unable to load vendor profile' })).toBeInTheDocument();
    expect(screen.getByText('Vendor access denied')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Vendor Directory' })).toHaveAttribute('href', '/procurement/vendors');

    cleanup();
    profileOk = true;
    profileBody = { vendor: null };
    setupFetch();
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Unable to load vendor profile' })).toBeInTheDocument();
    expect(screen.getByText('Vendor record not found or access denied.')).toBeInTheDocument();
  });

  it('runs AI evaluation, applies the returned rubric and commits a qualification decision', async () => {
    renderProfile('evaluation-ai');
    expect(await screen.findByText('Standard 6-Rubric Vendor Evaluation Framework')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI-Assisted Evaluation' }));
    expect(await screen.findByText(/AI evaluation completed. Suggested Score: 86%/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors/vendor-1/evaluate-ai', { method: 'POST' });

    screen.getAllByRole('spinbutton').forEach((input, index) => {
      fireEvent.change(input, { target: { value: String(80 + index) } });
    });
    const outcomeLabel = screen.getByText('Evaluation Outcome Classification');
    fireEvent.change(outcomeLabel.parentElement!.querySelector('select')!, { target: { value: 'NOT_RECOMMENDED' } });

    fireEvent.change(screen.getByPlaceholderText('Enter formal justification, verification notes, or conditional stipulations...'), { target: { value: 'Conditional due to final compliance check' } });
    const qualificationLabel = screen.getByText('Formal Qualification Status *');
    fireEvent.change(qualificationLabel.parentElement!.querySelector('select')!, { target: { value: 'CONDITIONALLY_QUALIFIED' } });
    fireEvent.click(screen.getByRole('button', { name: /Commit Qualification Decision/ }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors/vendor-1/evaluation', expect.objectContaining({ method: 'POST' })));
    const evaluationCall = mockFetch.mock.calls.find(([url, init]) => String(url).endsWith('/evaluation') && init?.method === 'POST');
    expect(JSON.parse(evaluationCall[1].body as string)).toMatchObject({
      qualificationStatus: 'CONDITIONALLY_QUALIFIED',
      qualificationDecision: 'NOT_RECOMMENDED',
      decisionRemarks: 'Conditional due to final compliance check',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Vendor details submitted successfully.', 'VND-001', 'CONDITIONALLY_QUALIFIED');
  });

  it('handles AI and qualification submission errors', async () => {
    aiOk = false;
    aiBody = { error: 'Evaluation service unavailable' };
    evaluationOk = false;
    setupFetch();
    renderProfile('evaluation');
    expect(await screen.findByText('Category Manager Qualification Decision & Governance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI-Assisted Evaluation' }));
    expect(await screen.findByText('Error: Evaluation service unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Commit Qualification Decision/ }));
    expect(await screen.findByText('Error: Evaluation could not be saved')).toBeInTheDocument();
  });

  it('accepts alternate AI response shapes, fallback evidence, and all rubric thresholds', async () => {
    aiBody = {
      aiEvaluation: {
        overallWeightedScore: 76,
        qualificationOutcome: 'RECOMMENDED',
        strengths: ['Strong balance sheet'],
        missingEvidenceGaps: ['Provide a current insurance certificate'],
        riskFactors: ['Insurance expiry is near'],
        rubricScores: {
          businessProfile: { score: 48, evidenceCitation: 'Incorporation records' },
          financialStrength: { score: 55, evidenceCitation: 'Audited accounts' },
          previousClients: {},
          references: { suggestedScore: 0, evidenceCitation: 'Client reference check' },
          technicalCapability: { score: 82, evidenceCitation: 'Technician certificates' },
          complianceRisk: { suggestedScore: null, score: 32, evidenceCitation: 'Insurance schedule' },
        },
      },
    };
    setupFetch();
    renderProfile('evaluation');
    expect(await screen.findByText('Standard 6-Rubric Vendor Evaluation Framework')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI-Assisted Evaluation' }));
    expect(await screen.findByText('Strong balance sheet')).toBeInTheDocument();
    expect(screen.getByText('Provide a current insurance certificate')).toBeInTheDocument();
    expect(screen.getByText('Insurance expiry is near')).toBeInTheDocument();
    expect(screen.getAllByText('Source: AI Verification Evidence')).toHaveLength(5);

    const rubricScores = [0, 40, 54, 68, 80, 90];
    screen.getAllByRole('spinbutton').forEach((input, index) => {
      fireEvent.change(input, { target: { value: String(rubricScores[index]) } });
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter formal justification/), { target: { value: '' } });
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByText('Review Required').length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: /Commit Qualification Decision/ }));
    const evaluationCall = mockFetch.mock.calls.find(([url, init]) => String(url).endsWith('/evaluation') && init?.method === 'POST');
    expect(JSON.parse(evaluationCall[1].body as string)).toMatchObject({
      qualificationDecision: 'RECOMMENDED',
      decisionRemarks: 'Reviewed and recorded by Category Manager (54%)',
    });

    aiBody = { data: { aiEvaluation: { overallWeightedScore: 0 } } };
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI Evaluation' }));
    expect(await screen.findByText(/AI evaluation completed. Suggested Score: 0% \(REVIEW\)/)).toBeInTheDocument();

    aiBody = {
      report: {
        criteria: {
          businessProfile: { rationale: 'Profile rationale evidence' },
          financialStrength: { rationale: 'Financial rationale evidence' },
          previousClients: { rationale: 'Client rationale evidence' },
          references: { rationale: 'Reference rationale evidence' },
          technicalCapability: { rationale: 'Capability rationale evidence' },
          complianceRisk: { rationale: 'Compliance rationale evidence' },
        },
      },
    };
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI-Assisted Evaluation' }));
    expect(await screen.findByText('Profile rationale evidence')).toBeInTheDocument();
    expect(screen.getByText('Compliance rationale evidence')).toBeInTheDocument();

    aiBody = {
      report: {
        criteria: {
          businessProfile: { evidenceFound: ['Incorporation evidence'] },
          financialStrength: { evidenceFound: ['Audited evidence'] },
          previousClients: { evidenceFound: ['Project evidence'] },
          references: { evidenceFound: ['Reference evidence'] },
          technicalCapability: { evidenceFound: ['Capability evidence'] },
          complianceRisk: { evidenceFound: ['Registry evidence'] },
        },
      },
    };
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI-Assisted Evaluation' }));
    expect(await screen.findByText('Incorporation evidence')).toBeInTheDocument();
    expect(screen.getByText('Registry evidence')).toBeInTheDocument();
  });

  it('saves PPO rating drafts, validates submission comments, and submits a completed assessment', async () => {
    renderProfile('performance');
    expect(await screen.findByText('Aggregated Performance Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Rate Completed Order/ }));
    expect(screen.getByText('Rate Completed Purchase Order Performance')).toBeInTheDocument();
    const rateHeader = screen.getByText('Rate Completed Purchase Order Performance').parentElement!.parentElement!;
    fireEvent.click(within(rateHeader).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /Rate Completed Order/ }));
    const ppoSelect = screen.getByText(/Select Completed Purchase Order/).parentElement!.querySelector('select')!;
    fireEvent.change(ppoSelect, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(screen.getByText('Please select a completed PPO to evaluate.')).toBeInTheDocument();
    fireEvent.change(ppoSelect, { target: { value: 'eligible-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/procurement/vendors/vendor-1/ppo-ratings', expect.objectContaining({ method: 'POST' })));
    const draftCall = mockFetch.mock.calls.find(([url, init]) => String(url).endsWith('/ppo-ratings') && init?.method === 'POST');
    expect(JSON.parse(draftCall[1].body as string)).toMatchObject({ ppoId: 'eligible-1', action: 'SAVE_DRAFT' });

    fireEvent.click(screen.getByRole('button', { name: /Rate Completed Order/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Project Approval' }));
    expect(await screen.findByText(/Please provide specific comments for each of the 5 assessment areas/)).toBeInTheDocument();

    const fields = [
      ['Comments on workmanship, material quality, specifications compliance and defects observed...', 'Quality observed'],
      ['Comments on delivery timelines, schedule adherence, milestone tracking and delays...', 'Delivery observed'],
      ['Comments on agreed rates adherence, cost control, billing accuracy and commercial compliance...', 'Commercial observed'],
      ['Comments on tax invoices, statutory documents, test certificates, warranty certificates and handover records...', 'Documentation observed'],
      ['Comments on communication turnaround, issue resolution, escalation handling and site coordination...', 'Responsiveness observed'],
      ['Describe key improvement areas, expected corrective actions from vendor, and recommendations for future capex projects...', 'Continue monthly reviews'],
    ];
    fields.forEach(([placeholder, value]) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } }));
    ratingOk = false;
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Project Approval' }));
    expect(await screen.findByText('Error: Rating could not be saved')).toBeInTheDocument();
    ratingOk = true;
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Project Approval' }));
    await waitFor(() => expect(mockFetch.mock.calls.filter(([url, init]) => String(url).endsWith('/ppo-ratings') && init?.method === 'POST')).toHaveLength(3));
    const submitCall = mockFetch.mock.calls.filter(([url, init]) => String(url).endsWith('/ppo-ratings') && init?.method === 'POST').at(-1);
    expect(JSON.parse(submitCall[1].body as string)).toMatchObject({ action: 'SUBMIT', qualityComments: 'Quality observed', overallImprovement: 'Continue monthly reviews' });
    expect(mockToast.success).toHaveBeenCalledWith('Performance assessment submitted for Project Approval.', 'VND-001');
  });

  it('defaults unsupported tab queries to overview and tolerates an auth lookup failure', async () => {
    authThrows = true;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile('unsupported-tab');
    expect(await screen.findByRole('heading', { name: 'Apex Infrastructure' })).toBeInTheDocument();
    expect(screen.getByText('Legal Identity')).toBeInTheDocument();
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to get auth role', expect.any(Error)));
  });

  it('edits existing draft and returned performance assessments with parsed and fallback details', async () => {
    vendorRecord.ppoRatings[0].criteriaDetails = JSON.stringify({ qualityComments: 'Stored as JSON', supportingEvidence: 'inspection.pdf' });
    vendorRecord.ppoRatings[0].qualityComments = '';
    vendorRecord.ppoRatings[2].criteriaDetails = { deliveryComments: 'Object detail', overallImprovement: 'Review packing' };
    vendorRecord.ppoRatings[2].deliveryComments = '';
    const malformed = rating('r6', 'DRAFT');
    malformed.criteriaDetails = 'not-json';
    vendorRecord.ppoRatings.push(malformed);
    setupFetch();
    renderProfile('performance');
    expect(await screen.findByText('Aggregated Performance Scorecard')).toBeInTheDocument();

    const draftRow = screen.getByText('PPO-r1').closest('tr')!;
    fireEvent.click(within(draftRow).getByRole('button', { name: 'Edit / Resubmit' }));
    expect(screen.getByText('Edit & Resubmit Performance Assessment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/workmanship, material quality, specifications compliance/)).toHaveValue('Stored as JSON');
    const scoreLabels = [
      /Quality of Goods \/ Work \(30%\)/,
      /Delivery & Time \(25%\)/,
      /Cost & Commercial \(20%\)/,
      /Responsiveness & Coordination \(15%\)/,
      /Documentation & Closure \(10%\)/,
    ];
    scoreLabels.forEach((label, index) => {
      const labelNode = screen.getByText(label);
      fireEvent.change(labelNode.parentElement!.querySelector('select')!, { target: { value: String(index + 1) } });
    });
    fireEvent.change(screen.getByPlaceholderText(/workmanship, material quality, specifications compliance/), { target: { value: 'Edited quality note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([url, init]) => String(url).endsWith('/ppo-ratings') && init?.method === 'POST')).toBe(true));
    const editDraftCall = mockFetch.mock.calls.filter(([url, init]) => String(url).endsWith('/ppo-ratings') && init?.method === 'POST').at(-1);
    expect(JSON.parse(editDraftCall[1].body as string)).toMatchObject({ ratingId: 'r1', ppoId: 'ppo-r1', action: 'SAVE_DRAFT', qualityScore: 1 });

    const returnedRow = screen.getByText('PPO-r3').closest('tr')!;
    fireEvent.click(within(returnedRow).getByRole('button', { name: 'Edit / Resubmit' }));
    expect(screen.getByText('Returned for Correction by Project Approver')).toBeInTheDocument();
    expect(screen.getByText(/Approved after review/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/delivery timelines, schedule adherence/)).toHaveValue('Object detail');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const malformedRow = screen.getByText('PPO-r6').closest('tr')!;
    fireEvent.click(within(malformedRow).getByRole('button', { name: 'Edit / Resubmit' }));
    expect(screen.getByPlaceholderText(/delivery timelines, schedule adherence/)).toHaveValue('Delivered on time');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const detailRow = screen.getByText('PPO-r1').closest('tr')!;
    fireEvent.click(within(detailRow).getByRole('button', { name: 'View Assessment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Assessment' }));
    expect(screen.getByText('Edit & Resubmit Performance Assessment')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('supports approver return validation, acceptance confirmation, and decision errors', async () => {
    currentRole = 'PROJECT_APPROVER';
    authBody = { user: { role: currentRole } };
    setupFetch();
    renderProfile('performance');
    expect(await screen.findByText('Aggregated Performance Scorecard')).toBeInTheDocument();
    const row = screen.getByText('PPO-r2').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Review & Decide' }));
    expect(screen.getByText('PPO Performance Assessment Detail')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject / Return for Correction' }));
    expect(screen.getByText('Please provide review comments explaining the reason for return/rejection.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Record reason for accepting the assessment/), { target: { value: 'Please attach the signed test report.' } });
    decisionOk = false;
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rating' }));
    expect(screen.getByRole('heading', { name: 'Confirm Vendor Rating Acceptance' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Acceptance' }));
    expect(await screen.findByText('Decision could not be saved')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/approvals/vendor-ratings', expect.objectContaining({ method: 'POST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    decisionOk = true;
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rating' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Acceptance' }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Performance assessment accepted and published successfully.', 'PPO-r2'));

    const returnedRow = screen.getByText('PPO-r2').closest('tr')!;
    fireEvent.click(within(returnedRow).getByRole('button', { name: 'Review & Decide' }));
    fireEvent.change(screen.getByPlaceholderText(/Record reason for accepting the assessment/), { target: { value: 'Please provide the missing supporting document.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject / Return for Correction' }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Performance assessment returned for correction.', 'PPO-r2'));
  });

  it('edits vendor details and reports failed updates', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Apex Infrastructure' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(screen.getByRole('heading', { name: 'Edit Vendor Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Apex Infrastructure & Contracting Pvt Ltd'), { target: { value: 'Apex Infra Updated' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Sharma'), { target: { value: 'Morgan Lee' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. contact@apexinfra.com'), { target: { value: 'morgan@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. +91 98765 43210'), { target: { value: '+91 90000 11111' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Civil & Interior, Structural Steel'), { target: { value: 'Electrical' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Hyderabad, Telangana'), { target: { value: 'Hyderabad' } });
    const modalCombos = screen.getAllByRole('combobox');
    fireEvent.change(modalCombos[0], { target: { value: 'PROCUCEV_VENDOR' } });
    fireEvent.change(modalCombos[1], { target: { value: 'Pan-India' } });
    fireEvent.change(modalCombos[2], { target: { value: 'LLP' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 36AABCA1234F1Z5'), { target: { value: 'abcde' } });
    expect(screen.getByPlaceholderText('e.g. 36AABCA1234F1Z5')).toHaveValue('ABCDE');
    fireEvent.change(screen.getByPlaceholderText('e.g. AABCA1234F'), { target: { value: 'zyxwv9876p' } });
    fireEvent.change(screen.getByPlaceholderText('https://company.com'), { target: { value: 'https://updated.example.test' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 10'), { target: { value: '16' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 25.5'), { target: { value: '31.5' } });
    fireEvent.change(screen.getByPlaceholderText('Complete registered corporate office address with PIN code'), { target: { value: '99 Harbor Road, Pune' } });
    fireEvent.change(screen.getByPlaceholderText(/General civil contracting, interior fitouts/), { target: { value: 'Power systems' } });

    updateOk = false;
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error updating profile: Update failed'));
    updateOk = true;
    setupFetch();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Vendor details submitted successfully.', 'VND-001'));
    const updateCall = mockFetch.mock.calls.find(([url, init]) => String(url).endsWith('/vendor-1') && init?.method === 'PUT');
    expect(JSON.parse(updateCall[1].body as string)).toMatchObject({ name: 'Apex Infra Updated', gstin: 'ABCDE', vendorType: 'PROCUCEV_VENDOR', serviceCoverage: 'Pan-India', legalStructure: 'LLP', capabilities: 'Power systems' });
  });

  it('shows fallbacks for incomplete vendor data, empty audit history, and query aliases', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('tab=audit'));
    vendorRecord = {
      ...fullVendor(), vendorType: 'PROCUCEV_VENDOR', onboardingStatus: 'DRAFT', qualificationStatus: '',
      legalStructure: '', contactPerson: '', email: '', phone: '', operatingLocation: '', address: '', categories: '',
      serviceCoverage: '', experienceYears: 0, turnoverCrores: 0, capabilities: '', clientReferences: '', gstin: '', pan: '', certifications: '',
      qualificationScore: null, evaluations: [], ppoRatings: [],
    };
    profileBody = { data: { vendor: vendorRecord, performanceSummary: null, eligiblePposToRate: [], auditLogs: [] } };
    setupFetch();
    render(<VendorProfilePage />);
    expect(await screen.findByText('Statutory Documents & Certifications')).toBeInTheDocument();
    expect(screen.getAllByText('Not Provided')).toHaveLength(3);
    expect(screen.getByText('No audit trail records found.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(4);
    expect(screen.getByText('No customer references declared on file.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PPO Performance/ }));
    expect(screen.getByText('No PPO Performance Ratings Recorded')).toBeInTheDocument();
    expect(screen.getByText('No orders rated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(screen.getByPlaceholderText('e.g. contact@apexinfra.com')).toHaveValue('');
    fireEvent.click(document.querySelector('.app-content-modal-backdrop')!);
    fireEvent.click(screen.getByRole('button', { name: 'Evaluation & AI' }));
    expect(screen.getByText('Category Manager Qualification Decision & Governance')).toBeInTheDocument();

    cleanup();
    vendorRecord.qualificationStatus = 'CONDITIONALLY_QUALIFIED';
    vendorRecord.qualificationScore = 70;
    vendorRecord.ppoRatings = [];
    profileBody = { vendor: vendorRecord, performanceSummary: null, eligiblePposToRate: [{ id: 'available-1', ppoNumber: 'PPO-READY' }], auditLogs: [] };
    setupFetch();
    renderProfile('ppo-performance');
    expect(await screen.findAllByText('CONDITIONALLY QUALIFIED')).toHaveLength(2);
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rate Completed Order/ })).toBeInTheDocument();

    cleanup();
    const sparseEdit = rating('sparse-edit', 'DRAFT');
    sparseEdit.ppoId = undefined;
    sparseEdit.ppo = { ppoNumber: 'PPO-SPARSE', title: 'Sparse record' };
    sparseEdit.qualityScore = 0;
    sparseEdit.deliveryScore = 0;
    sparseEdit.commercialComplianceScore = 0;
    sparseEdit.responsivenessScore = 0;
    sparseEdit.documentationClosureScore = 0;
    sparseEdit.qualityComments = '';
    sparseEdit.deliveryComments = '';
    sparseEdit.commercialComments = '';
    sparseEdit.documentationComments = '';
    sparseEdit.responsivenessComments = '';
    sparseEdit.overallImprovement = '';
    sparseEdit.comments = '';
    sparseEdit.criteriaDetailsParsed = { qualityComments: 'Parsed quality', deliveryComments: 'Parsed delivery' };
    vendorRecord.ppoRatings = [sparseEdit];
    profileBody = { vendor: vendorRecord, performanceSummary: null, eligiblePposToRate: [], auditLogs: [] };
    currentRole = 'CATEGORY_MANAGER';
    authBody = { data: { user: { role: currentRole } } };
    setupFetch();
    renderProfile('performance');
    expect(await screen.findByText('Aggregated Performance Scorecard')).toBeInTheDocument();
    const sparseEditRow = screen.getByText('PPO-SPARSE').closest('tr')!;
    fireEvent.click(within(sparseEditRow).getByRole('button', { name: 'Edit / Resubmit' }));
    expect(screen.getByPlaceholderText(/workmanship, material quality, specifications compliance/)).toHaveValue('Parsed quality');
    expect(screen.getByPlaceholderText(/delivery timelines, schedule adherence/)).toHaveValue('Parsed delivery');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    cleanup();
    currentRole = 'PROCUREMENT_USER';
    vendorRecord.qualificationStatus = 'NOT_QUALIFIED';
    vendorRecord.qualificationScore = 40;
    vendorRecord.ppoRatings = [{ ...rating('sparse', 'APPROVED'), overallScore: 2.2, qualityComments: '', deliveryComments: '', commercialComments: '', documentationComments: '', responsivenessComments: '', overallImprovement: '', comments: '', decisionHistory: [], ppo: undefined }];
    profileBody = { data: { vendor: vendorRecord, performanceSummary: null, eligiblePposToRate: [{ id: 'available-1', ppoNumber: 'PPO-READY' }], auditLogs: [] } };
    authBody = { user: { role: currentRole } };
    setupFetch();
    renderProfile('performance');
    expect(await screen.findAllByText('NOT QUALIFIED')).toHaveLength(2);
    expect(screen.getByText('Review Required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rate Completed Order/ })).not.toBeInTheDocument();
    const sparseRow = screen.getByText('2.2 / 5.0').closest('tr')!;
    fireEvent.click(within(sparseRow).getByRole('button', { name: 'View Assessment' }));
    expect(screen.getAllByText('General Project').length).toBeGreaterThan(1);
    expect(screen.getByText('No specific quality feedback recorded.')).toBeInTheDocument();
    expect(screen.getByText('No overall improvement remarks provided.')).toBeInTheDocument();
    expect(screen.getByText(/Approved on .* by Casey Approver/)).toBeInTheDocument();
    const detailModal = screen.getByText('PPO Performance Assessment Detail').closest<HTMLDivElement>('div.fixed')!;
    fireEvent.click(within(detailModal).getAllByRole('button')[0]);
    fireEvent.click(within(sparseRow).getByRole('button', { name: 'View Assessment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('shows empty performance summary values when the aggregates are null', async () => {
    profileBody.performanceSummary = {
      ppoRatingsCount: 0,
      averagePpoRating: null,
      avgQuality: null,
      avgDelivery: null,
      avgCommercial: null,
      avgResponsiveness: null,
      avgDocumentation: null,
      mostRecentRating: null,
    };
    setupFetch();
    renderProfile('performance');
    expect(await screen.findByText('Aggregated Performance Scorecard')).toBeInTheDocument();
    expect(screen.getByText('No orders rated')).toBeInTheDocument();
  });
});


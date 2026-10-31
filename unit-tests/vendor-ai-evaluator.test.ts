import { evaluateVendorProfile, type VendorEvaluationInput } from '../src/lib/vendor-ai-evaluator';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const strongVendor: VendorEvaluationInput = {
  id: 'vendor-1',
  code: 'V-1',
  name: 'Reliable Engineering Ltd',
  vendorType: 'CLIENT_VENDOR',
  email: 'contact@example.test',
  phone: '555-0100',
  city: 'Bengaluru',
  state: 'Karnataka',
  legalStructure: 'PRIVATE_LIMITED',
  website: 'https://vendor.example.test',
  experienceYears: 12,
  turnoverCrores: 65,
  categories: 'Electrical and Civil',
  capabilities: 'Electrical installation, commissioning, and maintenance',
  serviceCoverage: 'South India',
  clientReferences: JSON.stringify([
    { client: 'Client One', verified: true },
    { client: 'Client Two', status: 'VERIFIED' },
    { client: 'Client Three' },
  ]),
  certifications: 'ISO 9001',
  complianceStatus: 'COMPLIANT',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  documents: JSON.stringify([{ type: 'financial statement', name: 'Balance sheet' }]),
};

describe('evaluateVendorProfile', () => {
  it('recommends a well-documented, verified vendor with strong compliance', () => {
    const result = evaluateVendorProfile(strongVendor);

    expect(result.qualificationOutcome).toBe(UI_STRINGS.appAppProcurementVendorsIdPage.rECOMMENDED);
    expect(result.overallWeightedScore).toBe(97.8);
    expect(result.criteria).toHaveProperty('businessProfile');
    expect(result.criteria).toHaveProperty('financialStrength');
    expect(result.criteria).toHaveProperty('previousClients');
    expect(result.criteria).toHaveProperty('references');
    expect(result.criteria).toHaveProperty('technicalCapability');
    expect(result.criteria).toHaveProperty('complianceRisk');
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.criticalRiskFlags).toEqual([]);
    expect(Number.isNaN(Date.parse(result.evaluatedAt))).toBe(false);
  });

  it('returns a low score for a new vendor with missing profile details', () => {
    const result = evaluateVendorProfile({
      id: 'vendor-2', code: 'V-2', name: 'New Vendor', vendorType: 'CLIENT_VENDOR', email: 'new@example.test',
      experienceYears: 0, turnoverCrores: 0,
    });

    expect(result.qualificationOutcome).toBe(UI_STRINGS.appAppProcurementVendorsIdPage.nOTRECOMMENDED);
    expect(result.criteria.businessProfile.verificationGaps).toContain('Legal entity structure not specified');
    expect(result.criteria.financialStrength.verificationGaps.length).toBeGreaterThan(0);
    expect(result.weaknesses.length).toBeGreaterThan(0);
    expect(result.verificationGaps.length).toBeGreaterThan(0);
  });

  it.each([
    [12, 55],
    [6, 25],
    [3, 15],
    [1, -10],
  ])('scores business experience of %s years', (experienceYears, expectedIncrease) => {
    const result = evaluateVendorProfile({
      ...strongVendor,
      experienceYears,
      turnoverCrores: 30,
      documents: '[]',
      clientReferences: '[]',
      complianceStatus: 'PENDING',
    });

    expect(result.criteria.businessProfile.suggestedScore).toBeGreaterThanOrEqual(20);
    if (expectedIncrease === 55) expect(result.criteria.businessProfile.evidenceFound.join(' ')).toContain('12 years');
    if (expectedIncrease === 25) expect(result.criteria.businessProfile.evidenceFound.join(' ')).toContain('6 years');
    if (expectedIncrease === 15) expect(result.criteria.businessProfile.evidenceFound.join(' ')).toContain('3 years');
    if (expectedIncrease === -10) expect(result.criteria.businessProfile.verificationGaps).toContain('Limited or unstated years in operation (< 2 years)');
  });

  it.each([
    [60, 92],
    [25, 82],
    [8, 70],
    [2, 55],
    [0, 30],
  ])('evaluates declared turnover of %s crore', (turnoverCrores, expectedScore) => {
    const result = evaluateVendorProfile({
      ...strongVendor,
      turnoverCrores,
      documents: '[]',
      experienceYears: 3,
      clientReferences: '[]',
      complianceStatus: 'PENDING',
    });

    expect(result.criteria.financialStrength.suggestedScore).toBe(expectedScore);
  });

  it('handles verified, declared, absent, malformed, and empty reference data', () => {
    const declared = evaluateVendorProfile({
      ...strongVendor,
      clientReferences: JSON.stringify([{ client: 'Declared Client' }]),
    });
    const absent = evaluateVendorProfile({ ...strongVendor, clientReferences: '[]' });
    const legacyText = evaluateVendorProfile({ ...strongVendor, clientReferences: 'Legacy client name' });
    const malformed = evaluateVendorProfile({ ...strongVendor, clientReferences: '{bad json' });

    expect(declared.criteria.previousClients.suggestedScore).toBe(85);
    expect(declared.criteria.references.suggestedScore).toBe(60);
    expect(absent.criteria.previousClients.verificationGaps).toContain('No specific client project engagements declared');
    expect(absent.criteria.references.suggestedScore).toBe(30);
    expect(legacyText.criteria.previousClients.suggestedScore).toBe(85);
    expect(malformed.criteria.references.suggestedScore).toBe(60);
  });

  it('parses document evidence defensively and accepts financial document names', () => {
    expect(evaluateVendorProfile({ ...strongVendor, documents: '[{"name":"Balance statement"}]' })
      .criteria.financialStrength.evidenceFound.join(' ')).toContain('financial supporting document');
    expect(evaluateVendorProfile({ ...strongVendor, documents: '{bad json' })
      .criteria.financialStrength.verificationGaps.length).toBeGreaterThan(0);
    expect(evaluateVendorProfile({ ...strongVendor, documents: '[{}]' })
      .criteria.financialStrength.verificationGaps.length).toBeGreaterThan(0);
  });

  it('flags a blacklisted high-scoring vendor as conditional', () => {
    const result = evaluateVendorProfile({ ...strongVendor, isBlacklisted: true });

    expect(result.overallWeightedScore).toBeGreaterThanOrEqual(65);
    expect(result.qualificationOutcome).toBe(UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONAL);
    expect(result.criticalRiskFlags).toEqual(expect.arrayContaining([expect.stringContaining('BLACKLISTED')]));
  });

  it('records statutory syntax mismatches and internal non-compliance as critical risks', () => {
    const result = evaluateVendorProfile({
      ...strongVendor,
      gstin: 'invalid-gstin',
      pan: 'wrong-pan',
      complianceStatus: 'NON_COMPLIANT',
    });

    expect(result.qualificationOutcome).toBe(UI_STRINGS.appAppProcurementVendorsIdPage.cONDITIONAL);
    expect(result.contradictions).toHaveLength(2);
    expect(result.criticalRiskFlags).toEqual(expect.arrayContaining([
      'GSTIN provided does not match valid statutory syntax',
      'Vendor flagged as NON_COMPLIANT in internal records',
    ]));
  });

  it('distinguishes missing tax identifiers from malformed identifiers', () => {
    const missing = evaluateVendorProfile({ ...strongVendor, gstin: '', pan: '' });
    const invalid = evaluateVendorProfile({ ...strongVendor, gstin: '   ', pan: '   ' });

    expect(missing.criteria.complianceRisk.verificationGaps).toContain('GSTIN not yet provided');
    expect(invalid.contradictions).toHaveLength(0);
  });
});

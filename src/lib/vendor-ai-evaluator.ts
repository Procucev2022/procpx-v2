import type {
  VendorEvaluationInput,
  CriterionEvaluation,
  AiEvaluationReport,
  VendorEvaluationOptions,
  VendorEvaluationInputDataIssue,
} from "@app-types/lib/vendor-ai-evaluator.types";
export type {
  VendorEvaluationInput,
  CriterionEvaluation,
  AiEvaluationReport,
  VendorEvaluationOptions,
  VendorEvaluationInputDataIssue,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


// Indian GSTIN syntax verification: 2 digits state + 10 chars PAN + 1 entity + 'Z' + 1 checksum
function validateGstinSyntax(gstin?: string | null): { valid: boolean; reason?: string } {
  if (!gstin || gstin.trim() === '') return { valid: false, reason: 'GSTIN not provided' };
  const clean = gstin.trim().toUpperCase();
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (regex.test(clean)) return { valid: true };
  return { valid: false, reason: `GSTIN "${clean}" does not match standard 15-character alphanumeric format` };
}

// Indian PAN syntax: 5 letters + 4 digits + 1 letter
function validatePanSyntax(pan?: string | null): { valid: boolean; reason?: string } {
  if (!pan || pan.trim() === '') return { valid: false, reason: 'PAN not provided' };
  const clean = pan.trim().toUpperCase();
  const regex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (regex.test(clean)) return { valid: true };
  return { valid: false, reason: `PAN "${clean}" does not match 10-character Indian PAN syntax` };
}

export function evaluateVendorProfile(vendor: VendorEvaluationInput, options: VendorEvaluationOptions = {}): AiEvaluationReport {
  const criteria: Record<string, CriterionEvaluation> = {};
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const verificationGaps: string[] = [];
  const criticalRiskFlags: string[] = [];
  const contradictions: string[] = [];

  // Parse JSON fields safely
  let docs: Array<Record<string, unknown>> = [];
  if (vendor.documents) {
    try {
      const parsed: unknown = JSON.parse(vendor.documents);
      if (Array.isArray(parsed)) {
        docs = parsed.filter(isRecord);
        const invalidEntryCount = parsed.length - docs.length;
        if (invalidEntryCount > 0) {
          options.onInputDataIssue?.({
            fieldName: 'documents', reason: 'invalid_shape', fallback: 'filtered_invalid_entries', invalidEntryCount,
          });
        }
      }
      else options.onInputDataIssue?.({ fieldName: 'documents', reason: 'invalid_shape', fallback: 'empty_array' });
    } catch {
      options.onInputDataIssue?.({ fieldName: 'documents', reason: 'invalid_json', fallback: 'empty_array' });
    }
  }

  let references: Array<Record<string, unknown>> = [];
  if (vendor.clientReferences) {
    const trimmedReferences = vendor.clientReferences.trimStart();
    try {
      const parsed: unknown = JSON.parse(vendor.clientReferences);
      if (Array.isArray(parsed)) {
        let invalidEntryCount = 0;
        references = parsed.flatMap((reference) => {
          if (isRecord(reference)) return [reference];
          if (typeof reference === 'string' && reference.trim()) return [{ client: reference }];
          invalidEntryCount += 1;
          return [];
        });
        if (invalidEntryCount > 0) {
          options.onInputDataIssue?.({
            fieldName: 'clientReferences', reason: 'invalid_shape', fallback: 'filtered_invalid_entries', invalidEntryCount,
          });
        }
      }
      else if (typeof parsed === 'string' && parsed.trim()) {
        references = [{ client: parsed }];
        options.onInputDataIssue?.({ fieldName: 'clientReferences', reason: 'invalid_shape', fallback: 'legacy_text' });
      } else {
        options.onInputDataIssue?.({ fieldName: 'clientReferences', reason: 'invalid_shape', fallback: 'empty_array' });
      }
    } catch {
      references = [{ client: vendor.clientReferences }];
      if (trimmedReferences.startsWith('{') || trimmedReferences.startsWith('[') || trimmedReferences.startsWith('"')) {
        options.onInputDataIssue?.({ fieldName: 'clientReferences', reason: 'invalid_json', fallback: 'legacy_text' });
      }
    }
  }

  // CRITICAL RISK: Blacklist check
  if (vendor.isBlacklisted) {
    criticalRiskFlags.push('VENDOR IS CURRENTLY BLACKLISTED — Cannot qualify until sanction review');
  }

  // ---------------------------------------------------------------------------
  // 1. Business Profile and Experience (Weight: 15%)
  // ---------------------------------------------------------------------------
  {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 50;

    if (vendor.experienceYears && vendor.experienceYears >= 10) {
      score += 35;
      evidence.push(`Longstanding operational track record: ${vendor.experienceYears} years in business`);
      strengths.push(`Extensive industry vintage (${vendor.experienceYears} years)`);
    } else if (vendor.experienceYears && vendor.experienceYears >= 5) {
      score += 25;
      evidence.push(`Established industry experience: ${vendor.experienceYears} years`);
      strengths.push(`Solid industry experience (${vendor.experienceYears} years)`);
    } else if (vendor.experienceYears && vendor.experienceYears >= 2) {
      score += 15;
      evidence.push(`Moderate operating vintage: ${vendor.experienceYears} years`);
    } else {
      score -= 10;
      gaps.push('Limited or unstated years in operation (< 2 years)');
      weaknesses.push('Early-stage enterprise with limited historical operating data');
    }

    if (vendor.legalStructure) {
      evidence.push(`Registered legal structure: ${vendor.legalStructure.replace(/_/g, ' ')}`);
      score += 10;
    } else {
      gaps.push('Legal entity structure not specified');
    }

    if (vendor.city && vendor.state) {
      evidence.push(`Headquartered / Operating in: ${vendor.city}, ${vendor.state}`);
      score += 5;
    } else {
      gaps.push('Operational headquarters not fully identified');
    }

    if (vendor.website) {
      evidence.push(`Corporate website: ${vendor.website}`);
    }

    score = Math.min(100, Math.max(20, score));

    criteria.businessProfile = {
      id: 'businessProfile',
      name: 'Business Profile and Experience',
      weight: 15,
      suggestedScore: score,
      evidenceFound: evidence,
      verificationGaps: gaps,
      rationale: `${vendor.name} demonstrates ${vendor.experienceYears || 'unspecified'} years operating in ${vendor.city || 'unspecified location'}. Legal entity: ${vendor.legalStructure || 'Unstated'}.`,
      sourceReferences: ['Vendor Onboarding Form', 'Profile Identity'],
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Financial Strength (Weight: 20%)
  // ---------------------------------------------------------------------------
  {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 40;

    if (vendor.turnoverCrores && vendor.turnoverCrores >= 50) {
      score = 92;
      evidence.push(`High annual turnover: ₹ ${vendor.turnoverCrores} Crores`);
      strengths.push(`Robust annual turnover of ₹ ${vendor.turnoverCrores} Crores indicates capacity for large capex packages`);
    } else if (vendor.turnoverCrores && vendor.turnoverCrores >= 20) {
      score = 82;
      evidence.push(`Healthy annual turnover: ₹ ${vendor.turnoverCrores} Crores`);
      strengths.push(`Healthy turnover of ₹ ${vendor.turnoverCrores} Crores`);
    } else if (vendor.turnoverCrores && vendor.turnoverCrores >= 5) {
      score = 70;
      evidence.push(`Moderate annual turnover: ₹ ${vendor.turnoverCrores} Crores`);
    } else if (vendor.turnoverCrores && vendor.turnoverCrores > 0) {
      score = 55;
      evidence.push(`Small enterprise turnover: ₹ ${vendor.turnoverCrores} Crores`);
      weaknesses.push('Turnover is under ₹ 5 Cr — may require package value thresholds');
    } else {
      score = 30;
      gaps.push('Annual financial turnover not declared');
      weaknesses.push('Financial statements or audited turnover missing from vendor profile');
    }

    const finDocs = docs.filter((document) => {
      const type = typeof document.type === 'string' ? document.type.toLowerCase() : '';
      const name = typeof document.name === 'string' ? document.name.toLowerCase() : '';
      return type.includes('financial') || name.includes('balance');
    });
    if (finDocs.length > 0) {
      score += 8;
      evidence.push(`${finDocs.length} financial supporting document(s) attached`);
    } else {
      gaps.push('Audited balance sheets or P&L statements not yet uploaded for independent verification');
      verificationGaps.push('Financial statements await upload and third-party verification');
    }

    score = Math.min(100, Math.max(20, score));

    criteria.financialStrength = {
      id: 'financialStrength',
      name: 'Financial Strength',
      weight: 20,
      suggestedScore: score,
      evidenceFound: evidence,
      verificationGaps: gaps,
      rationale: vendor.turnoverCrores
        ? `Declared turnover of ₹ ${vendor.turnoverCrores} Crores supported by declared financial metrics.`
        : 'Turnover not declared; financial capacity remains unverified.',
      sourceReferences: ['Declared Annual Turnover', 'Financial Statements / GST Filings'],
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Previous Clients and Project Experience (Weight: 20%)
  // ---------------------------------------------------------------------------
  {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 45;

    if (references.length >= 3) {
      score += 40;
      evidence.push(`Supplied ${references.length} verifiable client engagements`);
      strengths.push(`Multiple marquee client relationships declared (${references.length} clients)`);
    } else if (references.length >= 1) {
      score += 25;
      evidence.push(`Supplied ${references.length} client reference`);
    } else {
      score -= 10;
      gaps.push('No specific client project engagements declared');
      weaknesses.push('Client project track record requires documentation');
    }

    if (vendor.capabilities) {
      evidence.push(`Stated scope capabilities: ${vendor.capabilities.slice(0, 100)}...`);
      score += 15;
    }

    score = Math.min(100, Math.max(25, score));

    criteria.previousClients = {
      id: 'previousClients',
      name: 'Previous Clients and Project Experience',
      weight: 20,
      suggestedScore: score,
      evidenceFound: evidence,
      verificationGaps: gaps,
      rationale: `${references.length} client reference(s) recorded in profile. Project execution capabilities declared in categories: ${vendor.categories || 'General'}.`,
      sourceReferences: ['Client Engagement History', 'Category Capabilities'],
    };
  }

  // ---------------------------------------------------------------------------
  // 4. References and Verifiable Track Record (Weight: 15%)
  // ---------------------------------------------------------------------------
  {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 40;

    const verifiedRefs = references.filter(r => r.verified === true || r.status === 'VERIFIED');
    if (verifiedRefs.length > 0) {
      score += 45;
      evidence.push(`${verifiedRefs.length} reference(s) formally verified by Category Team`);
      strengths.push('Client references independently verified by category team');
    } else if (references.length > 0) {
      score += 20;
      evidence.push(`${references.length} client reference(s) declared by vendor (pending verification call)`);
      gaps.push('Declared client references have not yet undergone direct contact verification');
      verificationGaps.push('Reference verification calls pending with client project leads');
    } else {
      score -= 10;
      gaps.push('No verifiable client references provided');
      weaknesses.push('Absence of client reference contact persons for background check');
    }

    score = Math.min(100, Math.max(20, score));

    criteria.references = {
      id: 'references',
      name: 'References and Verifiable Track Record',
      weight: 15,
      suggestedScore: score,
      evidenceFound: evidence,
      verificationGaps: gaps,
      rationale: verifiedRefs.length > 0
        ? `${verifiedRefs.length} client reference(s) verified.`
        : 'References declared by vendor; awaiting direct confirmation.',
      sourceReferences: ['Client Reference Contacts', 'Category Manager Interview Notes'],
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Technical / Category Capability (Weight: 20%)
  // ---------------------------------------------------------------------------
  {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 50;

    if (vendor.categories) {
      evidence.push(`Primary category domain: ${vendor.categories}`);
      score += 15;
    } else {
      gaps.push('No primary category domain mapped');
    }

    if (vendor.certifications && vendor.certifications.length > 0) {
      evidence.push(`Industry certifications: ${vendor.certifications}`);
      strengths.push(`Quality & compliance certifications active: ${vendor.certifications}`);
      score += 25;
    } else {
      gaps.push('No ISO or technical quality certifications listed');
    }

    if (vendor.serviceCoverage) {
      evidence.push(`Service coverage footprint: ${vendor.serviceCoverage}`);
      score += 10;
    }

    score = Math.min(100, Math.max(30, score));

    criteria.technicalCapability = {
      id: 'technicalCapability',
      name: 'Technical / Category Capability',
      weight: 20,
      suggestedScore: score,
      evidenceFound: evidence,
      verificationGaps: gaps,
      rationale: `Category coverage includes ${vendor.categories || 'General Contracting'}. Quality certifications: ${vendor.certifications || 'None declared'}.`,
      sourceReferences: ['Category Master Alignment', 'Certifications Registry'],
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Compliance and Risk (Weight: 10%)
  // ---------------------------------------------------------------------------
  {
    const evidence: string[] = [];
    const gaps: string[] = [];
    let score = 60;

    // GSTIN Check
    const gstCheck = validateGstinSyntax(vendor.gstin);
    if (gstCheck.valid) {
      evidence.push(`Valid GSTIN syntax: ${vendor.gstin}`);
      score += 20;
    } else {
      gaps.push(gstCheck.reason || 'Invalid GSTIN');
      if (vendor.gstin && vendor.gstin.trim().length > 0) {
        contradictions.push(`GSTIN syntax mismatch: "${vendor.gstin}" does not conform to Indian 15-character GST format`);
        criticalRiskFlags.push('GSTIN provided does not match valid statutory syntax');
        score -= 25;
      } else {
        gaps.push('GSTIN not yet provided');
        score -= 10;
      }
    }

    // PAN Check
    const panCheck = validatePanSyntax(vendor.pan);
    if (panCheck.valid) {
      evidence.push(`Valid PAN format: ${vendor.pan}`);
      score += 15;
    } else {
      gaps.push(panCheck.reason || 'Invalid PAN');
      if (vendor.pan && vendor.pan.trim().length > 0) {
        contradictions.push(`PAN format mismatch: "${vendor.pan}" is not a valid 10-character PAN`);
        score -= 15;
      } else {
        gaps.push('PAN not provided');
      }
    }

    if (vendor.complianceStatus === 'COMPLIANT') {
      evidence.push('Internal compliance status flagged as COMPLIANT');
      score += 5;
    } else if (vendor.complianceStatus === 'NON_COMPLIANT') {
      score -= 30;
      criticalRiskFlags.push('Vendor flagged as NON_COMPLIANT in internal records');
    }

    score = Math.min(100, Math.max(10, score));

    criteria.complianceRisk = {
      id: 'complianceRisk',
      name: 'Compliance and Risk',
      weight: 10,
      suggestedScore: score,
      evidenceFound: evidence,
      verificationGaps: gaps,
      rationale: `Statutory verification: GSTIN ${gstCheck.valid ? 'Valid' : 'Pending/Invalid'}, PAN ${panCheck.valid ? 'Valid' : 'Pending/Invalid'}. Blacklist: ${vendor.isBlacklisted ? 'FLAGGED' : 'Clear'}.`,
      sourceReferences: ['Statutory Filings', 'PAN/GST Portal Verification'],
    };
  }

  // ---------------------------------------------------------------------------
  // Overall Weighted Score Computation
  // ---------------------------------------------------------------------------
  let totalWeighted = 0;
  let totalWeight = 0;

  for (const key of Object.keys(criteria)) {
    const c = criteria[key];
    if (!c.isNotApplicable) {
      totalWeighted += (c.suggestedScore * c.weight);
      totalWeight += c.weight;
    }
  }

  const overallWeightedScore = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 10) / 10 : 0;

  // Qualification Outcome Rubric
  let qualificationOutcome: 'RECOMMENDED' | 'CONDITIONAL' | 'NOT_RECOMMENDED';
  if (criticalRiskFlags.length > 0) {
    qualificationOutcome = overallWeightedScore >= 65 ? 'CONDITIONAL' : 'NOT_RECOMMENDED';
  } else if (overallWeightedScore >= 80) {
    qualificationOutcome = 'RECOMMENDED';
  } else if (overallWeightedScore >= 65) {
    qualificationOutcome = 'CONDITIONAL';
  } else {
    qualificationOutcome = 'NOT_RECOMMENDED';
  }

  return {
    overallWeightedScore,
    qualificationOutcome,
    criteria,
    strengths,
    weaknesses,
    verificationGaps,
    criticalRiskFlags,
    contradictions,
    evaluatedAt: new Date().toISOString(),
  };
}

// src/app/api/procurement/vendors/[id]/evaluate-ai/route.ts
// AI-Assisted Vendor Evaluation Endpoint
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { evaluateVendorProfile } from '@/lib/vendor-ai-evaluator';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth('VENDOR_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;

  try {
    const vendor = await prisma.vendor.findFirst({
      where: {
        id,
        OR: [
          { tenantId: ctx.tenantId },
          { vendorType: 'PROCUCEV_VENDOR' },
        ],
      },
    });

    if (!vendor) {
      return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404);
    }

    // Run Structured & Evidence-Based AI Evaluation Engine
    const report = evaluateVendorProfile({
      id: vendor.id,
      code: vendor.code,
      name: vendor.name,
      vendorType: vendor.vendorType,
      contactPerson: vendor.contactPerson,
      email: vendor.email,
      phone: vendor.phone,
      city: vendor.city,
      state: vendor.state,
      country: vendor.country,
      legalStructure: vendor.legalStructure,
      gstin: vendor.gstin,
      pan: vendor.pan,
      website: vendor.website,
      address: vendor.address,
      operatingLocation: vendor.operatingLocation,
      experienceYears: vendor.experienceYears,
      turnoverCrores: vendor.turnoverCrores,
      categories: vendor.categories,
      capabilities: vendor.capabilities,
      serviceCoverage: vendor.serviceCoverage,
      clientReferences: vendor.clientReferences,
      certifications: vendor.certifications,
      complianceStatus: vendor.complianceStatus,
      empanelmentStatus: vendor.empanelmentStatus,
      isBlacklisted: vendor.isBlacklisted,
      documents: vendor.documents,
    });

    // Create or update a pending VendorEvaluation record with AI recommendations
    const evaluation = await prisma.vendorEvaluation.create({
      data: {
        tenantId: ctx.tenantId,
        vendorId: vendor.id,
        evaluationType: 'INITIAL',
        status: 'AI_GENERATED',
        businessProfileScore: report.criteria.businessProfile.suggestedScore,
        financialStrengthScore: report.criteria.financialStrength.suggestedScore,
        previousClientsScore: report.criteria.previousClients.suggestedScore,
        referencesScore: report.criteria.references.suggestedScore,
        technicalCapabilityScore: report.criteria.technicalCapability.suggestedScore,
        complianceRiskScore: report.criteria.complianceRisk.suggestedScore,
        overallWeightedScore: report.overallWeightedScore,
        qualificationOutcome: report.qualificationOutcome,
        criteriaDetails: JSON.stringify(report.criteria),
        aiSummary: JSON.stringify({
          strengths: report.strengths,
          weaknesses: report.weaknesses,
          verificationGaps: report.verificationGaps,
          contradictions: report.contradictions,
        }),
        criticalRiskFlags: JSON.stringify(report.criticalRiskFlags),
        evaluatedBy: `AI Evaluator (Reviewed by ${ctx.userId})`,
        evaluatedAt: new Date(),
        decisionRemarks: `AI Evaluation generated with score ${report.overallWeightedScore}% (${report.qualificationOutcome}). Awaiting Category Manager review & final qualification decision.`,
      },
    });

    // Update vendor qualification status to PENDING_REVIEW (AI suggests, human decides)
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        qualificationStatus: 'PENDING_REVIEW',
        qualificationScore: report.overallWeightedScore,
        qualificationDecision: report.qualificationOutcome,
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendor.id,
      action: 'VENDOR_AI_EVALUATED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluateAiRoute.aIAssistedEvaluationCompletedForVendorNameScoreOverallWeightedScoreRecommendationQualificationOutcome, { "name": vendor.name, "overallWeightedScore": report.overallWeightedScore, "qualificationOutcome": report.qualificationOutcome }),
      newValue: {
        score: report.overallWeightedScore,
        recommendation: report.qualificationOutcome,
        evaluationId: evaluation.id,
      },
    });

    return apiSuccess({
      evaluation,
      report,
      message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluateAiRoute.aIEvaluationCompletedSuggestedScoreOverallWeightedScoreQualificationOutcome, { "overallWeightedScore": report.overallWeightedScore, "qualificationOutcome": report.qualificationOutcome }),
    });
  } catch (error: any) {
    console.error('Error running AI vendor evaluation:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToRunAiEvaluation }), 500);
  }
}

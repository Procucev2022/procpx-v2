// src/app/api/procurement/vendors/[id]/evaluation/route.ts
// Category Manager Vendor Qualification Decision & Reviewer Submission API
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
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

    const body = await req.json();
    const {
      qualificationStatus, // QUALIFIED | CONDITIONALLY_QUALIFIED | NOT_QUALIFIED
      qualificationDecision, // RECOMMENDED | CONDITIONAL | NOT_RECOMMENDED
      scores, // { businessProfile, financialStrength, previousClients, references, technicalCapability, complianceRisk }
      overallWeightedScore,
      decisionRemarks,
      criteriaDetails,
    } = body;

    if (!qualificationStatus || !['QUALIFIED', 'CONDITIONALLY_QUALIFIED', 'NOT_QUALIFIED'].includes(qualificationStatus)) {
      return apiError(UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.aValidQualificationStatusIsRequiredQUALIFIEDCONDITIONALLYQUALIFIEDOrNOTQUALIFIED, 400);
    }

    const bpScore = scores?.businessProfile !== undefined ? Number(scores.businessProfile) : null;
    const fsScore = scores?.financialStrength !== undefined ? Number(scores.financialStrength) : null;
    const pcScore = scores?.previousClients !== undefined ? Number(scores.previousClients) : null;
    const refScore = scores?.references !== undefined ? Number(scores.references) : null;
    const tcScore = scores?.technicalCapability !== undefined ? Number(scores.technicalCapability) : null;
    const crScore = scores?.complianceRisk !== undefined ? Number(scores.complianceRisk) : null;

    // Calculate overall score if not explicitly passed
    let finalOverall = overallWeightedScore !== undefined ? Number(overallWeightedScore) : 0;
    if (finalOverall === 0 && (bpScore || fsScore || pcScore || refScore || tcScore || crScore)) {
      finalOverall = Math.round(
        ((bpScore || 0) * 0.15) +
        ((fsScore || 0) * 0.20) +
        ((pcScore || 0) * 0.20) +
        ((refScore || 0) * 0.15) +
        ((tcScore || 0) * 0.20) +
        ((crScore || 0) * 0.10)
      );
    }

    // Save final evaluation record
    const evaluation = await prisma.vendorEvaluation.create({
      data: {
        tenantId: ctx.tenantId,
        vendorId: vendor.id,
        evaluationType: 'INITIAL',
        status: qualificationStatus,
        businessProfileScore: bpScore,
        financialStrengthScore: fsScore,
        previousClientsScore: pcScore,
        referencesScore: refScore,
        technicalCapabilityScore: tcScore,
        complianceRiskScore: crScore,
        overallWeightedScore: finalOverall,
        qualificationOutcome: qualificationDecision || (finalOverall >= 80 ? 'RECOMMENDED' : finalOverall >= 65 ? 'CONDITIONAL' : 'NOT_RECOMMENDED'),
        criteriaDetails: criteriaDetails ? (typeof criteriaDetails === 'string' ? criteriaDetails : JSON.stringify(criteriaDetails)) : null,
        evaluatedBy: ctx.userId,
        evaluatedAt: new Date(),
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        decisionRemarks: decisionRemarks || `Formally evaluated by Category Manager (Status: ${qualificationStatus}, Score: ${finalOverall}%)`,
      },
    });

    // Update vendor master record with official qualification
    const updatedVendor = await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        qualificationStatus,
        qualificationScore: finalOverall,
        qualificationDecision: qualificationDecision || evaluation.qualificationOutcome,
        evaluatedAt: new Date(),
        evaluatedById: ctx.userId,
        empanelmentStatus: qualificationStatus === 'QUALIFIED' ? 'APPROVED' : (qualificationStatus === 'CONDITIONALLY_QUALIFIED' ? 'PROVISIONAL' : 'REJECTED'),
      },
    });

    await createAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entityType: 'VENDOR',
      entityId: vendor.id,
      action: 'VENDOR_QUALIFIED',
      description: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.categoryManagerSetQualificationStatusForNameToQualificationStatusScoreFinalOverall, { "name": vendor.name, "qualificationStatus": qualificationStatus, "finalOverall": finalOverall }),
      newValue: {
        qualificationStatus,
        qualificationScore: finalOverall,
        decisionRemarks,
        evaluationId: evaluation.id,
      },
    });

    return apiSuccess({
      vendor: updatedVendor,
      evaluation,
      message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.vendorQualificationUpdatedToQualificationStatusWithScoreFinalOverall, { "qualificationStatus": qualificationStatus, "finalOverall": finalOverall }),
    });
  } catch (error: any) {
    console.error('Error submitting vendor qualification:', error);
    return apiError(interpolateUiString(UI_STRINGS.common.value1, { "value1": error.message || UI_STRINGS.common.userMessages.failedToSubmitVendorQualification }), 500);
  }
}

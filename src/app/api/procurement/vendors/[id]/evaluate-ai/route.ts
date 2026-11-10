import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { persistVendorEvaluationAtomically } from '@/lib/vendor-evaluation-persistence';
import { evaluateVendorProfile } from '@/lib/vendor-ai-evaluator';
import { logEvent, writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { EvaluateVendorAiRouteParams } from '@app-types/app/api/procurement/vendors/evaluate-ai.types';
import type { VendorEvaluationInputDataIssue } from '@app-types/lib/vendor-ai-evaluator.types';
import {
  AI_VENDOR_EVALUATION_FAILED_EVENT,
  AI_VENDOR_EVALUATION_INPUT_INVALID_EVENT,
  AI_VENDOR_EVALUATION_RECOVERED_EVENT,
  AI_VENDOR_EVALUATION_STATUS,
} from './route.constants';

export async function POST(req: NextRequest, { params }: EvaluateVendorAiRouteParams) {
  const ctx = await requireAuth('VENDOR_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  let evaluationId: string | null = null;
  let auditId: string | null = null;
  let evaluationRecord: Record<string, unknown> | null = null;
  let report: ReturnType<typeof evaluateVendorProfile> | null = null;
  let failureCode = 'ai_vendor_evaluation_failed';

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { vendorType: 'PROCUCEV_VENDOR' }] },
    });
    if (!vendor) return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404);

    const evaluationInputIssues: VendorEvaluationInputDataIssue[] = [];
    report = evaluateVendorProfile({
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
    }, { onInputDataIssue: (issue) => evaluationInputIssues.push(issue) });
    if (evaluationInputIssues.length > 0) {
      logEvent('warn', AI_VENDOR_EVALUATION_INPUT_INVALID_EVENT, {
        operation: 'run_ai_vendor_evaluation', route: '/api/procurement/vendors/[id]/evaluate-ai',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
        userId: ctx.userId, vendorId: vendor.id, invalidCount: evaluationInputIssues.length,
        issues: evaluationInputIssues,
      });
    }

    const expectedVendorUpdatedAt = vendor.updatedAt instanceof Date ? vendor.updatedAt : new Date(String(vendor.updatedAt || ''));
    if (!Number.isFinite(expectedVendorUpdatedAt.getTime())) {
      return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    }
    const now = new Date();
    const updatedAt = new Date(Math.max(now.getTime(), expectedVendorUpdatedAt.getTime() + 1));
    evaluationId = crypto.randomUUID();
    auditId = crypto.randomUUID();
    const evaluation = {
      id: evaluationId,
      tenantId: ctx.tenantId,
      vendorId: vendor.id,
      evaluationType: 'INITIAL',
      status: AI_VENDOR_EVALUATION_STATUS,
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
      evaluatedAt: now,
      approvedBy: null,
      approvedAt: null,
      decisionRemarks: `AI Evaluation generated with score ${report.overallWeightedScore}% (${report.qualificationOutcome}). Awaiting Category Manager review & final qualification decision.`,
      createdAt: now,
      updatedAt: now,
    };
    evaluationRecord = evaluation;
    failureCode = 'ai_vendor_evaluation_batch_failed';
    await persistVendorEvaluationAtomically({
      tenantId: ctx.tenantId,
      vendorId: vendor.id,
      expectedVendorUpdatedAt,
      requiresVendorUpdate: vendor.tenantId === ctx.tenantId,
      vendorUpdate: {
        qualificationStatus: 'PENDING_REVIEW',
        qualificationScore: report.overallWeightedScore,
        qualificationDecision: report.qualificationOutcome,
        evaluatedAt: vendor.evaluatedAt instanceof Date ? vendor.evaluatedAt : null,
        evaluatedById: vendor.evaluatedById,
        empanelmentStatus: vendor.empanelmentStatus,
        updatedAt,
      },
      evaluation,
      audit: {
        id: auditId,
        userId: ctx.userId,
        action: 'VENDOR_AI_EVALUATED',
        description: interpolateUiString(
          UI_STRINGS.appApiProcurementVendorsIdEvaluateAiRoute.aIAssistedEvaluationCompletedForVendorNameScoreOverallWeightedScoreRecommendationQualificationOutcome,
          { name: vendor.name, overallWeightedScore: report.overallWeightedScore, qualificationOutcome: report.qualificationOutcome },
        ),
        oldValue: {
          qualificationStatus: vendor.qualificationStatus,
          qualificationScore: vendor.qualificationScore,
          qualificationDecision: vendor.qualificationDecision,
        },
        newValue: { score: report.overallWeightedScore, recommendation: report.qualificationOutcome, evaluationId },
        userAgent: req.headers.get('user-agent'),
        createdAt: now,
      },
    });

    return apiSuccess({
      evaluation,
      report,
      message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluateAiRoute.aIEvaluationCompletedSuggestedScoreOverallWeightedScoreQualificationOutcome, {
        overallWeightedScore: report.overallWeightedScore, qualificationOutcome: report.qualificationOutcome,
      }),
    });
  } catch (error: unknown) {
    if (evaluationId && auditId && evaluationRecord && report) {
      try {
        const [persistedEvaluation, audit] = await Promise.all([
          prisma.vendorEvaluation.findFirst({ where: { id: evaluationId, tenantId: ctx.tenantId } }),
          prisma.auditLog.findFirst({ where: { id: auditId, tenantId: ctx.tenantId }, select: { id: true } }),
        ]);
        if (persistedEvaluation && audit) {
          try {
            await writeStructuredLog('warn', AI_VENDOR_EVALUATION_RECOVERED_EVENT, {
              operation: 'run_ai_vendor_evaluation', route: '/api/procurement/vendors/[id]/evaluate-ai',
              requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
              userId: ctx.userId, vendorId: id, evaluationId, durationMs: Date.now() - startedAt,
            });
          } catch {
            // A confirmed D1 commit remains successful if optional log storage is unavailable.
          }
          return apiSuccess({
            evaluation: persistedEvaluation,
            report,
            message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluateAiRoute.aIEvaluationCompletedSuggestedScoreOverallWeightedScoreQualificationOutcome, {
              overallWeightedScore: report.overallWeightedScore, qualificationOutcome: report.qualificationOutcome,
            }),
          });
        }
      } catch {
        // Return a stable error if D1 cannot confirm whether the evaluation batch committed.
      }
    }

    try {
      await writeStructuredLog('error', AI_VENDOR_EVALUATION_FAILED_EVENT, {
        operation: 'run_ai_vendor_evaluation', route: '/api/procurement/vendors/[id]/evaluate-ai',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
        userId: ctx.userId, role: ctx.role, vendorId: id, evaluationId, failureCode, durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Keep the client response stable if optional log storage is unavailable.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToRunAiEvaluation, 500);
  }
}

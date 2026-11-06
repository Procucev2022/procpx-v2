import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiSuccess, apiError } from '@/lib/api-utils';
import { persistVendorEvaluationAtomically } from '@/lib/vendor-evaluation-persistence';
import { writeStructuredLog } from '@/lib/observability/server-logger';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { VendorEvaluationRouteParams } from '@app-types/app/api/procurement/vendors/evaluation.types';
import {
  MAX_VENDOR_CRITERIA_DETAILS_BYTES,
  MAX_VENDOR_DECISION_REMARKS_LENGTH,
  VENDOR_EVALUATION_FAILED_EVENT,
  VENDOR_EVALUATION_RECOVERED_EVENT,
  VENDOR_EVALUATION_SCORE_WEIGHTS,
  VENDOR_QUALIFICATION_DECISIONS,
  VENDOR_QUALIFICATION_STATUSES,
} from './route.constants';

const SCORE_FIELDS = ['businessProfile', 'financialStrength', 'previousClients', 'references', 'technicalCapability', 'complianceRisk'] as const;
type ScoreField = typeof SCORE_FIELDS[number];

function toScore(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : Number.NaN;
}

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function POST(req: NextRequest, { params }: VendorEvaluationRouteParams) {
  const ctx = await requireAuth('VENDOR_MANAGE');
  if (!isApiContext(ctx)) return ctx;

  const { id } = await params;
  const startedAt = Date.now();
  let evaluationId: string | null = null;
  let auditId: string | null = null;
  let evaluationRecord: Record<string, unknown> | null = null;
  let responseVendor: Record<string, unknown> | null = null;
  let failureCode = 'vendor_evaluation_failed';

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { vendorType: 'PROCUCEV_VENDOR' }] },
    });
    if (!vendor) return apiError(UI_STRINGS.common.vendorNotFoundOrAccessDenied2, 404);

    const parsedBody: unknown = await req.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const body = parsedBody as Record<string, unknown>;
    if (typeof body.qualificationStatus !== 'string' ||
        !(VENDOR_QUALIFICATION_STATUSES as readonly string[]).includes(body.qualificationStatus)) {
      return apiError(UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.aValidQualificationStatusIsRequiredQUALIFIEDCONDITIONALLYQUALIFIEDOrNOTQUALIFIED, 400);
    }
    const qualificationStatus = body.qualificationStatus;
    const scoresValue = body.scores;
    if (scoresValue !== undefined && (!scoresValue || typeof scoresValue !== 'object' || Array.isArray(scoresValue))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const scores = (scoresValue || {}) as Record<string, unknown>;
    const parsedScores = Object.fromEntries(SCORE_FIELDS.map((field) => [field, toScore(scores[field])])) as Record<ScoreField, number | null>;
    if (Object.values(parsedScores).some((score) => typeof score === 'number' && !Number.isFinite(score))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const rawOverallScore = body.overallWeightedScore;
    if (rawOverallScore !== undefined && rawOverallScore !== null && typeof rawOverallScore !== 'number' && typeof rawOverallScore !== 'string') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const parsedOverallScore = rawOverallScore === undefined || rawOverallScore === null || rawOverallScore === '' ? 0 : Number(rawOverallScore);
    if (!Number.isFinite(parsedOverallScore) || parsedOverallScore < 0 || parsedOverallScore > 100) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const rawDecision = body.qualificationDecision;
    if (rawDecision !== undefined && rawDecision !== null &&
        (typeof rawDecision !== 'string' || !(VENDOR_QUALIFICATION_DECISIONS as readonly string[]).includes(rawDecision))) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const qualificationDecision = typeof rawDecision === 'string' ? rawDecision : undefined;

    const rawRemarks = body.decisionRemarks;
    if (rawRemarks !== undefined && rawRemarks !== null && typeof rawRemarks !== 'string') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const decisionRemarks = typeof rawRemarks === 'string' && rawRemarks.trim()
      ? rawRemarks.trim()
      : `Formally evaluated by Category Manager (Status: ${qualificationStatus}, Score: ${parsedOverallScore}%)`;
    if (decisionRemarks.length > MAX_VENDOR_DECISION_REMARKS_LENGTH) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    const criteriaValue = body.criteriaDetails;
    if (criteriaValue !== undefined && criteriaValue !== null && typeof criteriaValue !== 'string' && typeof criteriaValue !== 'object') {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }
    const criteriaDetails = criteriaValue === undefined || criteriaValue === null
      ? null
      : typeof criteriaValue === 'string' ? criteriaValue : JSON.stringify(criteriaValue);
    if (criteriaDetails && new TextEncoder().encode(criteriaDetails).byteLength > MAX_VENDOR_CRITERIA_DETAILS_BYTES) {
      return apiError(UI_STRINGS.common.invalidRequestBody, 400);
    }

    let overallWeightedScore = parsedOverallScore;
    if (overallWeightedScore === 0 && Object.values(parsedScores).some((score) => typeof score === 'number' && score !== 0)) {
      overallWeightedScore = Math.round(SCORE_FIELDS.reduce((total, field) =>
        total + (parsedScores[field] || 0) * VENDOR_EVALUATION_SCORE_WEIGHTS[field], 0));
    }
    const finalDecision = qualificationDecision || (overallWeightedScore >= 80
      ? VENDOR_QUALIFICATION_DECISIONS[0]
      : overallWeightedScore >= 65 ? VENDOR_QUALIFICATION_DECISIONS[1] : VENDOR_QUALIFICATION_DECISIONS[2]);
    const empanelmentStatus = qualificationStatus === VENDOR_QUALIFICATION_STATUSES[0]
      ? 'APPROVED'
      : qualificationStatus === VENDOR_QUALIFICATION_STATUSES[1] ? 'PROVISIONAL' : 'REJECTED';

    const expectedVendorUpdatedAt = toDateOrNull(vendor.updatedAt);
    if (!expectedVendorUpdatedAt) return apiError(UI_STRINGS.common.workflowRecordChangedRetryAfterRefresh, 409);
    const now = new Date();
    const updatedAt = new Date(Math.max(now.getTime(), expectedVendorUpdatedAt.getTime() + 1));
    evaluationId = crypto.randomUUID();
    auditId = crypto.randomUUID();
    const oldValue = {
      qualificationStatus: vendor.qualificationStatus,
      qualificationScore: vendor.qualificationScore,
      qualificationDecision: vendor.qualificationDecision,
      empanelmentStatus: vendor.empanelmentStatus,
    };
    const evaluation = {
      id: evaluationId,
      tenantId: ctx.tenantId,
      vendorId: vendor.id,
      evaluationType: 'INITIAL',
      status: qualificationStatus,
      ...Object.fromEntries(SCORE_FIELDS.map((field) => [`${field}Score`, parsedScores[field]])),
      overallWeightedScore,
      qualificationOutcome: finalDecision,
      criteriaDetails,
      aiSummary: null,
      criticalRiskFlags: null,
      evaluatedBy: ctx.userId,
      evaluatedAt: now,
      approvedBy: ctx.userId,
      approvedAt: now,
      decisionRemarks,
      createdAt: now,
      updatedAt: now,
    };
    evaluationRecord = evaluation;
    responseVendor = {
      ...vendor,
      qualificationStatus,
      qualificationScore: overallWeightedScore,
      qualificationDecision: finalDecision,
      evaluatedAt: now,
      evaluatedById: ctx.userId,
      empanelmentStatus,
      updatedAt,
    };

    const tenantOwnsVendor = vendor.tenantId === ctx.tenantId;
    const auditDescription = interpolateUiString(
      UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.categoryManagerSetQualificationStatusForNameToQualificationStatusScoreFinalOverall,
      { name: vendor.name, qualificationStatus, finalOverall: overallWeightedScore },
    );
    failureCode = 'vendor_evaluation_batch_failed';
    await persistVendorEvaluationAtomically({
      tenantId: ctx.tenantId,
      vendorId: vendor.id,
      expectedVendorUpdatedAt,
      requiresVendorUpdate: tenantOwnsVendor,
      vendorUpdate: {
        qualificationStatus,
        qualificationScore: overallWeightedScore,
        qualificationDecision: finalDecision,
        evaluatedAt: now,
        evaluatedById: ctx.userId,
        empanelmentStatus,
        updatedAt,
      },
      evaluation,
      audit: {
        id: auditId,
        userId: ctx.userId,
        action: 'VENDOR_QUALIFIED',
        description: auditDescription,
        oldValue,
        newValue: { qualificationStatus, qualificationScore: overallWeightedScore, decisionRemarks, evaluationId },
        userAgent: req.headers.get('user-agent'),
        createdAt: now,
      },
    });

    return apiSuccess({
      vendor: responseVendor,
      evaluation,
      message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.vendorQualificationUpdatedToQualificationStatusWithScoreFinalOverall, {
        qualificationStatus, finalOverall: overallWeightedScore,
      }),
    });
  } catch (error: unknown) {
    if (evaluationId && auditId && evaluationRecord && responseVendor) {
      try {
        const [persistedEvaluation, audit] = await Promise.all([
          prisma.vendorEvaluation.findFirst({ where: { id: evaluationId, tenantId: ctx.tenantId } }),
          prisma.auditLog.findFirst({ where: { id: auditId, tenantId: ctx.tenantId }, select: { id: true } }),
        ]);
        if (persistedEvaluation && audit) {
          try {
            await writeStructuredLog('warn', VENDOR_EVALUATION_RECOVERED_EVENT, {
              operation: 'submit_vendor_evaluation', route: '/api/procurement/vendors/[id]/evaluation',
              requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
              userId: ctx.userId, vendorId: id, evaluationId, durationMs: Date.now() - startedAt,
            });
          } catch {
            // A confirmed D1 commit remains successful if optional log storage is unavailable.
          }
          return apiSuccess({
            vendor: responseVendor,
            evaluation: persistedEvaluation,
            message: interpolateUiString(UI_STRINGS.appApiProcurementVendorsIdEvaluationRoute.vendorQualificationUpdatedToQualificationStatusWithScoreFinalOverall, {
              qualificationStatus: String(evaluationRecord.status), finalOverall: Number(evaluationRecord.overallWeightedScore),
            }),
          });
        }
      } catch {
        // Return a stable error if D1 cannot confirm whether the evaluation batch committed.
      }
    }

    try {
      await writeStructuredLog('error', VENDOR_EVALUATION_FAILED_EVENT, {
        operation: 'submit_vendor_evaluation', route: '/api/procurement/vendors/[id]/evaluation',
        requestId: req.headers.get('x-request-id') || null, tenantId: ctx.tenantId,
        userId: ctx.userId, role: ctx.role, vendorId: id, evaluationId, failureCode, durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 400) } : { type: typeof error },
      });
    } catch {
      // Keep the client response stable if optional log storage is unavailable.
    }
    return apiError(UI_STRINGS.common.userMessages.failedToSubmitVendorQualification, 500);
  }
}

// src/lib/boq-revision-utils.ts
// Utility module for resilient, concurrency-safe BOQ revision number generation and lifecycle management.
import { prisma } from '@/lib/prisma';
import type { CreateRevisionData } from "@app-types/lib/boq-revision-utils.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { CreateRevisionData };


/**
 * Returns the highest existing revision number for a specific BOQ, or -1 if no revisions exist.
 */
export async function getHighestRevisionNumber(boqId: string): Promise<number> {
  const lastRev = await prisma.boqRevision.findFirst({
    where: { boqId },
    orderBy: { revisionNumber: 'desc' },
    select: { revisionNumber: true },
  });
  return lastRev !== null && lastRev !== undefined ? lastRev.revisionNumber : -1;
}

/**
 * Creates the next sequential revision for a given BOQ in a concurrency-safe manner.
 * If a race condition occurs (e.g. concurrent requests calculating the same revisionNumber),
 * it catches the unique constraint violation (P2002 on [boqId, revisionNumber]) and retries
 * with the updated latest revision number.
 */
export async function createNextBoqRevision(
  data: CreateRevisionData,
  maxRetries = 5
) {
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    try {
      const highestNum = await getHighestRevisionNumber(data.boqId);
      const nextNumber = highestNum + 1;
      const revisionCode = `R${nextNumber}`;

      const created = await prisma.boqRevision.create({
        data: {
          tenantId: data.tenantId,
          boqId: data.boqId,
          costCentreId: data.costCentreId ?? null,
          revisionNumber: nextNumber,
          revisionCode,
          status: data.status || 'DRAFT',
          preparationStatus: data.preparationStatus || 'DRAFT',
          budgetStatus: data.budgetStatus || 'NOT_ADDED_TO_BUDGET',
          prStatus: data.prStatus || 'PR_NOT_CREATED',
          sourceType: data.sourceType || 'MANUAL',
          sourceFile: data.sourceFile ?? null,
          sourceReference: data.sourceReference ?? null,
          sourceConfidence: data.sourceConfidence ?? null,
          originalFileName: data.originalFileName ?? null,
          originalFilePath: data.originalFilePath ?? null,
          originalFileSize: data.originalFileSize ?? null,
          originalFileHash: data.originalFileHash ?? null,
          uploadedAt: data.uploadedAt || new Date(),
          columnMapping: data.columnMapping ?? null,
          notes: data.notes ?? null,
          totalLines: data.totalLines || 0,
          validLines: data.validLines || 0,
          errorLines: data.errorLines || 0,
          warningLines: data.warningLines || 0,
          qualityScore: data.qualityScore ?? null,
          createdById: data.createdById,
        },
      });

      return created;
    } catch (err: any) {
      const isUniqueConstraint =
        err?.code === 'P2002' ||
        (err?.message && err.message.includes('Unique constraint failed'));

      if (isUniqueConstraint && attempts < maxRetries) {
        // Jittered backoff to resolve concurrent contention
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 + 10));
        continue;
      }
      throw err;
    }
  }

  throw new Error(interpolateUiString(UI_STRINGS.libBoqRevisionUtils.failedToAllocateAUniqueRevisionNumberForBOQBoqIdAfterMaxRetriesAttempts, { "boqId": data.boqId, "maxRetries": maxRetries }));
}

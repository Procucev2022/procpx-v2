// app/api/boq/[revisionId]/compare/route.ts
// Compare two revisions of a BOQ and return line-level differences
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isApiContext, apiError, apiSuccess } from '@/lib/api-utils';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export async function GET(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;
  const { revisionId } = await params;

  const { searchParams } = new URL(req.url);
  const targetRevisionId = searchParams.get('targetRevisionId');

  const currentRevision = await prisma.boqRevision.findFirst({
    where: { id: revisionId, tenantId: ctx.tenantId },
    include: {
      lines: {
        where: { isDeleted: false },
        include: {
          category: { select: { name: true } },
          subcategory: { select: { name: true } },
          uom: { select: { code: true } },
        },
      },
      boq: {
        include: {
          revisions: {
            select: { id: true, revisionNumber: true, revisionCode: true, status: true, totalLines: true, qualityScore: true, createdAt: true },
            orderBy: { revisionNumber: 'desc' },
          },
        },
      },
    },
  });

  if (!currentRevision) return apiError(UI_STRINGS.appApiBoqRevisionIdCompareRoute.currentRevisionNotFound, 404);

  // If no targetRevisionId specified, compare against immediate previous revision
  let compareTargetRevId = targetRevisionId;
  if (!compareTargetRevId) {
    const prevRev = currentRevision.boq.revisions.find(r => r.revisionNumber === currentRevision.revisionNumber - 1);
    compareTargetRevId = prevRev ? prevRev.id : currentRevision.id;
  }

  const compareRevision = await prisma.boqRevision.findFirst({
    where: { id: compareTargetRevId, tenantId: ctx.tenantId },
    include: {
      lines: {
        where: { isDeleted: false },
        include: {
          category: { select: { name: true } },
          subcategory: { select: { name: true } },
          uom: { select: { code: true } },
        },
      },
    },
  });

  if (!compareRevision) return apiError(UI_STRINGS.appApiBoqRevisionIdCompareRoute.compareTargetRevisionNotFound, 404);

  const prevLinesByNum = new Map(compareRevision.lines.map(l => [l.lineNumber, l]));
  const currLinesByNum = new Map(currentRevision.lines.map(l => [l.lineNumber, l]));

  const added: any[] = [];
  const removed: any[] = [];
  const modified: any[] = [];
  let unchangedCount = 0;

  for (const [lineNum, currLine] of currLinesByNum.entries()) {
    const prevLine = prevLinesByNum.get(lineNum);
    if (!prevLine) {
      added.push({
        lineNumber: lineNum,
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": currLine.standardDescription || currLine.originalDescription }),
        quantity: currLine.quantity,
        uom: currLine.uom?.code || currLine.uomRaw,
        category: currLine.category?.name,
      });
    } else {
      const diffs: Array<{ field: string; oldVal: any; newVal: any }> = [];
      if (prevLine.standardDescription !== currLine.standardDescription) {
        diffs.push({ field: 'standardDescription', oldVal: prevLine.standardDescription, newVal: currLine.standardDescription });
      }
      if (prevLine.quantity !== currLine.quantity) {
        diffs.push({ field: 'quantity', oldVal: prevLine.quantity, newVal: currLine.quantity });
      }
      if (prevLine.uomId !== currLine.uomId || prevLine.uomRaw !== currLine.uomRaw) {
        diffs.push({ field: 'uom', oldVal: prevLine.uom?.code || prevLine.uomRaw, newVal: currLine.uom?.code || currLine.uomRaw });
      }
      if (prevLine.categoryId !== currLine.categoryId) {
        diffs.push({ field: 'category', oldVal: prevLine.category?.name, newVal: currLine.category?.name });
      }

      if (diffs.length > 0) {
        modified.push({
          lineNumber: lineNum,
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": currLine.standardDescription || currLine.originalDescription }),
          diffs,
        });
      } else {
        unchangedCount++;
      }
    }
  }

  for (const [lineNum, prevLine] of prevLinesByNum.entries()) {
    if (!currLinesByNum.has(lineNum)) {
      removed.push({
        lineNumber: lineNum,
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": prevLine.standardDescription || prevLine.originalDescription }),
        quantity: prevLine.quantity,
        uom: prevLine.uom?.code || prevLine.uomRaw,
      });
    }
  }

  return apiSuccess({
    currentRevision: {
      id: currentRevision.id,
      revisionCode: currentRevision.revisionCode,
      status: currentRevision.status,
      qualityScore: currentRevision.qualityScore,
      totalLines: currentRevision.totalLines,
    },
    compareRevision: {
      id: compareRevision.id,
      revisionCode: compareRevision.revisionCode,
      status: compareRevision.status,
      qualityScore: compareRevision.qualityScore,
      totalLines: compareRevision.totalLines,
    },
    availableRevisions: currentRevision.boq.revisions,
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      modifiedCount: modified.length,
      unchangedCount,
    },
    added,
    removed,
    modified,
  });
}

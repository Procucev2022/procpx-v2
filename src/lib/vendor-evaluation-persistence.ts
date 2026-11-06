import { writeD1BatchAtomically } from './d1-batch';
import {
  VENDOR_EVALUATION_AUDIT_INSERT_SQL,
  VENDOR_EVALUATION_INSERT_AFTER_UPDATE_SQL,
  VENDOR_QUALIFICATION_COMPARE_AND_SET_SQL,
} from './vendor-evaluation-persistence.constants';
import type { VendorEvaluationPersistenceInput } from '@app-types/lib/vendor-evaluation-persistence.types';

export async function persistVendorEvaluationAtomically(input: VendorEvaluationPersistenceInput): Promise<void> {
  const results = await writeD1BatchAtomically([
    {
      sql: VENDOR_QUALIFICATION_COMPARE_AND_SET_SQL,
      values: [
        input.vendorUpdate.qualificationStatus,
        input.vendorUpdate.qualificationScore,
        input.vendorUpdate.qualificationDecision,
        input.vendorUpdate.evaluatedAt,
        input.vendorUpdate.evaluatedById,
        input.vendorUpdate.empanelmentStatus,
        input.vendorUpdate.updatedAt,
        input.vendorId,
        input.tenantId,
        input.expectedVendorUpdatedAt,
      ],
    },
    {
      sql: VENDOR_EVALUATION_INSERT_AFTER_UPDATE_SQL,
      values: [JSON.stringify(input.evaluation), input.requiresVendorUpdate ? 1 : 0],
    },
    {
      sql: VENDOR_EVALUATION_AUDIT_INSERT_SQL,
      values: [
        input.audit.id,
        input.tenantId,
        input.audit.userId,
        input.audit.action,
        input.audit.description,
        JSON.stringify(input.audit.oldValue),
        JSON.stringify(input.audit.newValue),
        input.audit.userAgent,
        input.audit.createdAt,
        input.evaluation.id,
        input.tenantId,
      ],
    },
  ]);
  const expectedVendorChanges = input.requiresVendorUpdate ? 1 : 0;
  if (Number(results[0]?.meta?.changes || 0) !== expectedVendorChanges ||
      Number(results[1]?.meta?.changes || 0) !== 1 || Number(results[2]?.meta?.changes || 0) !== 1) {
    throw new Error();
  }
}

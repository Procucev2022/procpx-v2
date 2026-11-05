export const RFQ_TRANSITION_ALLOWED_FIELDS = [
  'status', 'releasedAt', 'title', 'scopeOfWork', 'submissionDeadline',
  'clarificationDeadline', 'deliveryRequirement', 'paymentTerms', 'taxTerms',
] as const;

export const RFQ_INVITATION_MARK_RELEASED_SQL = `
  UPDATE "rfq_vendors"
  SET "invitationStatus" = 'INVITED'
  WHERE "rfqId" = ? AND "tenantId" = ?
    AND EXISTS (
      SELECT 1 FROM "rfqs"
      WHERE "id" = ? AND "tenantId" = ? AND "status" = 'RELEASED'
    )
`;

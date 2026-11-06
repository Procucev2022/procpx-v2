export const DEFAULT_VENDOR_DASHBOARD_PAGE_SIZE = 25;
export const MAX_VENDOR_DASHBOARD_PAGE_SIZE = 50;

export const VENDOR_DASHBOARD_COUNTS_SQL = `
  WITH invited_rfqs AS (
    SELECT
      r."id", r."tenantId", r."submissionDeadline",
      (SELECT q."id" FROM "quotes" q
        WHERE q."tenantId" = r."tenantId" AND q."rfqId" = r."id" AND q."vendorId" = iv."vendorId"
        ORDER BY q."quoteVersion" DESC, q."id" DESC LIMIT 1) AS "latestQuoteId",
      (SELECT nr."id" FROM "negotiation_rounds" nr
        JOIN "negotiations" n ON n."id" = nr."negotiationId" AND n."tenantId" = nr."tenantId"
        WHERE n."tenantId" = r."tenantId" AND n."rfqId" = r."id" AND nr."vendorId" = iv."vendorId"
        ORDER BY nr."roundNumber" DESC, nr."id" DESC LIMIT 1) AS "latestRoundId",
      (SELECT p."id" FROM "ppos" p
        WHERE p."tenantId" = r."tenantId" AND p."rfqId" = r."id" AND p."vendorId" = iv."vendorId"
        ORDER BY p."createdAt" DESC, p."id" DESC LIMIT 1) AS "latestPpoId"
    FROM "rfqs" r
    JOIN "rfq_vendors" iv ON iv."rfqId" = r."id" AND iv."tenantId" = r."tenantId"
    WHERE r."tenantId" = ? AND iv."vendorId" = ?
  ), rfq_counts AS (
    SELECT
      COALESCE(SUM(CASE WHEN q."id" IS NULL THEN 1 ELSE 0 END), 0) AS "newRfqs",
      COALESCE(SUM(CASE WHEN q."id" IS NULL AND r."submissionDeadline" <= ? THEN 1 ELSE 0 END), 0) AS "quotesDueSoon",
      COALESCE(SUM(CASE WHEN q."id" IS NOT NULL THEN 1 ELSE 0 END), 0) AS "quotesSubmitted",
      COALESCE(SUM(CASE WHEN n."nextResponsibleParty" = 'VENDOR' AND n."status" = 'ROUND_ACTIVE'
        AND COALESCE(n."revisedQuoteAmount", 0) = 0 THEN 1 ELSE 0 END), 0) AS "negotiationsAwaitingVendor",
      COALESCE(SUM(CASE WHEN n."isFinalOffer" = 1 AND (n."buyerDecision" IS NULL
        OR n."buyerDecision" IN ('PENDING_BUYER_DECISION', 'FINAL_ACCEPTANCE_PENDING')) THEN 1 ELSE 0 END), 0) AS "finalOffersAwaitingBuyer",
      COALESCE(SUM(CASE WHEN n."buyerDecision" = 'ACCEPTED' AND p."id" IS NULL THEN 1 ELSE 0 END), 0) AS "quotesAcceptedPpoAwaited"
    FROM invited_rfqs r
    LEFT JOIN "quotes" q ON q."id" = r."latestQuoteId" AND q."tenantId" = r."tenantId"
    LEFT JOIN "negotiation_rounds" n ON n."id" = r."latestRoundId" AND n."tenantId" = r."tenantId"
    LEFT JOIN "ppos" p ON p."id" = r."latestPpoId" AND p."tenantId" = r."tenantId"
  )
  SELECT
    rfq_counts."newRfqs", rfq_counts."quotesDueSoon", rfq_counts."quotesSubmitted",
    rfq_counts."negotiationsAwaitingVendor", rfq_counts."finalOffersAwaitingBuyer",
    rfq_counts."quotesAcceptedPpoAwaited",
    (SELECT COUNT(*) FROM "ppos" p WHERE p."tenantId" = ? AND p."vendorId" = ?
      AND (p."vendorStatus" = 'PENDING_VENDOR_ACCEPTANCE' OR (p."status" = 'ISSUED' AND p."vendorAcceptedAt" IS NULL))) AS "pposAwaitingAcceptance",
    (SELECT COUNT(*) FROM "ppos" p WHERE p."tenantId" = ? AND p."vendorId" = ?
      AND (p."vendorStatus" = 'ACCEPTED_BY_VENDOR' OR p."status" = 'CONFIRMED')) AS "acceptedPpos"
  FROM rfq_counts
`;

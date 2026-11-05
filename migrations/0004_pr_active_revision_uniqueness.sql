-- Prevent multiple active PRs being created concurrently from the same BOQ revision.
-- A read-only pre-migration audit found no duplicate active revision/tenant pairs.
-- Rejected and cancelled PRs remain eligible for a later retry; existing rows are retained.
CREATE UNIQUE INDEX IF NOT EXISTS "procurement_requests_one_active_per_revision_key"
  ON "procurement_requests" ("tenantId", "boqRevisionId")
  WHERE "status" NOT IN ('PR_REJECTED', 'CANCELLED');

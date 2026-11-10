# proCPX Product Acceptance Checklist

Updated: 2026-11-10

This checklist is derived from the routes, screens, migrations, and automated tests in this checkout. No product requirements or approved acceptance backlog was found in the repository, so this is an evidence map, not a claim that every business requirement is known or accepted.

## Workflow inventory

| Module | Implementation evidence | Verification state | Acceptance work still needed |
| --- | --- | --- | --- |
| Tenant setup, users, roles, and permissions | Authentication, user administration, tenant-scoped APIs, role checks | Unit tests; central D1 workflow includes role and tenant-isolation checks | Confirm the required production role matrix and tenant onboarding rules |
| Categories, UOMs, projects, and cost centres | Master-data and project APIs and screens; tenant/project uniqueness indexes | Unit tests; local D1 integrity; central workflow creates project and cost-centre records | Confirm required category/UOM catalogs, project fields, and code-allocation rules |
| BOQ authoring and revision lifecycle | Manual, template, standard-library, drawing, validation, revision, approval, and upload routes | Unit tests; focused upload SQL probe; central D1 workflow covers BOQ creation and approval | Run isolated D1 acceptance for every ingestion path, revision conflict, rejection, and recovery branch |
| Budget allocation and approvals | Contribution, approval, transaction, reversal, and budget-versus-actual routes | Unit tests; local integrity; report query/page regressions | Run isolated D1 cases for submit, each approval/rejection, reversal, and reconciliation against old records |
| Purchase requests | PR create, edit, approval, rejection, release, and register routes | Unit tests; central D1 workflow covers approved PR and release to sourcing | Confirm return-for-correction and resubmission acceptance rules in a full D1 journey |
| RFQ sourcing and quotations | RFQ create/release, vendor invitations, quote submission, comparison, negotiation, re-RFQ, and rate lock | Unit tests; central D1 workflow covers RFQ, three vendors/quotes, negotiation, buyer acceptance, and rate lock | Run isolated D1 acceptance for duplicate delivery, quote revisions, vendor withdrawal, and all rejection branches |
| Awards and PPOs | Award recommendation/approval and PPO issue, vendor action, completion, and cancellation routes | Unit tests; central D1 workflow covers award approval and PPO issuance | Run isolated D1 acceptance for duplicate award/PPO attempts, vendor acceptance, completion, cancellation, and recovery |
| Vendor directory, qualification, evaluation, and ratings | Buyer/vendor APIs, profile, eligible-PPO and rating routes | Unit tests; local integrity | Run a full D1 vendor lifecycle including qualification changes, rating approval, and tenant/vendor visibility |
| Rate cards and direct procurement | Rate-card submission, review, comparison, matching, and direct PPO routes | Unit tests | Run a full D1 rate-card lifecycle including rejection/revision, matching, direct PPO, and replay behavior |
| Auctions | Auction creation, bids, terms, vendor portal, and scheduled lifecycle transitions | Unit tests; scheduled transitions run through the Worker cron handler | Run isolated D1 lifecycle covering invite, sealed bids, deadline extension, scheduled open/close, and unauthorized reads |
| Notifications and audit history | Structured logger, audit inserts, notification outbox, scheduled dispatcher | Unit tests; isolated SQLite execution of actual outbox SQL covers crash recovery, batch rollback, retry, and idempotent delivery | Validate the dispatcher against a Cloudflare D1 integration environment and confirm production delivery/retention expectations |
| Project documents and downloads | Project document upload/list/download/delete routes | Unit tests | Run isolated D1 plus R2 acceptance for ownership, missing object, retry, and cleanup behavior |

## Release blockers and evidence gaps

- The latest full local integrity check finds 44 application tables, 493 rows, no duplicate groups in 25 logical checks, no foreign-key violations, and no cross-tenant references. This is local evidence only; remote D1 could not be inspected because the `dev` Cloudflare account/token lacks the required permissions, an external blocker.
- The central isolated D1 scenario previously passed 70/70 checks through PPO issuance. It does not cover all ingestion paths, auction and rate-card lifecycles, actual-cost reconciliation, completion/reversal, or every reject/return branch.
- As of 2026-11-10, the full workspace quality gate passes: all 355 source files meet the per-file 90% statements, branches, functions, and lines thresholds. This confirms local automated coverage; it does not replace isolated D1 acceptance for the listed lifecycle paths.
- Production D1 Insights, invocation logs, read/write usage, and log retention have not been verified from this environment.
- Business acceptance remains open wherever rules are not stated in the code or an approved product specification. In particular, confirm which procurement methods, currencies/taxes, approval paths, vendor compliance documents, integrations, and reporting exports are required for initial release.

## Sign-off record

For each workflow, record the approved role, starting status, expected state transitions, persistence after reload, tenant boundary, failure recovery, and evidence link before calling it accepted. Keep D1 regression fixtures isolated from shared or production data.

-- Isolated, clearly labelled regression data for .wrangler/e2e-d1 only.
-- Every row uses a stable fx- identifier and INSERT OR IGNORE, so reruns add only
-- missing fixture rows. This file must only be executed with Wrangler --local.

INSERT OR IGNORE INTO tenants (id, name, slug, status, config, updatedAt)
VALUES
  ('fx-tenant-procpx', 'TEST FIXTURE - proCPX', 'procpx-regression-fixtures', 'ACTIVE', '{"currency":"INR"}', CURRENT_TIMESTAMP),
  ('fx-tenant-hospitality', 'TEST FIXTURE - Hospitality', 'hospitality-regression-fixtures', 'ACTIVE', '{"currency":"INR"}', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO users (id, tenantId, email, name, passwordHash, role, status, createdAt, updatedAt)
VALUES
  ('fx-user-project', 'fx-tenant-procpx', 'project.user@test.procpx.local', 'Fixture Project User', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'PROJECT_USER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-approver', 'fx-tenant-procpx', 'project.approver@test.procpx.local', 'Fixture Project Approver', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'PROJECT_APPROVER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-category-manager', 'fx-tenant-procpx', 'category.manager@test.procpx.local', 'Fixture Category Manager', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'CATEGORY_MANAGER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-procurement', 'fx-tenant-procpx', 'procurement.user@test.procpx.local', 'Fixture Procurement User', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'PROCUREMENT_USER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-finance', 'fx-tenant-procpx', 'finance.user@test.procpx.local', 'Fixture Finance User', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'FINANCE_USER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-client-admin', 'fx-tenant-procpx', 'client.admin@test.procpx.local', 'Fixture Client Admin', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'CLIENT_ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-super-admin', 'fx-tenant-procpx', 'super.admin@test.procpx.local', 'Fixture Super Admin', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'SUPER_ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-viewer', 'fx-tenant-procpx', 'viewer@test.procpx.local', 'Fixture Viewer', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'VIEWER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-hospitality-project', 'fx-tenant-hospitality', 'hospitality.user@test.procpx.local', 'Fixture Hospitality Project User', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'PROJECT_USER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-hospitality-approver', 'fx-tenant-hospitality', 'hospitality.approver@test.procpx.local', 'Fixture Hospitality Approver', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'PROJECT_APPROVER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-hospitality-admin', 'fx-tenant-hospitality', 'hospitality.admin@test.procpx.local', 'Fixture Hospitality Admin', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'CLIENT_ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-vendor-1', 'fx-tenant-procpx', 'vendor.one@test.procpx.local', 'Fixture Vendor One', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'VENDOR', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-vendor-2', 'fx-tenant-procpx', 'vendor.two@test.procpx.local', 'Fixture Vendor Two', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'VENDOR', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-user-vendor-3', 'fx-tenant-procpx', 'vendor.three@test.procpx.local', 'Fixture Vendor Three', '$2b$10$fJXQYa3iQFQNL82aOGx1A.BoJP8YoOrmlc7mfjGc3BS3HTzxVjK1.', 'VENDOR', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO categories (id, tenantId, name, code, level, isActive, sortOrder, updatedAt)
VALUES
  ('fx-category-civil', 'fx-tenant-procpx', 'TEST FIXTURE - Civil', 'FX-CIVIL', 1, true, 1, CURRENT_TIMESTAMP),
  ('fx-category-electrical', 'fx-tenant-procpx', 'TEST FIXTURE - Electrical', 'FX-ELECTRICAL', 1, true, 2, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO projects (id, tenantId, projectCode, name, description, sector, projectType, city, state, country, budget, currency, status, createdAt, updatedAt, createdBy)
VALUES
  ('fx-project-branch', 'fx-tenant-procpx', 'FX-P-0001', 'TEST FIXTURE - Bengaluru Branch', 'Local D1 regression fixture', 'RETAIL', 'FIT_OUT', 'Bengaluru', 'Karnataka', 'India', 250000, 'INR', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-project'),
  ('fx-project-hospitality', 'fx-tenant-hospitality', 'FX-P-0002', 'TEST FIXTURE - Hospitality Site', 'Local second-tenant isolation fixture', 'HOSPITALITY', 'FIT_OUT', 'Mysuru', 'Karnataka', 'India', 150000, 'INR', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-hospitality-project');

INSERT OR IGNORE INTO cost_centres (id, tenantId, projectId, code, name, description, status, createdAt, updatedAt, createdBy)
VALUES
  ('fx-cost-centre-civil', 'fx-tenant-procpx', 'fx-project-branch', 'FX-CC-001', 'TEST FIXTURE - Civil', 'Local D1 regression fixture', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-project'),
  ('fx-cost-centre-electrical', 'fx-tenant-procpx', 'fx-project-branch', 'FX-CC-002', 'TEST FIXTURE - Electrical', 'Local D1 regression fixture', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-project');

INSERT OR IGNORE INTO boqs (id, tenantId, projectId, costCentreId, boqCode, title, description, category, scope, status, createdAt, updatedAt, createdBy)
VALUES ('fx-boq-branch', 'fx-tenant-procpx', 'fx-project-branch', 'fx-cost-centre-civil', 'FX-BOQ-0001', 'TEST FIXTURE - Branch Fitout', 'Local D1 regression fixture', 'TEST FIXTURE', 'Civil and electrical sample works', 'APPROVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-project');

INSERT OR IGNORE INTO boq_revisions (id, tenantId, boqId, costCentreId, revisionNumber, revisionCode, status, preparationStatus, budgetStatus, prStatus, sourceType, totalLines, validLines, errorLines, warningLines, createdAt, updatedAt, createdById)
VALUES ('fx-boq-revision-1', 'fx-tenant-procpx', 'fx-boq-branch', 'fx-cost-centre-civil', 1, 'FX-BOQ-0001-R1', 'APPROVED', 'COMPLETE', 'APPROVED', 'PR_APPROVED', 'MANUAL', 3, 3, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-project');

INSERT OR IGNORE INTO boq_lines (id, tenantId, boqRevisionId, lineNumber, originalDescription, standardDescription, specification, categoryId, uomRaw, quantity, validationStatus, updatedAt)
VALUES
  ('fx-boq-line-1', 'fx-tenant-procpx', 'fx-boq-revision-1', '1', 'Floor tile installation', 'TEST FIXTURE - Floor tile installation', 'Commercial grade vitrified tile', 'fx-category-civil', 'SQFT', 100, 'VALID', CURRENT_TIMESTAMP),
  ('fx-boq-line-2', 'fx-tenant-procpx', 'fx-boq-revision-1', '2', 'LED light points', 'TEST FIXTURE - LED light points', 'Energy efficient LED downlight', 'fx-category-electrical', 'NOS', 20, 'VALID', CURRENT_TIMESTAMP),
  ('fx-boq-line-3', 'fx-tenant-procpx', 'fx-boq-revision-1', '3', 'Electrical wiring', 'TEST FIXTURE - Electrical wiring', 'Copper conductor wiring', 'fx-category-electrical', 'RMT', 200, 'VALID', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO procurement_requests (id, tenantId, prNumber, projectId, costCentreId, boqId, boqRevisionId, title, purpose, totalEstimatedValue, totalLines, status, requestedBy, requestedDate, projectApprovedAt, projectApprovedBy, createdAt, updatedAt)
VALUES ('fx-pr-approved', 'fx-tenant-procpx', 'FX-PR-0001', 'fx-project-branch', 'fx-cost-centre-civil', 'fx-boq-branch', 'fx-boq-revision-1', 'TEST FIXTURE - Branch fitout procurement', 'PROCUREMENT_SOURCING', 100000, 3, 'PR_APPROVED', 'fx-user-project', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-approver', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO pr_lines (id, tenantId, prId, projectId, costCentreId, boqId, boqRevisionId, boqLineId, lineNumber, itemDescription, specification, category, uom, quantity, estimatedRate, estimatedValue)
VALUES
  ('fx-pr-line-1', 'fx-tenant-procpx', 'fx-pr-approved', 'fx-project-branch', 'fx-cost-centre-civil', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-1', '1', 'TEST FIXTURE - Floor tile installation', 'Commercial grade vitrified tile', 'Civil', 'SQFT', 100, 200, 20000),
  ('fx-pr-line-2', 'fx-tenant-procpx', 'fx-pr-approved', 'fx-project-branch', 'fx-cost-centre-electrical', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-2', '2', 'TEST FIXTURE - LED light points', 'Energy efficient LED downlight', 'Electrical', 'NOS', 20, 1500, 30000),
  ('fx-pr-line-3', 'fx-tenant-procpx', 'fx-pr-approved', 'fx-project-branch', 'fx-cost-centre-electrical', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-3', '3', 'TEST FIXTURE - Electrical wiring', 'Copper conductor wiring', 'Electrical', 'RMT', 200, 250, 50000);

INSERT OR IGNORE INTO vendors (id, tenantId, code, name, email, city, state, categories, status, vendorType, onboardingStatus, qualificationStatus, createdAt, updatedAt)
VALUES
  ('fx-vendor-1', 'fx-tenant-procpx', 'FX-V-001', 'TEST FIXTURE - Vendor One', 'vendor.one@test.procpx.local', 'Bengaluru', 'Karnataka', '["Civil","Electrical"]', 'ACTIVE', 'CLIENT_VENDOR', 'APPROVED', 'QUALIFIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-vendor-2', 'fx-tenant-procpx', 'FX-V-002', 'TEST FIXTURE - Vendor Two', 'vendor.two@test.procpx.local', 'Bengaluru', 'Karnataka', '["Civil","Electrical"]', 'ACTIVE', 'CLIENT_VENDOR', 'APPROVED', 'QUALIFIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-vendor-3', 'fx-tenant-procpx', 'FX-V-003', 'TEST FIXTURE - Vendor Three', 'vendor.three@test.procpx.local', 'Bengaluru', 'Karnataka', '["Civil","Electrical"]', 'ACTIVE', 'CLIENT_VENDOR', 'APPROVED', 'QUALIFIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE users SET vendorId = 'fx-vendor-1' WHERE id = 'fx-user-vendor-1' AND vendorId IS NULL;
UPDATE users SET vendorId = 'fx-vendor-2' WHERE id = 'fx-user-vendor-2' AND vendorId IS NULL;
UPDATE users SET vendorId = 'fx-vendor-3' WHERE id = 'fx-user-vendor-3' AND vendorId IS NULL;

INSERT OR IGNORE INTO rfqs (id, tenantId, projectId, boqRevisionId, rfqNumber, title, scopeOfWork, packageType, status, submissionDeadline, releasedAt, prId, totalLines, createdAt, updatedAt, createdById)
VALUES ('fx-rfq-0001', 'fx-tenant-procpx', 'fx-project-branch', 'fx-boq-revision-1', 'FX-RFQ-0001', 'TEST FIXTURE - Branch fitout RFQ', 'Local D1 regression fixture for quotation comparison', 'SELECTED_LINES', 'AWARDED', datetime('now', '+30 days'), CURRENT_TIMESTAMP, 'fx-pr-approved', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'fx-user-procurement');

INSERT OR IGNORE INTO rfq_lines (id, tenantId, rfqId, projectId, costCentreId, boqId, boqRevisionId, boqLineId, prLineId, lineNumber, description, specification, category, uom, quantity, benchmarkRate, benchmarkAmount)
VALUES
  ('fx-rfq-line-1', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-project-branch', 'fx-cost-centre-civil', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-1', 'fx-pr-line-1', '1', 'TEST FIXTURE - Floor tile installation', 'Commercial grade vitrified tile', 'Civil', 'SQFT', 100, 200, 20000),
  ('fx-rfq-line-2', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-project-branch', 'fx-cost-centre-electrical', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-2', 'fx-pr-line-2', '2', 'TEST FIXTURE - LED light points', 'Energy efficient LED downlight', 'Electrical', 'NOS', 20, 1500, 30000),
  ('fx-rfq-line-3', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-project-branch', 'fx-cost-centre-electrical', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-3', 'fx-pr-line-3', '3', 'TEST FIXTURE - Electrical wiring', 'Copper conductor wiring', 'Electrical', 'RMT', 200, 250, 50000);

INSERT OR IGNORE INTO rfq_vendors (id, tenantId, rfqId, vendorId, invitationStatus, submissionStatus)
VALUES
  ('fx-rfq-vendor-1', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-1', 'INVITED', 'SUBMITTED'),
  ('fx-rfq-vendor-2', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-2', 'INVITED', 'SUBMITTED'),
  ('fx-rfq-vendor-3', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-3', 'INVITED', 'SUBMITTED');

INSERT OR IGNORE INTO quotes (id, tenantId, rfqId, vendorId, quoteNumber, quoteVersion, status, totalBaseAmount, taxAmount, totalQuoteAmount, paymentTermsOffered, deliveryLeadTimeDays, validUntil, submittedBy, submittedAt, createdAt, updatedAt)
VALUES
  ('fx-quote-1', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-1', 'FX-Q-0001', 1, 'SUBMITTED', 100000, 18000, 118000, '30 days', 21, datetime('now', '+60 days'), 'fx-user-vendor-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-quote-2', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-2', 'FX-Q-0002', 1, 'SUBMITTED', 103000, 18540, 121540, '30 days', 18, datetime('now', '+60 days'), 'fx-user-vendor-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx-quote-3', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-3', 'FX-Q-0003', 1, 'SUBMITTED', 98000, 17640, 115640, '45 days', 14, datetime('now', '+60 days'), 'fx-user-vendor-3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO quote_lines (id, tenantId, quoteId, rfqLineId, unitRate, taxPercent, lineTotal)
VALUES
  ('fx-quote-line-11', 'fx-tenant-procpx', 'fx-quote-1', 'fx-rfq-line-1', 200, 18, 20000), ('fx-quote-line-12', 'fx-tenant-procpx', 'fx-quote-1', 'fx-rfq-line-2', 1500, 18, 30000), ('fx-quote-line-13', 'fx-tenant-procpx', 'fx-quote-1', 'fx-rfq-line-3', 250, 18, 50000),
  ('fx-quote-line-21', 'fx-tenant-procpx', 'fx-quote-2', 'fx-rfq-line-1', 210, 18, 21000), ('fx-quote-line-22', 'fx-tenant-procpx', 'fx-quote-2', 'fx-rfq-line-2', 1550, 18, 31000), ('fx-quote-line-23', 'fx-tenant-procpx', 'fx-quote-2', 'fx-rfq-line-3', 255, 18, 51000),
  ('fx-quote-line-31', 'fx-tenant-procpx', 'fx-quote-3', 'fx-rfq-line-1', 190, 18, 19000), ('fx-quote-line-32', 'fx-tenant-procpx', 'fx-quote-3', 'fx-rfq-line-2', 1450, 18, 29000), ('fx-quote-line-33', 'fx-tenant-procpx', 'fx-quote-3', 'fx-rfq-line-3', 250, 18, 50000);

INSERT OR IGNORE INTO negotiations (id, tenantId, rfqId, status, currentRound, targetSavingsPercent, bestQuoteAmount, createdAt, updatedAt)
VALUES ('fx-negotiation-1', 'fx-tenant-procpx', 'fx-rfq-0001', 'COMPLETED', 1, 2, 115640, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO negotiation_rounds (id, tenantId, negotiationId, vendorId, roundNumber, previousQuoteAmount, counterOfferAmount, revisedQuoteAmount, savingsAmount, savingsPercent, status, notes, isFinalOffer, createdAt, updatedAt)
VALUES ('fx-negotiation-round-1', 'fx-tenant-procpx', 'fx-negotiation-1', 'fx-vendor-3', 1, 115640, 114000, 115640, 0, 0, 'ROUND_COMPLETED', 'TEST FIXTURE - Negotiation history', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO award_recommendations (id, tenantId, rfqId, recommendedVendorId, originalQuoteAmount, finalNegotiatedAmount, benchmarkAmount, totalSavingsAmount, savingsPercent, justification, status, submittedById, submittedAt, approvedById, approvedAt, approvalRemarks, createdAt, updatedAt)
VALUES ('fx-award-1', 'fx-tenant-procpx', 'fx-rfq-0001', 'fx-vendor-3', 115640, 115640, 118000, 2360, 2, 'TEST FIXTURE - Best evaluated commercial offer', 'APPROVED', 'fx-user-procurement', CURRENT_TIMESTAMP, 'fx-user-approver', CURRENT_TIMESTAMP, 'Fixture approval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ppos (id, tenantId, projectId, costCentreId, boqId, boqRevisionId, rfqId, vendorId, awardRecommendationId, prId, ppoNumber, title, totalValue, currency, status, vendorStatus, vendorAcceptedAt, createdById, createdAt, updatedAt)
VALUES ('fx-ppo-1', 'fx-tenant-procpx', 'fx-project-branch', 'fx-cost-centre-civil', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-rfq-0001', 'fx-vendor-3', 'fx-award-1', 'fx-pr-approved', 'FX-PPO-0001', 'TEST FIXTURE - Branch fitout order', 115640, 'INR', 'ISSUED', 'ACCEPTED', CURRENT_TIMESTAMP, 'fx-user-procurement', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ppo_lines (id, tenantId, ppoId, projectId, costCentreId, boqId, boqRevisionId, boqLineId, prLineId, rfqLineId, vendorId, lineNumber, itemDescription, specification, category, uom, orderedQuantity, orderedUnitRate, orderedAmount, taxAmount, totalOrderValue, status, updatedAt)
VALUES
  ('fx-ppo-line-1', 'fx-tenant-procpx', 'fx-ppo-1', 'fx-project-branch', 'fx-cost-centre-civil', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-1', 'fx-pr-line-1', 'fx-rfq-line-1', 'fx-vendor-3', '1', 'TEST FIXTURE - Floor tile installation', 'Commercial grade vitrified tile', 'Civil', 'SQFT', 100, 190, 19000, 3420, 22420, 'ISSUED', CURRENT_TIMESTAMP),
  ('fx-ppo-line-2', 'fx-tenant-procpx', 'fx-ppo-1', 'fx-project-branch', 'fx-cost-centre-electrical', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-2', 'fx-pr-line-2', 'fx-rfq-line-2', 'fx-vendor-3', '2', 'TEST FIXTURE - LED light points', 'Energy efficient LED downlight', 'Electrical', 'NOS', 20, 1450, 29000, 5220, 34220, 'ISSUED', CURRENT_TIMESTAMP),
  ('fx-ppo-line-3', 'fx-tenant-procpx', 'fx-ppo-1', 'fx-project-branch', 'fx-cost-centre-electrical', 'fx-boq-branch', 'fx-boq-revision-1', 'fx-boq-line-3', 'fx-pr-line-3', 'fx-rfq-line-3', 'fx-vendor-3', '3', 'TEST FIXTURE - Electrical wiring', 'Copper conductor wiring', 'Electrical', 'RMT', 200, 250, 50000, 9000, 59000, 'ISSUED', CURRENT_TIMESTAMP);

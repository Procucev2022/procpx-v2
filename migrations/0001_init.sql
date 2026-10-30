-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "vendorId" TEXT,
    CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "users_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sector" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "location" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "areaSqFt" REAL,
    "costCentre" TEXT,
    "projectOwner" TEXT,
    "budget" REAL,
    "currency" TEXT DEFAULT 'INR',
    "businessUnit" TEXT,
    "numberOfFloors" INTEGER,
    "numberOfUnits" INTEGER,
    "startDate" DATETIME,
    "targetCompletion" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "projects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_teams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectRole" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "project_teams_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT,
    CONSTRAINT "project_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "boqs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT,
    "boqCode" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "category" TEXT,
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "purpose" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "boqs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "boqs_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "boq_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "boqId" TEXT NOT NULL,
    "costCentreId" TEXT,
    "revisionNumber" INTEGER NOT NULL,
    "revisionCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preparationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "budgetStatus" TEXT NOT NULL DEFAULT 'NOT_ADDED_TO_BUDGET',
    "prStatus" TEXT NOT NULL DEFAULT 'PR_NOT_CREATED',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceFile" TEXT,
    "sourceReference" TEXT,
    "sourceConfidence" REAL,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "qualityScore" REAL,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "validLines" INTEGER NOT NULL DEFAULT 0,
    "errorLines" INTEGER NOT NULL DEFAULT 0,
    "warningLines" INTEGER NOT NULL DEFAULT 0,
    "originalFileName" TEXT,
    "originalFilePath" TEXT,
    "originalFileSize" INTEGER,
    "originalFileHash" TEXT,
    "uploadedAt" DATETIME,
    "columnMapping" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    CONSTRAINT "boq_revisions_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "boqs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "boq_revisions_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "boq_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "boq_revisions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "boq_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "boqRevisionId" TEXT NOT NULL,
    "lineNumber" TEXT NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "standardDescription" TEXT,
    "specification" TEXT,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "uomId" TEXT,
    "uomRaw" TEXT,
    "quantity" REAL,
    "location" TEXT,
    "drawingReference" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "material" TEXT,
    "grade" TEXT,
    "remarks" TEXT,
    "itemCode" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceReference" TEXT,
    "confidenceScore" REAL,
    "benchmarkEligible" BOOLEAN NOT NULL DEFAULT true,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "validationMessages" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "aiSuggestedDescription" TEXT,
    "aiSuggestedSpec" TEXT,
    "aiReason" TEXT,
    "aiConfidence" REAL,
    "userOverride" TEXT,
    "userApprovedValue" TEXT,
    "aiUnitCost" REAL,
    "aiTotalCost" REAL,
    "costConfidence" REAL,
    "costSource" TEXT,
    "costMethod" TEXT,
    "costDate" DATETIME,
    "geography" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "boq_lines_boqRevisionId_fkey" FOREIGN KEY ("boqRevisionId") REFERENCES "boq_revisions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "boq_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "boq_lines_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "boq_lines_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uom_masters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "uom_masters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "uom_masters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "categories" TEXT,
    "experienceYears" INTEGER DEFAULT 5,
    "turnoverCrores" REAL DEFAULT 15.0,
    "performanceScore" REAL DEFAULT 88.0,
    "complianceStatus" TEXT NOT NULL DEFAULT 'COMPLIANT',
    "empanelmentStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "certifications" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "vendorType" TEXT NOT NULL DEFAULT 'CLIENT_VENDOR',
    "onboardingStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "qualificationStatus" TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
    "qualificationScore" REAL,
    "qualificationDecision" TEXT,
    "legalStructure" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "website" TEXT,
    "address" TEXT,
    "operatingLocation" TEXT,
    "capabilities" TEXT,
    "serviceCoverage" TEXT,
    "clientReferences" TEXT,
    "documents" TEXT,
    "evaluationNotes" TEXT,
    "evaluatedAt" DATETIME,
    "evaluatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "boqRevisionId" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scopeOfWork" TEXT,
    "packageType" TEXT NOT NULL DEFAULT 'SELECTED_LINES',
    "packageName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submissionDeadline" DATETIME,
    "clarificationDeadline" DATETIME,
    "commercialValidityDays" INTEGER DEFAULT 60,
    "deliveryRequirement" TEXT,
    "paymentTerms" TEXT,
    "taxTerms" TEXT,
    "requiredDocuments" TEXT,
    "technicalRequirements" TEXT,
    "commercialRequirements" TEXT,
    "estimatedBenchmarkValue" REAL DEFAULT 0,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "isReRfq" BOOLEAN NOT NULL DEFAULT false,
    "reRfqReason" TEXT,
    "originalRfqId" TEXT,
    "finalLockedAt" DATETIME,
    "finalLockedById" TEXT,
    "releasedAt" DATETIME,
    "prId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "rfqs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rfqs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rfqs_boqRevisionId_fkey" FOREIGN KEY ("boqRevisionId") REFERENCES "boq_revisions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rfqs_prId_fkey" FOREIGN KEY ("prId") REFERENCES "procurement_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCentreId" TEXT,
    "boqId" TEXT,
    "boqRevisionId" TEXT,
    "boqLineId" TEXT,
    "prLineId" TEXT,
    "lineNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "uom" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "benchmarkRate" REAL,
    "benchmarkAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rfq_lines_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rfq_lines_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "boq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rfq_lines_prLineId_fkey" FOREIGN KEY ("prLineId") REFERENCES "pr_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq_vendors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitationStatus" TEXT NOT NULL DEFAULT 'INVITED',
    "submissionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "rfq_vendors_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rfq_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "quoteVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "totalBaseAmount" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "totalQuoteAmount" REAL NOT NULL DEFAULT 0,
    "commercialTerms" TEXT,
    "paymentTermsOffered" TEXT,
    "deliveryLeadTimeDays" INTEGER,
    "validUntil" DATETIME,
    "submittedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "quotes_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quotes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "unitRate" REAL NOT NULL,
    "taxPercent" REAL NOT NULL DEFAULT 18.0,
    "discountPercent" REAL NOT NULL DEFAULT 0.0,
    "lineTotal" REAL NOT NULL,
    "remarks" TEXT,
    CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quote_lines_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "rfq_lines" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "targetSavingsPercent" REAL,
    "bestQuoteAmount" REAL,
    "concludedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "negotiations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "negotiation_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "deadline" DATETIME,
    "targetPrice" REAL,
    "previousQuoteAmount" REAL NOT NULL,
    "counterOfferAmount" REAL,
    "revisedQuoteAmount" REAL,
    "savingsAmount" REAL DEFAULT 0,
    "savingsPercent" REAL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ROUND_ACTIVE',
    "notes" TEXT,
    "isFinalOffer" BOOLEAN NOT NULL DEFAULT false,
    "buyerDecision" TEXT,
    "buyerDecisionDate" DATETIME,
    "buyerDecisionRemarks" TEXT,
    "nextResponsibleParty" TEXT,
    "lineItemsJson" TEXT,
    "submittedByVendor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "negotiation_rounds_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "negotiation_rounds_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "auctionNumber" TEXT NOT NULL,
    "auctionType" TEXT NOT NULL DEFAULT 'REVERSE_AUCTION',
    "auctionCategory" TEXT NOT NULL DEFAULT 'RFQ_TOTAL_WISE',
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "scrollingText" TEXT,
    "refreshIntervalSeconds" INTEGER NOT NULL DEFAULT 10,
    "quantityType" TEXT NOT NULL DEFAULT 'FULL',
    "hasStartPrice" BOOLEAN NOT NULL DEFAULT true,
    "startingPrice" REAL NOT NULL,
    "hasLeadingPrice" BOOLEAN NOT NULL DEFAULT true,
    "hasMinBidReduction" BOOLEAN NOT NULL DEFAULT true,
    "minDecrement" REAL NOT NULL DEFAULT 1000,
    "hasAutoExtension" BOOLEAN NOT NULL DEFAULT true,
    "autoExtensionMinutes" INTEGER NOT NULL DEFAULT 5,
    "hasBidLimit" BOOLEAN NOT NULL DEFAULT false,
    "maxBidsPerParticipant" INTEGER,
    "inviteProjectUser" BOOLEAN NOT NULL DEFAULT false,
    "projectUserId" TEXT,
    "nonInvitedJustification" TEXT,
    "termsAndConditions" TEXT,
    "documents" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "bidVisibility" TEXT NOT NULL DEFAULT 'RANK_ONLY',
    "currentLowestBid" REAL,
    "currentLeadingBid" REAL,
    "currentWinningVendorId" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "scheduledEndTime" DATETIME,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "auctions_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auction_vendors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" DATETIME,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "bidsCount" INTEGER NOT NULL DEFAULT 0,
    "lastBidAmount" REAL,
    "lastBidAt" DATETIME,
    "bestBidAmount" REAL,
    "bestBidRank" INTEGER,
    CONSTRAINT "auction_vendors_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "auction_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auction_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "rfqLineId" TEXT,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "brand" TEXT,
    "uom" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "startPrice" REAL,
    "currentLeadingBid" REAL,
    "currentWinningVendorId" TEXT,
    CONSTRAINT "auction_items_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "auctionItemId" TEXT,
    "bidNumber" INTEGER NOT NULL,
    "bidAmount" REAL NOT NULL,
    "rank" INTEGER,
    "ipAddress" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auction_bids_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "auction_bids_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "auction_bids_auctionItemId_fkey" FOREIGN KEY ("auctionItemId") REFERENCES "auction_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "award_recommendations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "recommendedVendorId" TEXT NOT NULL,
    "originalQuoteAmount" REAL NOT NULL,
    "finalNegotiatedAmount" REAL NOT NULL,
    "benchmarkAmount" REAL NOT NULL,
    "totalSavingsAmount" REAL NOT NULL,
    "savingsPercent" REAL NOT NULL,
    "technicalStatus" TEXT NOT NULL DEFAULT 'COMPLIANT',
    "commercialStatus" TEXT NOT NULL DEFAULT 'BEST_VALUE',
    "justification" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "submittedById" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "approvalRemarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "award_recommendations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "award_recommendations_recommendedVendorId_fkey" FOREIGN KEY ("recommendedVendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ppos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT,
    "boqId" TEXT,
    "boqRevisionId" TEXT,
    "rfqId" TEXT,
    "vendorId" TEXT NOT NULL,
    "awardRecommendationId" TEXT,
    "prId" TEXT,
    "rateCardId" TEXT,
    "sourcingType" TEXT NOT NULL DEFAULT 'REGULAR_RFQ',
    "ppoNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalValue" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deliveryTerms" TEXT,
    "paymentTerms" TEXT,
    "taxDetails" TEXT,
    "issuedAt" DATETIME,
    "completedAt" DATETIME,
    "vendorStatus" TEXT DEFAULT 'PENDING_VENDOR_ACCEPTANCE',
    "vendorAcceptedAt" DATETIME,
    "vendorAcceptedBy" TEXT,
    "vendorAcceptedVersion" INTEGER DEFAULT 1,
    "vendorIssueRemarks" TEXT,
    "vendorIssueRaisedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ppos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ppos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ppos_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppos_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ppos_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ppos_awardRecommendationId_fkey" FOREIGN KEY ("awardRecommendationId") REFERENCES "award_recommendations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppos_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "vendor_rate_cards" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppos_prId_fkey" FOREIGN KEY ("prId") REFERENCES "procurement_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ppo_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "ppoId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT,
    "boqId" TEXT,
    "boqRevisionId" TEXT,
    "boqLineId" TEXT,
    "prLineId" TEXT,
    "rfqLineId" TEXT,
    "vendorId" TEXT NOT NULL,
    "lineNumber" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "specification" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "uom" TEXT NOT NULL,
    "orderedQuantity" REAL NOT NULL,
    "orderedUnitRate" REAL NOT NULL,
    "orderedAmount" REAL NOT NULL,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "totalOrderValue" REAL NOT NULL DEFAULT 0,
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCompletionDate" DATETIME,
    "completedQuantity" REAL NOT NULL DEFAULT 0,
    "completedAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ppo_lines_ppoId_fkey" FOREIGN KEY ("ppoId") REFERENCES "ppos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "boq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_prLineId_fkey" FOREIGN KEY ("prLineId") REFERENCES "pr_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "rfq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ppo_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "actual_cost_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "boqId" TEXT,
    "boqRevisionId" TEXT,
    "boqLineId" TEXT,
    "prId" TEXT,
    "prLineId" TEXT,
    "rfqId" TEXT,
    "rfqLineId" TEXT,
    "ppoId" TEXT,
    "ppoLineId" TEXT,
    "vendorId" TEXT,
    "uom" TEXT,
    "actualQuantity" REAL NOT NULL,
    "actualUnitRate" REAL NOT NULL,
    "actualAmount" REAL NOT NULL,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "totalActualAmount" REAL NOT NULL,
    "actualDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "completionReference" TEXT,
    "externalReference" TEXT,
    "erpDocumentNumber" TEXT,
    "erpDate" DATETIME,
    "integrationTimestamp" DATETIME,
    "documents" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'System User',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "actual_cost_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "boq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_prLineId_fkey" FOREIGN KEY ("prLineId") REFERENCES "pr_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "rfq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_ppoId_fkey" FOREIGN KEY ("ppoId") REFERENCES "ppos" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_ppoLineId_fkey" FOREIGN KEY ("ppoLineId") REFERENCES "ppo_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "actual_cost_transactions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cost_centres" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "areaSqFt" REAL,
    "location" TEXT,
    "floorZone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "cost_centres_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cost_centres_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "standard_boq_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "standardDescription" TEXT NOT NULL,
    "detailedSpecification" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "brandMake" TEXT,
    "benchmarkRate" REAL,
    "benchmarkEligibility" BOOLEAN NOT NULL DEFAULT true,
    "aiRefinementEligibility" BOOLEAN NOT NULL DEFAULT true,
    "costDrivers" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "standard_boq_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "approvedAmount" REAL NOT NULL DEFAULT 0,
    "pendingAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "budgets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_contributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT NOT NULL,
    "boqId" TEXT NOT NULL,
    "boqRevisionId" TEXT NOT NULL,
    "totalEstimatedValue" REAL NOT NULL,
    "acceptedEstimatedValue" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "submittedBy" TEXT,
    "projectApprovedAt" DATETIME,
    "projectApprovedBy" TEXT,
    "financeApprovedAt" DATETIME,
    "financeApprovedBy" TEXT,
    "rejectionReason" TEXT,
    "isSuperSeded" BOOLEAN NOT NULL DEFAULT false,
    "superSededByContributionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "budget_contributions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_contributions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_contributions_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_contributions_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "boqs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_contributions_boqRevisionId_fkey" FOREIGN KEY ("boqRevisionId") REFERENCES "boq_revisions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT NOT NULL,
    "boqId" TEXT,
    "boqRevisionId" TEXT,
    "boqLineId" TEXT,
    "contributionId" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "uom" TEXT DEFAULT 'NOS',
    "amount" REAL NOT NULL,
    "quantity" REAL,
    "rate" REAL,
    "budgetDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversalReason" TEXT,
    "reversedTransactionId" TEXT,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_transactions_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_transactions_boqRevisionId_fkey" FOREIGN KEY ("boqRevisionId") REFERENCES "boq_revisions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "budget_transactions_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "boq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "budget_transactions_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "budget_contributions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "approvalLevel" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_approvals_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "budget_contributions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "procurement_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "prNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCentreId" TEXT NOT NULL,
    "boqId" TEXT NOT NULL,
    "boqRevisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT DEFAULT 'PROCUREMENT_SOURCING',
    "totalEstimatedValue" REAL NOT NULL DEFAULT 0,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PR_DRAFT',
    "requestedBy" TEXT NOT NULL,
    "requestedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDate" DATETIME,
    "projectApprovedAt" DATETIME,
    "projectApprovedBy" TEXT,
    "rejectionReason" TEXT,
    "releasedAt" DATETIME,
    "releasedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "procurement_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "procurement_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "procurement_requests_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "procurement_requests_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "boqs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "procurement_requests_boqRevisionId_fkey" FOREIGN KEY ("boqRevisionId") REFERENCES "boq_revisions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pr_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCentreId" TEXT,
    "boqId" TEXT,
    "boqRevisionId" TEXT,
    "boqLineId" TEXT,
    "lineNumber" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "specification" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "uom" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "estimatedRate" REAL,
    "estimatedValue" REAL,
    "drawingReference" TEXT,
    "requiredDate" DATETIME,
    "costCentre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pr_lines_prId_fkey" FOREIGN KEY ("prId") REFERENCES "procurement_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pr_lines_boqLineId_fkey" FOREIGN KEY ("boqLineId") REFERENCES "boq_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pr_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pr_approvals_prId_fkey" FOREIGN KEY ("prId") REFERENCES "procurement_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_evaluations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "evaluationType" TEXT NOT NULL DEFAULT 'INITIAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "businessProfileScore" REAL,
    "financialStrengthScore" REAL,
    "previousClientsScore" REAL,
    "referencesScore" REAL,
    "technicalCapabilityScore" REAL,
    "complianceRiskScore" REAL,
    "overallWeightedScore" REAL,
    "qualificationOutcome" TEXT,
    "criteriaDetails" TEXT,
    "aiSummary" TEXT,
    "criticalRiskFlags" TEXT,
    "evaluatedBy" TEXT,
    "evaluatedAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "decisionRemarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_evaluations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ppo_vendor_ratings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ppoId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCentreId" TEXT,
    "qualityScore" REAL NOT NULL,
    "deliveryScore" REAL NOT NULL,
    "commercialComplianceScore" REAL NOT NULL,
    "responsivenessScore" REAL NOT NULL,
    "documentationClosureScore" REAL NOT NULL,
    "overallScore" REAL NOT NULL,
    "criteriaDetails" TEXT,
    "comments" TEXT,
    "supportingEvidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "ratedBy" TEXT NOT NULL,
    "ratedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ppo_vendor_ratings_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ppo_vendor_ratings_ppoId_fkey" FOREIGN KEY ("ppoId") REFERENCES "ppos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_rate_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "rateCardNumber" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "scope" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "approvalLevel" TEXT DEFAULT 'LEVEL_1_PROJECT',
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "terms" TEXT,
    "submittedBy" TEXT,
    "submittedAt" DATETIME,
    "projectApprovedBy" TEXT,
    "projectApprovedAt" DATETIME,
    "financeApprovedBy" TEXT,
    "financeApprovedAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectionReason" TEXT,
    "revertReason" TEXT,
    "justification" TEXT,
    "comparisonNotes" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_rate_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vendor_rate_cards_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_rate_card_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "standardBoqItemId" TEXT,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "uom" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "proposedRate" REAL,
    "historicalRate" REAL,
    "benchmarkRate" REAL,
    "comparisonRef" TEXT,
    "minQuantity" REAL DEFAULT 1,
    "maxQuantity" REAL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vendor_rate_card_items_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "vendor_rate_cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rate_card_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverName" TEXT,
    "approverEmail" TEXT,
    "action" TEXT NOT NULL,
    "remarks" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_card_approvals_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "vendor_rate_cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "targetRole" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "entityType" TEXT,
    "entityId" TEXT,
    "recordNumber" TEXT,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rfq_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT,
    "isVendorSent" BOOLEAN NOT NULL DEFAULT false,
    "vendorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rfq_messages_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenantId_projectCode_key" ON "projects"("tenantId", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "project_teams_projectId_userId_key" ON "project_teams"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "boqs_tenantId_boqCode_key" ON "boqs"("tenantId", "boqCode");

-- CreateIndex
CREATE UNIQUE INDEX "boq_revisions_boqId_revisionNumber_key" ON "boq_revisions"("boqId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "uom_masters_tenantId_code_key" ON "uom_masters"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_name_parentId_key" ON "categories"("tenantId", "name", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_tenantId_code_key" ON "vendors"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_tenantId_rfqNumber_key" ON "rfqs"("tenantId", "rfqNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_vendors_rfqId_vendorId_key" ON "rfq_vendors"("rfqId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_rfqId_vendorId_quoteVersion_key" ON "quotes"("rfqId", "vendorId", "quoteVersion");

-- CreateIndex
CREATE UNIQUE INDEX "auctions_tenantId_auctionNumber_key" ON "auctions"("tenantId", "auctionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "auction_vendors_auctionId_vendorId_key" ON "auction_vendors"("auctionId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "ppos_tenantId_ppoNumber_key" ON "ppos"("tenantId", "ppoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "actual_cost_transactions_tenantId_transactionCode_key" ON "actual_cost_transactions"("tenantId", "transactionCode");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centres_tenantId_projectId_code_key" ON "cost_centres"("tenantId", "projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "standard_boq_items_tenantId_itemCode_key" ON "standard_boq_items"("tenantId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "budget_transactions_tenantId_transactionCode_key" ON "budget_transactions"("tenantId", "transactionCode");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_requests_tenantId_prNumber_key" ON "procurement_requests"("tenantId", "prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ppo_vendor_ratings_ppoId_key" ON "ppo_vendor_ratings"("ppoId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_rate_cards_tenantId_rateCardNumber_key" ON "vendor_rate_cards"("tenantId", "rateCardNumber");


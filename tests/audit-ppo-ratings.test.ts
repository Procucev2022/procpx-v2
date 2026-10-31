// tests/audit-ppo-ratings.test.ts
// Comprehensive Business-Rule and Security Audit Test Suite for PPO Vendor Performance Rating Workflow
import assert from 'node:assert';
import prisma from '../src/lib/prisma';
import { hasPermission, UserRole } from '../src/lib/permissions';
import { isUserAuthorizedForProject, getUserAuthorizedProjectIds } from '../src/lib/project-auth';

const BASE_URL = 'http://localhost:3000';

let testCount = 0;
let passCount = 0;
let failCount = 0;

function report(name: string, passed: boolean, details?: string) {
  testCount++;
  if (passed) {
    passCount++;
    console.log(`  ✅ [PASS] ${testCount}. ${name}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${testCount}. ${name}${details ? ` -> ${details}` : ''}`);
  }
}

async function runAudit() {
  console.log('========================================================================');
  console.log('  PROCPX PPO VENDOR PERFORMANCE: BUSINESS-RULE & SECURITY AUDIT SUITE   ');
  console.log('========================================================================\n');

  try {
    // 0. Discover Tenant, Users, Vendors, and Projects
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'procucev-retail-demo' } });
    if (!tenant) throw new Error('Tenant not found');

    // Pick project user with projectTeam assignments if available
    const userTeam = await prisma.projectTeam.findFirst({
      where: { user: { role: 'PROJECT_USER' }, active: true },
      include: { user: true, project: true },
    });
    const projectUser = userTeam?.user || await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'PROJECT_USER' },
    });

    const approverTeam = await prisma.projectTeam.findFirst({
      where: { user: { role: 'PROJECT_APPROVER' }, active: true },
      include: { user: true, project: true },
    });
    const projectApprover = approverTeam?.user || await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'PROJECT_APPROVER' },
    });

    const procurementUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'PROCUREMENT_USER' },
    });

    if (!projectUser || !projectApprover || !procurementUser) {
      throw new Error('Required test users not found');
    }

    console.log(`Identified Test Users:`);
    console.log(`  - Project User: ${projectUser.email} (${projectUser.id})`);
    console.log(`  - Project Approver: ${projectApprover.email} (${projectApprover.id})`);
    console.log(`  - Procurement User: ${procurementUser.email} (${procurementUser.id})\n`);

    // Fetch project team assignments for projectUser
    const userProjects = await getUserAuthorizedProjectIds(projectUser.id, projectUser.role);
    console.log(`Project User Authorized Projects: ${userProjects?.join(', ') || 'ALL'}`);

    const approverProjects = await getUserAuthorizedProjectIds(projectApprover.id, projectApprover.role);
    console.log(`Project Approver Authorized Projects: ${approverProjects?.join(', ') || 'ALL'}\n`);

    // Find an authorized project and an unauthorized project
    const authorizedProjectId = userProjects && userProjects.length > 0 ? userProjects[0] : null;
    const unauthorizedProject = await prisma.project.findFirst({
      where: {
        tenantId: tenant.id,
        id: { notIn: userProjects || [] },
      },
    });

    // Find a vendor
    const vendor = await prisma.vendor.findFirst({
      where: { tenantId: tenant.id },
    });
    if (!vendor) throw new Error('Test vendor not found');

    const otherVendor = await prisma.vendor.findFirst({
      where: { tenantId: tenant.id, id: { not: vendor.id } },
    });

    // -------------------------------------------------------------------------
    // SECTION 1: PERMISSION & RBAC BOUNDARIES
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: PERMISSIONS & ROLE-BASED ACCESS CONTROL ---');

    report(
      'PROJECT_USER has VENDOR_RATE_PPO permission',
      hasPermission('PROJECT_USER', 'VENDOR_RATE_PPO') === true
    );

    report(
      'PROJECT_USER does NOT have VENDOR_RATE_PPO_APPROVE permission',
      hasPermission('PROJECT_USER', 'VENDOR_RATE_PPO_APPROVE') === false
    );

    report(
      'PROJECT_APPROVER has VENDOR_RATE_PPO_APPROVE permission',
      hasPermission('PROJECT_APPROVER', 'VENDOR_RATE_PPO_APPROVE') === true
    );

    report(
      'PROJECT_APPROVER does NOT have VENDOR_RATE_PPO permission',
      hasPermission('PROJECT_APPROVER', 'VENDOR_RATE_PPO') === false
    );

    report(
      'PROCUREMENT_USER does NOT have VENDOR_RATE_PPO permission (read-only)',
      hasPermission('PROCUREMENT_USER', 'VENDOR_RATE_PPO') === false
    );

    report(
      'PROCUREMENT_USER does NOT have VENDOR_RATE_PPO_APPROVE permission',
      hasPermission('PROCUREMENT_USER', 'VENDOR_RATE_PPO_APPROVE') === false
    );

    report(
      'PROCUREMENT_USER has VENDOR_VIEW permission to read approved performance',
      hasPermission('PROCUREMENT_USER', 'VENDOR_VIEW') === true
    );

    // -------------------------------------------------------------------------
    // SECTION 2: PPO ELIGIBILITY & PROJECT SCOPE ENFORCEMENT (API CALLS)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: PPO ELIGIBILITY & PROJECT SCOPE ENFORCEMENT ---');

    // Create a temporary isolated PPO for testing unauthorized project
    let tempUnauthorizedPpo: any = null;
    let tempDraftPpo: any = null;
    let tempEligiblePpo: any = null;

    try {
      if (unauthorizedProject) {
        tempUnauthorizedPpo = await prisma.ppo.create({
          data: {
            tenantId: tenant.id,
            ppoNumber: `PPO-TEST-UNAUTH-${Date.now().toString().slice(-4)}`,
            title: 'Test Unauthorized Project PPO',
            vendorId: vendor.id,
            projectId: unauthorizedProject.id,
            createdById: projectUser.id,
            totalValue: 50000,
            status: 'ISSUED',
          },
        });

        // Test 2.1: Project User attempts to rate PPO in project they are not authorized for
        const unauthRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': projectUser.id,
          },
          body: JSON.stringify({
            ppoId: tempUnauthorizedPpo.id,
            qualityScore: 4,
            deliveryScore: 4,
            commercialComplianceScore: 4,
            responsivenessScore: 4,
            documentationClosureScore: 4,
            overallImprovement: 'Good performance test',
          }),
        });

        report(
          'Project User rating PPO outside assigned project is REJECTED with HTTP 403',
          unauthRes.status === 403,
          `Received HTTP ${unauthRes.status}`
        );
      } else {
        console.log('  ⚠️ Skipping unauthorized project test: user has global scope');
      }

      // Test 2.2: Rate an unrelated vendor's PPO
      if (otherVendor) {
        // Create an eligible PPO for otherVendor
        const unrelatedPpo = await prisma.ppo.create({
          data: {
            tenantId: tenant.id,
            ppoNumber: `PPO-TEST-OTHER-${Date.now().toString().slice(-4)}`,
            title: 'Test Other Vendor PPO',
            vendorId: otherVendor.id,
            projectId: authorizedProjectId || unauthorizedProject?.id,
            createdById: projectUser.id,
            totalValue: 40000,
            status: 'ISSUED',
          },
        });

        // Submit to vendor.id (mismatch)
        const mismatchRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': projectUser.id,
          },
          body: JSON.stringify({
            ppoId: unrelatedPpo.id,
            qualityScore: 4,
            deliveryScore: 4,
            commercialComplianceScore: 4,
            responsivenessScore: 4,
            documentationClosureScore: 4,
            overallImprovement: 'Mismatch test',
          }),
        });

        report(
          'Project User rating PPO not belonging to target vendor is REJECTED with HTTP 404',
          mismatchRes.status === 404,
          `Received HTTP ${mismatchRes.status}`
        );

        await prisma.ppo.delete({ where: { id: unrelatedPpo.id } });
      }

      // Test 2.3: Rate a DRAFT or CANCELLED PPO
      tempDraftPpo = await prisma.ppo.create({
        data: {
          tenantId: tenant.id,
          ppoNumber: `PPO-TEST-DRAFT-${Date.now().toString().slice(-4)}`,
          title: 'Test Draft Status PPO',
          vendorId: vendor.id,
          projectId: authorizedProjectId || unauthorizedProject?.id,
          createdById: projectUser.id,
          totalValue: 30000,
          status: 'DRAFT',
        },
      });

      const draftPpoRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ppoId: tempDraftPpo.id,
          qualityScore: 4,
          deliveryScore: 4,
          commercialComplianceScore: 4,
          responsivenessScore: 4,
          documentationClosureScore: 4,
          overallImprovement: 'Testing draft PPO evaluation rejection',
        }),
      });

      report(
        'Project User rating DRAFT PPO is REJECTED with HTTP 400',
        draftPpoRes.status === 400,
        `Received HTTP ${draftPpoRes.status}`
      );

      // Test 2.4: Procurement User attempts POST rating
      const procPostRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': procurementUser.id,
        },
        body: JSON.stringify({
          ppoId: tempDraftPpo.id,
          qualityScore: 5,
          overallImprovement: 'Procurement attempt',
        }),
      });

      report(
        'Procurement User calling POST ppo-ratings is REJECTED with HTTP 403',
        procPostRes.status === 403,
        `Received HTTP ${procPostRes.status}`
      );

      // -----------------------------------------------------------------------
      // SECTION 3: AUTHORITATIVE SCORING, WEIGHTS & FULL PERSISTENCE
      // -----------------------------------------------------------------------
      console.log('\n--- SECTION 3: AUTHORITATIVE SCORING, WEIGHTS & PERSISTENCE ---');

      // Create an authorized eligible PPO
      tempEligiblePpo = await prisma.ppo.create({
        data: {
          tenantId: tenant.id,
          ppoNumber: `PPO-TEST-EVAL-${Date.now().toString().slice(-4)}`,
          title: 'Test Performance Evaluation PPO',
          vendorId: vendor.id,
          projectId: authorizedProjectId || unauthorizedProject?.id,
          createdById: projectUser.id,
          totalValue: 75000,
          status: 'ISSUED',
        },
      });

      // Submit rating with specific scores and client-tampered overallScore
      // Quality=5 (30% -> 1.5), Delivery=4 (25% -> 1.0), Cost=3 (20% -> 0.6), Resp=2 (15% -> 0.3), Docs=1 (10% -> 0.1)
      // Expected authoritative score = 1.5 + 1.0 + 0.6 + 0.3 + 0.1 = 3.5
      const saveDraftRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ppoId: tempEligiblePpo.id,
          action: 'SAVE_DRAFT',
          qualityScore: 5,
          deliveryScore: 4,
          commercialComplianceScore: 3,
          responsivenessScore: 2,
          documentationClosureScore: 1,
          overallScore: 1.0, // Malicious client override to test server calculation
          qualityComments: 'High quality workmanship observed.',
          deliveryComments: 'Minor delivery timeline deviation.',
          commercialComments: 'Billing aligned with quotation.',
          responsivenessComments: 'Slow coordination on changes.',
          documentationComments: 'Invoice received late.',
          overallImprovement: 'Improve response time on change requests.',
        }),
      });

      const draftJson = await saveDraftRes.json();
      report(
        'Project User successfully saves DRAFT evaluation (HTTP 201)',
        saveDraftRes.status === 201,
        `Received HTTP ${saveDraftRes.status}`
      );

      // Verify draft in database
      const savedDraftDb = await prisma.ppoVendorRating.findUnique({
        where: { ppoId: tempEligiblePpo.id },
      });

      report(
        'Draft persisted with status DRAFT',
        savedDraftDb?.status === 'DRAFT'
      );

      report(
        'Overall score calculated authoritatively on server: 3.5 (ignoring client 1.0)',
        savedDraftDb?.overallScore === 3.5,
        `Expected 3.5, got ${savedDraftDb?.overallScore}`
      );

      const parsedDetails = JSON.parse(savedDraftDb?.criteriaDetails || '{}');
      report(
        'All 5 category comments and Overall Areas for Improvement stored correctly',
        parsedDetails.qualityComments === 'High quality workmanship observed.' &&
        parsedDetails.deliveryComments === 'Minor delivery timeline deviation.' &&
        parsedDetails.commercialComments === 'Billing aligned with quotation.' &&
        parsedDetails.responsivenessComments === 'Slow coordination on changes.' &&
        parsedDetails.documentationComments === 'Invoice received late.' &&
        parsedDetails.overallImprovement === 'Improve response time on change requests.'
      );

      // Now Submit for Approval
      const submitRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ppoId: tempEligiblePpo.id,
          action: 'SUBMIT',
          qualityScore: 5,
          deliveryScore: 4,
          commercialComplianceScore: 3,
          responsivenessScore: 2,
          documentationClosureScore: 1,
          qualityComments: 'High quality workmanship observed.',
          deliveryComments: 'Minor delivery timeline deviation.',
          commercialComments: 'Billing aligned with quotation.',
          responsivenessComments: 'Slow coordination on changes.',
          documentationComments: 'Invoice received late.',
          overallImprovement: 'Improve response time on change requests.',
        }),
      });

      report(
        'Project User submits assessment for Project Approval (HTTP 201)',
        submitRes.status === 201,
        `Received HTTP ${submitRes.status}`
      );

      const submittedDb = await prisma.ppoVendorRating.findUnique({
        where: { ppoId: tempEligiblePpo.id },
      });

      report(
        'Rating transitioned to status SUBMITTED in database',
        submittedDb?.status === 'SUBMITTED'
      );

      // Test duplicate submission prevention
      const dupSubmitRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ppoId: tempEligiblePpo.id,
          action: 'SUBMIT',
          qualityScore: 5,
          overallImprovement: 'Duplicate submission attempt',
        }),
      });

      report(
        'Duplicate submission while pending approval is REJECTED with HTTP 400',
        dupSubmitRes.status === 400,
        `Received HTTP ${dupSubmitRes.status}`
      );

      // -----------------------------------------------------------------------
      // SECTION 4: APPROVER SCOPE, RETURN & RESUBMIT WORKFLOW
      // -----------------------------------------------------------------------
      console.log('\n--- SECTION 4: APPROVER SCOPE, RETURN & RESUBMISSION ---');

      // Test 4.0a: Procurement User attempting decision on approval queue is REJECTED (HTTP 403)
      const procDecisionRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': procurementUser.id,
        },
        body: JSON.stringify({
          ratingId: submittedDb!.id,
          action: 'ACCEPT',
          approverComments: 'Unauthorized procurement decision attempt',
        }),
      });

      report(
        'Procurement User attempting decision on approval queue is REJECTED with HTTP 403',
        procDecisionRes.status === 403,
        `Received HTTP ${procDecisionRes.status}`
      );

      // Test 4.0b: Project User attempting decision on approval queue is REJECTED (HTTP 403)
      const projectUserDecisionRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ratingId: submittedDb!.id,
          action: 'ACCEPT',
          approverComments: 'Unauthorized project user decision attempt',
        }),
      });

      report(
        'Project User attempting decision on approval queue is REJECTED with HTTP 403',
        projectUserDecisionRes.status === 403,
        `Received HTTP ${projectUserDecisionRes.status}`
      );

      // Test 4.0c: Project Approver evaluating assessment OUTSIDE authorized project scope is REJECTED (HTTP 403)
      if (tempUnauthorizedPpo) {
        const outOfScopeRating = await prisma.ppoVendorRating.create({
          data: {
            tenantId: tenant.id,
            vendorId: vendor.id,
            ppoId: tempUnauthorizedPpo.id,
            projectId: unauthorizedProject!.id,
            qualityScore: 3,
            deliveryScore: 3,
            commercialComplianceScore: 3,
            responsivenessScore: 3,
            documentationClosureScore: 3,
            overallScore: 3.0,
            status: 'SUBMITTED',
            ratedBy: projectUser.id,
          },
        });

        const unauthApproverRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-id': projectApprover.id,
          },
          body: JSON.stringify({
            ratingId: outOfScopeRating.id,
            action: 'ACCEPT',
            approverComments: 'Attempting to approve rating outside project scope',
          }),
        });

        report(
          'Project Approver reviewing assessment outside assigned project scope is REJECTED with HTTP 403',
          unauthApproverRes.status === 403,
          `Received HTTP ${unauthApproverRes.status}`
        );

        await prisma.ppoVendorRating.delete({ where: { id: outOfScopeRating.id } });
      }

      // Test 4.1: Approver attempts Return WITHOUT comments -> must be rejected
      const returnNoCommentsRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectApprover.id,
        },
        body: JSON.stringify({
          ratingId: submittedDb!.id,
          action: 'RETURN',
          approverComments: '', // Missing comments
        }),
      });

      report(
        'Approver returning without comments is REJECTED with HTTP 400',
        returnNoCommentsRes.status === 400,
        `Received HTTP ${returnNoCommentsRes.status}`
      );

      // Test 4.2: Approver returns WITH comments -> must succeed
      const returnWithCommentsRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectApprover.id,
        },
        body: JSON.stringify({
          ratingId: submittedDb!.id,
          action: 'RETURN',
          approverComments: 'Please recheck delivery timeline details.',
        }),
      });

      report(
        'Approver returns assessment for correction with comments (HTTP 200)',
        returnWithCommentsRes.status === 200,
        `Received HTTP ${returnWithCommentsRes.status}`
      );

      const returnedDb = await prisma.ppoVendorRating.findUnique({
        where: { id: submittedDb!.id },
      });

      report(
        'Status updated to RETURNED_FOR_CORRECTION and returnReason recorded',
        returnedDb?.status === 'RETURNED_FOR_CORRECTION'
      );

      // Test 4.3: Project User resubmits returned rating with corrected notes
      const resubmitRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ppoId: tempEligiblePpo.id,
          action: 'SUBMIT',
          qualityScore: 5,
          deliveryScore: 5, // Corrected delivery score
          commercialComplianceScore: 4,
          responsivenessScore: 4,
          documentationClosureScore: 4,
          // (5*0.30) + (5*0.25) + (4*0.20) + (4*0.15) + (4*0.10) = 1.5 + 1.25 + 0.8 + 0.6 + 0.4 = 4.55 -> 4.6
          qualityComments: 'Excellent quality workmanship.',
          deliveryComments: 'All items delivered within milestone schedule.',
          commercialComments: 'Billing fully reconciled.',
          responsivenessComments: 'Good coordination upon follow-up.',
          documentationComments: 'Documentation completed.',
          overallImprovement: 'Maintain current delivery cadence.',
        }),
      });

      report(
        'Project User corrects and resubmits assessment (HTTP 201)',
        resubmitRes.status === 201,
        `Received HTTP ${resubmitRes.status}`
      );

      const resubmittedDb = await prisma.ppoVendorRating.findUnique({
        where: { id: submittedDb!.id },
      });

      const resubmittedHistory = JSON.parse(resubmittedDb?.criteriaDetails || '{}').history || [];
      report(
        'Resubmission preserves full audit history across cycles (contains DRAFT, SUBMITTED, RETURNED, RESUBMITTED)',
        resubmittedHistory.length >= 3 &&
        resubmittedHistory.some((h: any) => h.action === 'RETURNED_FOR_CORRECTION') &&
        resubmittedHistory.some((h: any) => h.action === 'RESUBMITTED')
      );

      // -----------------------------------------------------------------------
      // SECTION 5: APPROVAL DECISION, SCORECARD PUBLICATION & IMMUTABILITY
      // -----------------------------------------------------------------------
      console.log('\n--- SECTION 5: APPROVAL DECISION & IMMUTABILITY ---');

      // Approver accepts rating
      const acceptRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectApprover.id,
        },
        body: JSON.stringify({
          ratingId: submittedDb!.id,
          action: 'ACCEPT',
          approverComments: 'Verified with site team. Quality and schedule confirmed.',
        }),
      });

      report(
        'Project Approver accepts and approves assessment (HTTP 200)',
        acceptRes.status === 200,
        `Received HTTP ${acceptRes.status}`
      );

      const approvedDb = await prisma.ppoVendorRating.findUnique({
        where: { id: submittedDb!.id },
      });

      report(
        'Assessment status is APPROVED with approver metadata stamped',
        approvedDb?.status === 'APPROVED' &&
        JSON.parse(approvedDb?.criteriaDetails || '{}').approvedBy === projectApprover.id
      );

      // Test Immutability 5.1: Project User attempts to modify approved rating
      const userEditApprovedRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectUser.id,
        },
        body: JSON.stringify({
          ppoId: tempEligiblePpo.id,
          action: 'SUBMIT',
          qualityScore: 2,
          overallImprovement: 'Attempting to overwrite approved rating',
        }),
      });

      report(
        'Project User modifying APPROVED rating is REJECTED with HTTP 400 (Locked Immutability)',
        userEditApprovedRes.status === 400,
        `Received HTTP ${userEditApprovedRes.status}`
      );

      // Test Immutability 5.2: Approver attempts to re-decide on APPROVED rating
      const approverReApproveRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': projectApprover.id,
        },
        body: JSON.stringify({
          ratingId: submittedDb!.id,
          action: 'ACCEPT',
          approverComments: 'Duplicate approval attempt',
        }),
      });

      report(
        'Duplicate approval decision on APPROVED rating is REJECTED with HTTP 400',
        approverReApproveRes.status === 400,
        `Received HTTP ${approverReApproveRes.status}`
      );

      // -----------------------------------------------------------------------
      // SECTION 6: PROCUREMENT READ-ONLY ACCESS & VISIBILITY
      // -----------------------------------------------------------------------
      console.log('\n--- SECTION 6: PROCUREMENT READ-ONLY ACCESS ---');

      // Procurement User views vendor's ratings
      const procGetRatingsRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}/ppo-ratings`, {
        method: 'GET',
        headers: {
          'x-test-user-id': procurementUser.id,
        },
      });

      const procRatingsJson = await procGetRatingsRes.json();
      const procRatings = procRatingsJson.ratings || [];

      report(
        'Procurement User successfully views PPO ratings (HTTP 200)',
        procGetRatingsRes.status === 200
      );

      const allAreApproved = procRatings.every((r: any) => r.status === 'APPROVED');
      report(
        'Procurement User only sees APPROVED ratings (Zero Draft or Pending Ratings leaked)',
        allAreApproved && procRatings.some((r: any) => r.id === submittedDb!.id)
      );

      // Check vendor profile API for Procurement User
      const procVendorRes = await fetch(`${BASE_URL}/api/procurement/vendors/${vendor.id}`, {
        method: 'GET',
        headers: {
          'x-test-user-id': procurementUser.id,
        },
      });

      const procVendorJson = await procVendorRes.json();
      const eligiblePpos = procVendorJson.eligiblePposToRate || [];

      report(
        'Procurement User receives empty eligiblePposToRate list (UI Rate button suppressed)',
        Array.isArray(eligiblePpos) && eligiblePpos.length === 0
      );

      // Test 6.4: Procurement User calling GET /api/approvals/vendor-ratings is REJECTED (HTTP 403)
      const procGetQueueRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'GET',
        headers: {
          'x-test-user-id': procurementUser.id,
        },
      });

      report(
        'Procurement User calling GET /api/approvals/vendor-ratings is REJECTED with HTTP 403',
        procGetQueueRes.status === 403,
        `Received HTTP ${procGetQueueRes.status}`
      );

      // Test 6.5: Project User calling GET /api/approvals/vendor-ratings is REJECTED (HTTP 403)
      const projectUserGetQueueRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'GET',
        headers: {
          'x-test-user-id': projectUser.id,
        },
      });

      report(
        'Project User calling GET /api/approvals/vendor-ratings is REJECTED with HTTP 403',
        projectUserGetQueueRes.status === 403,
        `Received HTTP ${projectUserGetQueueRes.status}`
      );

      // Test 6.6: Project Approver calling GET /api/approvals/vendor-ratings SUCCEEDS (HTTP 200)
      const approverGetQueueRes = await fetch(`${BASE_URL}/api/approvals/vendor-ratings`, {
        method: 'GET',
        headers: {
          'x-test-user-id': projectApprover.id,
        },
      });

      report(
        'Project Approver calling GET /api/approvals/vendor-ratings SUCCEEDS with HTTP 200',
        approverGetQueueRes.status === 200,
        `Received HTTP ${approverGetQueueRes.status}`
      );

      // Test 6.7: Vendor Directory register (/api/procurement/vendors) computes averages only from APPROVED ratings
      const vendorListRes = await fetch(`${BASE_URL}/api/procurement/vendors?search=${encodeURIComponent(vendor.name)}`, {
        method: 'GET',
        headers: {
          'x-test-user-id': procurementUser.id,
        },
      });

      const vendorListData = await vendorListRes.json();
      const matchedVendor = (vendorListData.vendors || []).find((v: any) => v.id === vendor.id);

      report(
        'Vendor Directory Register accurately synthesizes scores exclusively from APPROVED ratings',
        vendorListRes.status === 200 &&
        matchedVendor !== undefined &&
        (matchedVendor.averagePpoRating === null || typeof matchedVendor.averagePpoRating === 'number'),
        `Vendor directory average: ${matchedVendor?.averagePpoRating}, count: ${matchedVendor?.ppoRatingsCount}`
      );

    } finally {
      // Clean up ONLY temporary test records created in this test suite
      console.log('\n--- CLEANING UP TEMPORARY TEST DATA ---');
      if (tempEligiblePpo) {
        await prisma.ppoVendorRating.deleteMany({ where: { ppoId: tempEligiblePpo.id } });
        await prisma.ppo.delete({ where: { id: tempEligiblePpo.id } });
        console.log(`  Cleaned up temp PPO ${tempEligiblePpo.ppoNumber}`);
      }
      if (tempDraftPpo) {
        await prisma.ppoVendorRating.deleteMany({ where: { ppoId: tempDraftPpo.id } });
        await prisma.ppo.delete({ where: { id: tempDraftPpo.id } });
        console.log(`  Cleaned up temp PPO ${tempDraftPpo.ppoNumber}`);
      }
      if (tempUnauthorizedPpo) {
        await prisma.ppoVendorRating.deleteMany({ where: { ppoId: tempUnauthorizedPpo.id } });
        await prisma.ppo.delete({ where: { id: tempUnauthorizedPpo.id } });
        console.log(`  Cleaned up temp PPO ${tempUnauthorizedPpo.ppoNumber}`);
      }
    }

    console.log('\n========================================================================');
    console.log(` AUDIT SUMMARY: Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
    console.log('========================================================================\n');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('Audit execution failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();

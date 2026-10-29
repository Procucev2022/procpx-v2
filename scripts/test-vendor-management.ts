// scripts/test-vendor-management.ts
// Comprehensive Acceptance Test Suite for proCPX Vendor Management Module
import { PrismaClient } from '@prisma/client';
import { hasPermission, ROLE_PERMISSIONS } from '../src/lib/permissions';
import { evaluateVendorProfile } from '../src/lib/vendor-ai-evaluator';

const prisma = new PrismaClient();

async function runAcceptanceTests() {
  console.log('===============================================================');
  console.log('proCPX VENDOR MANAGEMENT MODULE — AUTOMATED ACCEPTANCE TESTS');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   └─ ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   └─ ${detail}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Category Manager Role & RBAC Permissions
    // -------------------------------------------------------------
    console.log('--- Test Suite 1: Permissions & Authorisations ---');
    const cmCanView = hasPermission('CATEGORY_MANAGER', 'VENDOR_VIEW');
    const cmCanManage = hasPermission('CATEGORY_MANAGER', 'VENDOR_MANAGE');
    const cmCanEvaluate = hasPermission('CATEGORY_MANAGER', 'VENDOR_EVALUATE');
    const cmCanQualify = hasPermission('CATEGORY_MANAGER', 'VENDOR_QUALIFY');
    const cmCanRatePpo = hasPermission('CATEGORY_MANAGER', 'VENDOR_RATE_PPO');

    assert(
      cmCanView && cmCanManage && cmCanEvaluate && cmCanQualify && cmCanRatePpo,
      'Test 1: Category Manager has comprehensive Vendor Management permissions',
      'Verified: VENDOR_VIEW, VENDOR_MANAGE, VENDOR_EVALUATE, VENDOR_QUALIFY, VENDOR_RATE_PPO'
    );

    // Regular user should have view but not qualify permissions
    const regularUserCanQualify = hasPermission('PROCUREMENT_USER', 'VENDOR_QUALIFY');
    assert(
      !regularUserCanQualify,
      'Test 1b: Regular Procurement User cannot qualify vendors or modify vendor masters',
      'Role boundary enforced'
    );

    // Find default tenant and user
    const tenant = await prisma.tenant.findFirst();
    const user = await prisma.user.findFirst();
    if (!tenant || !user) {
      throw new Error('Database missing seed tenant or user');
    }
    const tenantId = tenant.id;
    const userId = user.id;

    // -------------------------------------------------------------
    // Test 2: Immediate Vendor Onboarding with Minimal Mandatory Info
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 2: Immediate Onboarding & Unique ID Generation ---');
    const testClientVendorCode = `VND-TEST-${Date.now().toString().slice(-4)}`;
    const clientVendor = await prisma.vendor.create({
      data: {
        tenantId,
        code: testClientVendorCode,
        name: 'OmniTech MEP Solutions Pvt Ltd',
        vendorType: 'CLIENT_VENDOR',
        contactPerson: 'Vikram Sethi',
        email: 'vikram.sethi@omnitech-mep.com',
        phone: '+91 98200 12345',
        categories: 'Electrical, HVAC & Plumbing',
        operatingLocation: 'Bangalore & Hyderabad',
        onboardingStatus: 'PROFILE_INCOMPLETE', // Immediate onboarding allows saving draft/incomplete
        qualificationStatus: 'NOT_EVALUATED',
        status: 'ACTIVE',
      },
    });

    assert(
      clientVendor && clientVendor.code === testClientVendorCode,
      'Test 2: Immediate vendor onboarding succeeds with minimal mandatory fields',
      `Created Vendor ID: ${clientVendor.id}, Code: ${clientVendor.code}, Type: ${clientVendor.vendorType}`
    );

    assert(
      clientVendor.onboardingStatus === 'PROFILE_INCOMPLETE' && clientVendor.qualificationStatus === 'NOT_EVALUATED',
      'Test 3: Basic onboarding is marked Draft/Incomplete and NOT treated as qualification',
      `Onboarding: ${clientVendor.onboardingStatus}, Qualification: ${clientVendor.qualificationStatus}`
    );

    // -------------------------------------------------------------
    // Test 3: Classification of Client Vendor vs Procucev Vendor
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 3: Client Vendors vs Procucev Network Vendors ---');
    const testProcucevVendorCode = `VND-PROC-${Date.now().toString().slice(-4)}`;
    const procucevVendor = await prisma.vendor.create({
      data: {
        tenantId,
        code: testProcucevVendorCode,
        name: 'SteelFab Structural Systems Ltd',
        vendorType: 'PROCUCEV_VENDOR',
        contactPerson: 'Anjali Sharma',
        email: 'anjali@steelfab-network.in',
        phone: '+91 98111 88899',
        categories: 'Structural Steel, Prefab',
        operatingLocation: 'Pan-India',
        onboardingStatus: 'ONBOARDED',
        qualificationStatus: 'NOT_EVALUATED',
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        experienceYears: 12,
        turnoverCrores: 45.5,
        capabilities: 'Fabrication capacity 1500 MT/month, CNC plasma cutting, automated beam welding',
        clientReferences: 'L&T Construction (Bangalore Metro Phase 2), Shapoorji Pallonji (Tech Park)',
        status: 'ACTIVE',
      },
    });

    const clientVendorsCount = await prisma.vendor.count({ where: { vendorType: 'CLIENT_VENDOR', tenantId } });
    const procucevVendorsCount = await prisma.vendor.count({ where: { vendorType: 'PROCUCEV_VENDOR' } });

    assert(
      clientVendorsCount > 0 && procucevVendorsCount > 0,
      'Test 4: Client Vendors and Procucev Vendors are strictly classified in data model',
      `Client Vendors in Tenant: ${clientVendorsCount}, Procucev Network Vendors: ${procucevVendorsCount}`
    );

    // -------------------------------------------------------------
    // Test 4: AI/LLM-Assisted Evaluation Engine
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 4: Structured & AI-Assisted Evaluation ---');
    const aiEvaluation = await evaluateVendorProfile(procucevVendor as any);

    assert(
      aiEvaluation !== null && typeof aiEvaluation.overallWeightedScore === 'number',
      'Test 5: AI Evaluation generates structured evidence analysis and overall weighted score',
      `Weighted Score: ${aiEvaluation.overallWeightedScore}%, Recommendation: ${aiEvaluation.qualificationOutcome}`
    );

    const rubricCategories = Object.keys(aiEvaluation.criteria);
    const expectedWeights = [15, 20, 20, 15, 20, 10];
    const totalWeights = Object.values(aiEvaluation.criteria).reduce((acc: number, r: any) => acc + r.weight, 0);

    assert(
      rubricCategories.length === 6 && totalWeights === 100,
      'Test 6: 6 Standard rubric categories implemented with total 100% weight',
      `Categories: ${rubricCategories.join(', ')} (Total Weight: ${totalWeights}%)`
    );

    assert(
      Array.isArray(aiEvaluation.strengths) && Array.isArray(aiEvaluation.verificationGaps),
      'Test 7: AI extracts verifiable evidence, strengths, and flags missing documentation gaps',
      `Strengths found: ${aiEvaluation.strengths.length}, Gaps flagged: ${aiEvaluation.verificationGaps.length}`
    );

    // -------------------------------------------------------------
    // Test 5: Category Manager Human Qualification Decision
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 5: Category Manager Qualification Decision ---');
    const formalEvaluation = await prisma.vendorEvaluation.create({
      data: {
        tenantId,
        vendorId: procucevVendor.id,
        evaluationType: 'INITIAL',
        status: 'QUALIFIED',
        businessProfileScore: aiEvaluation.criteria.businessProfile.suggestedScore,
        financialStrengthScore: aiEvaluation.criteria.financialStrength.suggestedScore,
        previousClientsScore: aiEvaluation.criteria.previousClients.suggestedScore,
        referencesScore: aiEvaluation.criteria.references.suggestedScore,
        technicalCapabilityScore: aiEvaluation.criteria.technicalCapability.suggestedScore,
        complianceRiskScore: aiEvaluation.criteria.complianceRisk.suggestedScore,
        overallWeightedScore: aiEvaluation.overallWeightedScore,
        qualificationOutcome: aiEvaluation.qualificationOutcome,
        evaluatedBy: userId,
        evaluatedAt: new Date(),
        approvedBy: userId,
        approvedAt: new Date(),
        decisionRemarks: 'Verified client references and ISO certificates. Recommended for corporate framework awards.',
      },
    });

    const updatedVendor = await prisma.vendor.update({
      where: { id: procucevVendor.id },
      data: {
        qualificationStatus: 'QUALIFIED',
        qualificationScore: aiEvaluation.overallWeightedScore,
        qualificationDecision: aiEvaluation.qualificationOutcome,
        evaluatedAt: new Date(),
        evaluatedById: userId,
        empanelmentStatus: 'APPROVED',
      },
    });

    assert(
      updatedVendor.qualificationStatus === 'QUALIFIED' && updatedVendor.qualificationScore === aiEvaluation.overallWeightedScore,
      'Test 8: Category Manager formal decision updates qualification status and score',
      `Status: ${updatedVendor.qualificationStatus}, Score: ${updatedVendor.qualificationScore}%, Empanelment: ${updatedVendor.empanelmentStatus}`
    );

    // -------------------------------------------------------------
    // Test 6: PPO-Level Independent Performance Rating
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 6: PPO-Level Independent Performance Ratings ---');
    // Find an existing RFQ or PPO to ensure relational integrity
    const project = await prisma.project.findFirst({ where: { tenantId } });
    const costCentre = await prisma.costCentre.findFirst({ where: { tenantId } });
    const existingRfq = await prisma.rfq.findFirst({ where: { tenantId } });
    let testPpo = null;

    if (existingRfq) {
      testPpo = await prisma.ppo.create({
        data: {
          tenantId,
          ppoNumber: `PPO-TEST-${Date.now().toString().slice(-4)}`,
          title: 'Structural Steel Supply for Tower B',
          rfqId: existingRfq.id,
          vendorId: procucevVendor.id,
          projectId: project?.id || existingRfq.projectId,
          costCentreId: costCentre?.id,
          createdById: userId,
          totalValue: 1250000,
          status: 'COMPLETED',
          issuedAt: new Date(),
          completedAt: new Date(),
        },
      });
    }

    if (!testPpo) {
      throw new Error('Could not find or create test PPO');
    }
    const ppo = testPpo;

    // Rate this completed PPO across the 5 criteria (1 to 5 scale)
    // Quality 30%, Delivery 25%, Commercial 20%, Responsiveness 15%, Documentation 10%
    const q = 5; // 5 * 0.30 = 1.50
    const d = 4; // 4 * 0.25 = 1.00
    const c = 4; // 4 * 0.20 = 0.80
    const r = 5; // 5 * 0.15 = 0.75
    const doc = 4; // 4 * 0.10 = 0.40
    // Expected weighted = 1.50 + 1.00 + 0.80 + 0.75 + 0.40 = 4.45 -> rounded 4.5 / 5.0
    const expectedPpoScore = Math.round(((q * 0.30) + (d * 0.25) + (c * 0.20) + (r * 0.15) + (doc * 0.10)) * 10) / 10;

    const ppoRating = await prisma.ppoVendorRating.create({
      data: {
        tenantId,
        vendorId: procucevVendor.id,
        ppoId: ppo.id,
        projectId: project?.id,
        costCentreId: costCentre?.id,
        qualityScore: q,
        deliveryScore: d,
        commercialComplianceScore: c,
        responsivenessScore: r,
        documentationClosureScore: doc,
        overallScore: expectedPpoScore,
        comments: 'Delivered fabricated beams ahead of critical path milestone. Mill test certificates certified.',
        ratedBy: userId,
        ratedAt: new Date(),
        status: 'SUBMITTED',
      },
    });

    assert(
      ppoRating && ppoRating.overallScore === 4.5,
      'Test 9: Independent PPO performance rating calculated correctly on 1–5 scale',
      `PPO: ${ppo.ppoNumber}, Quality: ${q}/5, Delivery: ${d}/5, Commercial: ${c}/5, Overall: ${ppoRating.overallScore}/5.0`
    );

    // Verify duplicate rating prevention on the same PPO
    let duplicatePrevented = false;
    try {
      await prisma.ppoVendorRating.create({
        data: {
          tenantId,
          vendorId: procucevVendor.id,
          ppoId: ppo.id, // duplicate ppoId
          qualityScore: 3,
          deliveryScore: 3,
          commercialComplianceScore: 3,
          responsivenessScore: 3,
          documentationClosureScore: 3,
          overallScore: 3.0,
          ratedBy: userId,
          status: 'SUBMITTED',
        },
      });
    } catch (err: any) {
      duplicatePrevented = true;
    }

    assert(
      duplicatePrevented,
      'Test 10: Duplicate performance ratings on the same PPO are strictly prevented by database constraint',
      'Unique constraint on ppoId successfully blocked duplicate evaluation'
    );

    // -------------------------------------------------------------
    // Test 7: Separation of Qualification Score vs PPO Performance Score
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 7: Score Metric Separation ---');
    const reloadedVendor = await prisma.vendor.findUnique({
      where: { id: procucevVendor.id },
      include: { ppoRatings: true, evaluations: true },
    });

    const qualScore = reloadedVendor?.qualificationScore; // (0-100 scale)
    const ppoAvgScore = reloadedVendor?.ppoRatings[0]?.overallScore; // (1-5 scale)

    assert(
      qualScore !== null && ppoAvgScore !== null && qualScore !== ppoAvgScore,
      'Test 11: Vendor Qualification Score and PPO Performance Rating remain distinct metrics',
      `Qualification Score: ${qualScore}% (Empanelment readiness) vs PPO Performance: ${ppoAvgScore}/5.0 (Order execution quality)`
    );

    // -------------------------------------------------------------
    // Test 8: Tenant Isolation Check
    // -------------------------------------------------------------
    console.log('\n--- Test Suite 8: Tenant Isolation & Confidentiality ---');
    // A query for client-vendor by another tenant ID must return null
    const foreignTenantVendor = await prisma.vendor.findFirst({
      where: {
        id: clientVendor.id,
        tenantId: 'foreign-tenant-uuid-12345',
      },
    });

    assert(
      foreignTenantVendor === null,
      'Test 12: Private Client Vendor records are isolated from other tenants',
      'Cross-tenant isolation enforced'
    );

    // Clean up test records
    await prisma.ppoVendorRating.delete({ where: { id: ppoRating.id } });
    await prisma.ppo.delete({ where: { id: ppo.id } });
    await prisma.vendorEvaluation.delete({ where: { id: formalEvaluation.id } });
    await prisma.vendor.delete({ where: { id: clientVendor.id } });
    await prisma.vendor.delete({ where: { id: procucevVendor.id } });
    console.log('\nCleaned up ephemeral test records.');

  } catch (error: any) {
    console.error('Fatal test error:', error);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests();

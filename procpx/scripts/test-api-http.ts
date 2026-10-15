// scripts/test-api-http.ts
async function testApi() {
  const tenantId = '5f6bc1f7-1919-4900-8fe7-44812baecdcb';
  const vendorId = 'b79ac9af-7c2b-43be-9a78-571e49daa3fb';

  console.log('Testing GET /api/procurement/vendors/' + vendorId + '/dashboard ...');
  const res = await fetch(`http://localhost:3000/api/procurement/vendors/${vendorId}/dashboard`, {
    headers: {
      'x-test-tenant-id': tenantId,
    },
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Counts:', JSON.stringify(data.counts, null, 2));
  console.log('RFQ Register Count:', data.rfqRegister?.length);
  if (data.rfqRegister?.length > 0) {
    const rfq0 = data.rfqRegister[0];
    console.log('Sample RFQ:', {
      rfqNumber: rfq0.rfqNumber,
      rfqReceivedDate: rfq0.rfqReceivedDate,
      submissionDeadline: rfq0.submissionDeadline,
      clientTenant: rfq0.clientTenant,
      projectPackage: rfq0.projectPackage,
      category: rfq0.category,
      itemCount: rfq0.itemCount,
      quotationStatus: rfq0.quotationStatus,
      buyerDecisionStatus: rfq0.buyerDecisionStatus,
      lastActivityDate: rfq0.lastActivityDate,
      nextAction: rfq0.nextAction,
      nextResponsibleParty: rfq0.nextResponsibleParty,
      availableActions: rfq0.availableActions,
    });
  }

  console.log('PPOs Count:', data.ppos?.length);
  if (data.ppos?.length > 0) {
    const ppo0 = data.ppos[0];
    console.log('Sample PPO:', {
      ppoNumber: ppo0.ppoNumber,
      totalValue: ppo0.totalValue,
      status: ppo0.status,
      vendorStatus: ppo0.vendorStatus,
      vendorAcceptedAt: ppo0.vendorAcceptedAt,
      vendorAcceptedBy: ppo0.vendorAcceptedBy,
      deliveryTerms: ppo0.deliveryTerms,
      paymentTerms: ppo0.paymentTerms,
    });
  }

  console.log('Rate Cards Count:', data.rateCards?.length);
}

testApi().catch(console.error);

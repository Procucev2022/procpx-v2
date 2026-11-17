/** Demo workflow links open the RFQ fixture, which the RFQ page serves only outside production builds. */
export const DEMO_WORKFLOW_RFQ_HREF = '/procurement/rfqs/RFQ-DEMO-001?demo=true';

export const SHOW_DEMO_WORKFLOW_LINKS = process.env.NODE_ENV !== 'production';

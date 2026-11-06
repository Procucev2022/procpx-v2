CREATE INDEX IF NOT EXISTS rfq_messages_conversation_order_idx
ON rfq_messages (tenantId, rfqId, createdAt, id);

CREATE INDEX IF NOT EXISTS rfq_messages_vendor_conversation_order_idx
ON rfq_messages (tenantId, rfqId, vendorId, createdAt, id);

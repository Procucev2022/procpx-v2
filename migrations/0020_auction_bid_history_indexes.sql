CREATE INDEX IF NOT EXISTS "auction_bids_tenant_auction_timestamp_id_idx"
ON "auction_bids" ("tenantId", "auctionId", "timestamp", "id");

CREATE INDEX IF NOT EXISTS "auction_bids_tenant_auction_vendor_timestamp_id_idx"
ON "auction_bids" ("tenantId", "auctionId", "vendorId", "timestamp", "id");

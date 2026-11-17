-- Support the every-minute scheduled auction transitions, which filter auctions by status and start or end time.
-- Without these indexes each cron tick scans the whole auctions table twice.
-- Additive indexes only; this migration preserves every auction and bid record.
CREATE INDEX IF NOT EXISTS "auctions_status_endTime_idx" ON "auctions"("status", "endTime");
CREATE INDEX IF NOT EXISTS "auctions_status_startTime_idx" ON "auctions"("status", "startTime");

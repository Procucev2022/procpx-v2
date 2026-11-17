-- Brute-force protection: count failed password attempts per account and lock the account briefly after repeated failures.
-- Additive columns only; existing users keep their data and start with zero failures.
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" DATETIME;
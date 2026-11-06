-- A budget transaction can be reversed only once. Existing reversal IDs were
-- checked for duplicates before adding this constraint; no records are changed.
CREATE UNIQUE INDEX IF NOT EXISTS "budget_transactions_reversedTransactionId_key"
  ON "budget_transactions" ("reversedTransactionId");

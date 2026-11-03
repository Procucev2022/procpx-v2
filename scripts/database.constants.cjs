// Wrangler accepts the binding name from wrangler.jsonc for both local and remote D1 commands.
const DATABASE_NAME = 'DB';
const EXPECTED_D1_MODEL_TABLES = 43;
const MIGRATIONS_DIRECTORY = 'migrations';
const DESTRUCTIVE_SQL_PATTERN = /\bDROP\s+(?:TABLE|COLUMN|INDEX|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b[\s\S]{0,160}\bDROP\b/i;

module.exports = {
  DATABASE_NAME,
  DESTRUCTIVE_SQL_PATTERN,
  EXPECTED_D1_MODEL_TABLES,
  MIGRATIONS_DIRECTORY,
};

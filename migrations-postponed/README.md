# Postponed D1 migrations

Files here are **not** applied by Wrangler (`migrations_dir` is `migrations/`).

## 0035_master_normalized_name_uniqueness.sql

Adds case/space-insensitive unique indexes on project, vendor and cost-centre names.
It was postponed on 2026-11-20 because the remote `procpx-dev` database already holds
duplicate names (for example 16 projects named "Phoenix Marketcity Retail Store Fitout"),
so creating the index failed and blocked every later migration and deploy.

The application still rejects new duplicate names in code; only the database backstop
index is postponed.

To re-enable it: resolve the duplicate names in each target database (with explicit
authorisation, never by deleting records automatically), then move the file back into
`migrations/` under the next free number. Local databases that already applied it keep
the indexes; the integrity check only warns that the applied name has no file.

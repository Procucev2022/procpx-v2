---
title: repository hygiene
description: Keep generated, local, and sensitive artifacts out of version control.
---

# Repository ignore policy

- Treat the root `.gitignore` as a maintained repository policy. Whenever a change introduces a dependency cache, build output, local database, log, screenshot, temporary file, local configuration, credential, or other machine-specific artifact, decide whether it belongs in source control and update `.gitignore` in the same change when it should be excluded.
- Keep ignore patterns narrow and documented by category. Preserve application source, tests, fixtures, schema files, D1 SQL migrations, `.env.example`, `.dev.vars.example`, and intentionally tracked integrity or coverage reports.
- Before finishing, check new patterns with `git check-ignore -v <path>` and inspect `git status --short` so required files were not hidden. A `.gitignore` change does not remove files already tracked; explicitly review those files and their history before any untracking or deletion.
- Never add real credentials, tokens, private keys, production data, or local secret files to source control. Keep only clearly fake or empty templates as examples.
- Do not delete or untrack existing database files as a side effect of adding ignore rules. For this explicitly authorized D1 migration, the user identified the legacy SQLite contents as mock data and requested a fresh database; do not import those records. Remove the old database and its mock-data snapshots only after validating the empty D1 schema.

# Cloudflare D1 repository conventions

- Cloudflare D1 is the only intended application database. Keep the Prisma SQLite schema as the D1-compatible schema source, and use ordered Wrangler SQL migrations for D1 schema changes. Do not introduce a second hosted database or a production SQLite file.
- Local D1 state belongs under `.wrangler/` and must not be committed. Store D1 binding names and non-secret configuration in tracked Wrangler config; keep credentials and local overrides in ignored environment files/secrets.
- The user authorized starting with an empty D1 schema; do not import the legacy mock SQLite data. Remove the old `prisma/dev.db` and mock-data snapshots after the schema has been validated.
- Keep the Prisma `sqlite` provider only as D1's schema dialect. Runtime code must connect through `@prisma/adapter-d1`; remove `DATABASE_URL`, Prisma SQLite backup scripts, and Prisma Migrate deployment.
- Keep local D1 state under `.wrangler/`. Apply schema migrations with ordered Wrangler SQL files. Routine quality checks use `wrangler d1 ... --local`; remote changes require explicit commands and configured credentials.
- Prisma's D1 adapter does not support transactions and ignores transaction boundaries. The current multi-write workflows are not production-safe until their consistency guarantees are redesigned and verified.

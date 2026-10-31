---
inclusion: always
---

Follow `AGENTS.md` and `.agents/rules/repository-hygiene.md` for repository ignore and database migration requirements. Update `.gitignore` in the same change when new generated, local, secret, or machine-specific artifacts must stay out of version control, then verify the patterns with `git check-ignore -v`. Cloudflare D1 is the only application database. The user authorized discarding the legacy mocked SQLite data and initializing an empty D1 schema. Use Wrangler SQL migrations and `@prisma/adapter-d1`; do not use `DATABASE_URL`, Prisma SQLite runtime files, `prisma db push`, or Prisma Migrate deploy. Prisma D1 ignores transaction boundaries, so multi-write workflows must be redesigned before production use.

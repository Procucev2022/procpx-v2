---
inclusion: always
---

Follow `AGENTS.md` and `.agents/rules/unit-test-coverage.md`. After every code change, run `npm run check:quality` at the workspace root so all discovered npm projects are checked. It runs build and unit-test coverage first, followed by typecheck, lint, safe pending migrations, and database integrity. Use `npm run check:changed` for fast changed-file lint, affected-project TypeScript checks, and changed or related tests while editing; it does not replace the full gate. All application TypeScript and TSX files must meet the 90% line, statement, branch, and function thresholds, file by file and overall. Do not skip files or reduce thresholds. Jest applies a 30-second global timeout and `--detectOpenHandles`.

Use the shared structured logger and follow `AGENTS.md` for safe context, local JSONL retention, and Playwright screenshots/diagnostic snapshots. Logs and screenshots must be redacted, searchable, and managed under the 30-day retention policy.

Follow `.agents/rules/application-structure.md` for dedicated constants and type/interface modules.

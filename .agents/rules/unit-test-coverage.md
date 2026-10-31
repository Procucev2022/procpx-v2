---
trigger: always_on
description: "Apply workspace-wide build, test coverage, typecheck, lint, and safe migration checks to every proCPX change."
---

# Workspace quality and unit-test policy

- Follow `AGENTS.md` for data persistence, migration safety, and regression requirements.
- After every code change, run `npm run check:quality` from the workspace root. The runner discovers npm projects under the workspace and executes their configured checks globally.
- The full gate runs build first and unit-test coverage second, then typecheck, lint, safe pending migrations, and a final database-integrity check. Run the stages across all discovered projects; do not check only the active package.
- Run `npm run check:changed` for fast feedback while editing. It lints changed files, typechecks the owning TypeScript project when relevant, runs changed tests plus tests related to changed source, and checks tracked diffs for whitespace errors. It is not the completion gate.
- Keep unit tests under `unit-tests/`; add or update focused tests for changed application behavior. Keep browser and workflow scripts separate.
- The coverage command uses Jest's global 30-second timeout and `--detectOpenHandles`. Every TypeScript/TSX file under `src/` must reach at least 90% statements, branches, functions, and lines individually and overall.
- `npm run test:coverage` prints and writes `unit-test-coverage-report.md` with the overall metrics and every source file, including files below threshold. Never exclude a file or lower a threshold to make the gate pass.
- The full runner applies pending migrations only through `npm run db:migrate:safe`, after quality checks. That command records integrity, backs up the SQLite database, blocks migration history problems and detected destructive SQL, applies safe pending migrations, and checks integrity afterward. Do not use `db push` to bypass missing migration history.
- If a project uses a different build, coverage, typecheck, lint, migration, or integrity command, expose it as a package script for the workspace runner.
- Follow the structured logging and debug evidence policy in `AGENTS.md`. Use the shared logger for new server events, keep secrets and raw user content out of logs, and retain local logs/snapshots/screenshots for 30 days with automatic startup cleanup.
- Use `npm run logs:search -- --level error --since 24h` to search local JSONL records. Attach `attachPlaywrightDebugCapture` to browser test pages and capture a named checkpoint after each meaningful workflow state; keep screenshots in the managed `logs/` directory so retention purges them.

- Follow `.agents/rules/application-structure.md` for the required dedicated constants and type/interface modules.
- Follow the internationalization policy in `.agents/rules/application-structure.md`; tests must use `UI_STRINGS` for user-visible text assertions.

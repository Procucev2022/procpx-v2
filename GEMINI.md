# Agent instructions

Follow `AGENTS.md` and `.agents/rules/unit-test-coverage.md`. After every code change, run `npm run check:quality` from the workspace root. It discovers npm projects across the workspace and checks build and unit-test coverage first, then typecheck, lint, safe pending migrations, and database integrity. Use `npm run check:changed` for fast checks on changed files and related tests while editing; it does not replace the full gate. Every application file must meet the configured 90% statement, branch, function, and line thresholds. Jest uses a 30-second global timeout and `--detectOpenHandles`.

For application logging, follow the structured logging policy in `AGENTS.md`; use the shared logger and managed local debug snapshots/screenshots, and never record secrets or raw user documents.

For application structure, follow `.agents/rules/application-structure.md`: store static reusable constants in feature `*.constants.ts` modules and type-only declarations in mirrored `types/**/*.types.ts` files. Keep Next.js route-segment config literals statically analyzable in route files.

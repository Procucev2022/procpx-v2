@AGENTS.md

Follow `AGENTS.md` and `.agents/rules/unit-test-coverage.md`. After every code change, run `npm run check:quality` from the workspace root; it checks all discovered npm projects, running build and unit-test coverage first, then typecheck, lint, safe pending migrations, and database integrity. Use `npm run check:changed` for fast changed-file lint, related tests, and affected-project TypeScript checks while editing; it does not replace the full gate.

For application logging, follow the structured logging policy in `AGENTS.md`: use the shared logger, include useful operation and record context, avoid secrets and raw personal data, and use the managed local Playwright snapshot/screenshot helper at workflow checkpoints.

For application structure, follow `.agents/rules/application-structure.md`: store static reusable constants in feature `*.constants.ts` modules and type-only declarations in mirrored `types/**/*.types.ts` files. Keep Next.js route-segment config literals statically analyzable in route files.
Follow `.agents/rules/internationalization.md` for the complete `UI_STRINGS`, placeholder, locale formatting, no-hardcoded-copy, and catalog-based test policy.

@AGENTS.md

Follow `AGENTS.md` and `.agents/rules/unit-test-coverage.md`. After every code change, run `npm run check:quality` from the workspace root; it checks all discovered npm projects, running build and unit-test coverage first, then typecheck, lint, safe pending migrations, and database integrity. Use `npm run check:changed` for fast changed-file lint, related tests, and affected-project TypeScript checks while editing; it does not replace the full gate.

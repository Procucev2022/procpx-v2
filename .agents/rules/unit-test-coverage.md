---
trigger: always_on
description: "Apply the repository unit-test, 90 percent per-file coverage, timeout, and database persistence requirements to code changes."
---

# Unit testing and coverage policy

- Add or update focused unit tests for every application behavior changed under `src/`.
- Keep unit tests under `unit-tests/`; keep the existing workflow/browser scripts separate.
- Run `npm run test:coverage` after every code change. The command enables Jest `--detectOpenHandles` and enforces at least 90% statements, branches, functions, and lines for every TypeScript/TSX file under `src/`, plus 90% overall.
- `npm run test:coverage` always prints and writes `unit-test-coverage-report.md` with overall metrics and every source file's four percentages, including files below the gate, even when Jest exits because a threshold failed.
- Do not exclude, ignore, or lower the threshold for an application file to make coverage pass. `jest.config.js` discovers every current application file and applies the thresholds individually; newly added files are included on the next run.
- Setups use a 30-second global timeout. Give tests explicit cleanup for timers, servers, database clients, and other resources so open handles are reported.
- Use isolated fixtures for database-backed tests. Never reset, truncate, reseed, or delete shared development data. Follow the database persistence policy in `AGENTS.md` and run the required pre/post integrity check when applicable.
- If the 90% gate fails, add meaningful behavior tests or fix the uncovered behavior before considering the change complete. Report the overall and per-file coverage result.

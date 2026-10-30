---
inclusion: always
---

Follow `AGENTS.md` and `.agents/rules/unit-test-coverage.md`. For each code change, add meaningful unit tests and run `npm run test:coverage`. All application TypeScript and TSX files must meet the 90% line, statement, branch, and function thresholds, file by file and overall. Do not skip files or reduce thresholds. Jest applies a 30-second global timeout and `--detectOpenHandles`.

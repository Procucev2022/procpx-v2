# Agent instructions

Follow `AGENTS.md` and `.agents/rules/unit-test-coverage.md`. For every code change, add meaningful unit tests and run `npm run test:coverage`. Every application file must meet the configured 90% statement, branch, function, and line thresholds; do not skip files or weaken the thresholds. Jest uses a 30-second global timeout and `--detectOpenHandles`.

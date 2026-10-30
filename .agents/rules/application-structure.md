---
trigger: always_on
description: Keep application constants and type declarations in dedicated modules.
---

# Application declaration structure

- Follow the constants, types, and interfaces policy in `AGENTS.md` for every application change.
- Put reusable static values in the owning feature or library's `*.constants.ts` module under `src/`. Keep runtime singletons, mutable process state, request/render-local values, and function implementations in their runtime modules. Preserve Next.js route-segment config literals in route files so Next can analyze them statically.
- Put application interfaces, type aliases, and other type-only declarations in mirrored `types/**/*.types.ts` files outside `src/`; import them with `@app-types/...` and `import type`.
- Preserve existing public type/value import paths by re-exporting moved declarations from the original module where needed.
- Keep constant modules within the 90% per-file coverage gate. Extend feature tests or add focused unit tests whenever a constant module is not already exercised.

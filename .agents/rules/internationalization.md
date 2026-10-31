---
trigger: always_on
description: Keep all proCPX user-facing copy localizable and tested through the UI string catalog.
---

# Internationalization policy

Apply this policy whenever UI, API messages, notifications, validation, or tests change.

## Source of user-facing copy

- Keep all translatable copy in `src/lib/ui-strings.constants.ts` under `UI_STRINGS`. Group entries under `common` or the owning feature namespace. Use descriptive, stable property names; do not derive translation keys from full English sentences or generated hashes.
- Components, pages, layouts, forms, and route handlers must reference the catalog. This includes visible text, button and link names, placeholders, title/alt/ARIA text, tooltips, empty/loading/error states, confirmation dialogs, toasts, validation, and API messages rendered to users.
- Do not hardcode English (or any other locale) in JSX, template literals, conditional branches, object copy fields, or message fallbacks. Add a catalog entry before using new user-facing copy.
- Keep machine values, route paths, protocol names, enum identifiers, database values, user-entered content, and fixture data out of the translation catalog unless a machine value is intentionally displayed as a label. Localize the displayed label separately.
- For provider and server errors, show a catalog-backed user-safe message and keep technical details in structured logs; do not echo arbitrary exception text to users.

## Runtime values and locale behavior

- Put named `{{placeholder}}` tokens in complete sentences and call `interpolateUiString(template, values)` for runtime substitution. Avoid concatenating fragments around runtime data because word order and spacing vary by language.
- Keep every placeholder name stable across locale catalogs. Add a test for interpolation, including missing values and values containing punctuation where relevant.
- Use `I18N_CONFIG.defaultLocale` for the document language and as the source locale. Use `Intl.DateTimeFormat`, `Intl.NumberFormat`, and locale-aware currency formatting with the active locale for dates, amounts, percentages, and plural-sensitive output.
- When another locale is introduced, add a locale catalog with the same keys and placeholder names, add it to `I18N_CONFIG.supportedLocales`, and test catalog completeness. Do not silently fall back to hardcoded English in components.

## Tests and enforcement

- UI tests must assert through `UI_STRINGS`, `interpolateUiString`, or `uiStringPattern`; do not duplicate catalog copy as inline text or regex. Use named fixture constants for business data and identifiers.
- Run `npm run check:i18n` after copy changes. It checks application source for hardcoded user-facing copy and unit tests for assertions that duplicate catalog entries or use placeholder-only entries.
- Run the fast changed-file checks while editing and `npm run check:quality` before handoff. The full gate includes build, per-file 90% unit-test coverage, i18n policy, typecheck, lint, safe pending migrations, and database integrity.

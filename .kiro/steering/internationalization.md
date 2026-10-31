---
inclusion: always
---

Follow `.agents/rules/internationalization.md` for all user-facing copy and tests. Use `UI_STRINGS`, complete messages with named `{{placeholder}}` values, locale-aware `Intl` formatting, catalog-based UI assertions, and `npm run check:i18n` enforcement. Do not hardcode localized copy in components or tests.

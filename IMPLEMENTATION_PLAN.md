# Data Controls — Implementation Plan

> Work plan, **not** a restatement of the assignment. Requirement IDs refer to `REQUIREMENTS.md`. Current statuses reflect only work confirmed in conversation, not a fresh code inspection.

## Current baseline

- [x] Development environment installed (VS Code, Git, .NET, SQL Server, Python, Node/npm).
- [x] ASP.NET Core Web API runs locally.
- [x] `Employee`, `Department`, `AppDbContext` and initial EF migration/database created.
- [x] Initial Git commit made.
- [x] `.github/copilot-instructions.md` created (contents should be verified).
- [ ] Confirm actual repository files and connection/configuration before further code changes.

## Work packages

| Order | Work package | Requirements | Done when |
|---|---|---|---|
| 0 | Freeze requirement baseline and review metadata approach | DB-03, all SUB | Both docs in repo; decide metadata source and acceptance demo |
| 1 | SQL schema export + seed scripts; verify clean setup | DB-01, DB-02, SUB-02 | SQL scripts create fresh DB with valid/invalid rows; no duplicate seed data |
| 2 | Metadata catalog and API with Hebrew business labels — JSON implementation in progress | DB-03, GEN-03, RULE-02, RULE-05 | UI-ready entity/field/relationship metadata; extensibility demonstrated |
| 3 | RuleDefinition contract and validation — API implemented and 43 HTTP cases passed; pending user review | RULE-01, RULE-03, EXEC-03 | Nested AND/OR, constants, field comparisons, nulls; invalid input rejected |
| 4 | Rule persistence and CRUD API — implemented; 23 persistence checks passed on isolated DB; pending review/schema upgrade | DB-04, RULE-04 | Create, edit, reload, reuse rules |
| 5 | Dynamic SQL compiler and read-only executor — draft/saved APIs, resultFields and explanation evidence implemented; 34 compiler/formatter and 71 combined checks passed; pending review/deployment | EXEC-01..06, TECH-04 | Parameterized SQL, allowed identifiers/joins, safe limits, tested outputs |
| 6 | Result explanation, counts and filtering API — Hebrew/structured explanations verified; count and selected columns available; search/filter pending | RESULTS-03..06 | Each violating record has meaningful reason; search/filter works |
| 7 | Angular RTL UI | TECH-05..07, RULE-01..05, RESULTS-01..06, UX-01 | End-to-end create/edit/run/review flow in Hebrew |
| 8 | Python mock AI and approval flow | AI-01..07, TECH-02 | Free text → mock proposal → same rule model → preview/approval → run |
| 9 | Tests, docs, clean-room verification, demo | SUB-01..08, evaluation criteria | Fresh setup succeeds using README and SQL scripts; full checklist verified |

## Architecture decisions currently proposed (subject to review)

- Modular-monolith ASP.NET Core Web API with clear domain/application/infrastructure boundaries.
- EF Core for application persistence; separately validated, parameterized SQL compiler for business rule execution.
- One root entity per rule; related fields reached through metadata-defined relationships.
- Nested logical groups (AND/OR), field-to-constant and field-to-field comparisons.
- Age is a calculated business field derived from birth date.
- Python mock behind an interface/adapter; AI must not generate executable SQL.
- Angular UI in Hebrew and RTL, reusable rule builder components.

## Acceptance and review loop for each package

1. Open `REQUIREMENTS.md`; quote applicable IDs and check if anything is missed.
2. Inspect existing code; do not assume file structure from chat history.
3. Specify API/data contracts and concrete examples before editing.
4. Give Copilot a **single scoped task**, list allowed files, and forbid unrelated refactors.
5. Review diff; run build, tests and manual checks.
6. Update statuses only for demonstrably completed work.
7. Commit with a meaningful message.

## Critical pre-submission gate

- [ ] Fresh SQL Server database created **from submitted SQL scripts**.
- [ ] Data seed includes valid and intentionally invalid cases.
- [ ] Frontend/backend/Python setup instructions work from clean checkout.
- [ ] UI is Hebrew, RTL and responsive.
- [ ] Rule creation/editing/reuse works without writing SQL.
- [ ] Complex AND/OR and cross-table conditions work.
- [ ] No raw SQL accepted from user or AI; SQL execution is read-only.
- [ ] Results show counts, records, failure explanations, search and filters.
- [ ] AI mock produces preview and requires user approval before execution.
- [ ] Architecture, example rules, limitations and AI-tool disclosure included.
- [ ] Requirements traceability table fully reviewed; no mandatory item left unverified.

## First next action

Review per-record explanation support (D-018, docs/RULE_EXPLANATIONS.md). Next implement results search/filtering (package 6), then the UI. Existing developer databases still need reviewed schema setup through script 06; this explanation task adds no migration. Calculated age still requires its own task.

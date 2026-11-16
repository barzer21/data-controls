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

| Order | Work package | Requirements | Current state |
|---|---|---|---|
| 0 | Requirement baseline and metadata approach | DB-03, all SUB | JSON catalog selected; review continues |
| 1 | SQL schema and seed scripts | DB-01, DB-02, SUB-02 | Scripts 01–06 include persisted rule creation origin; existing data preserved |
| 2 | Metadata API and Hebrew labels | DB-03, GEN-03, RULE-02, RULE-05 | Implemented and tested |
| 3 | Rule definition and validation | RULE-01, RULE-03, EXEC-03 | Implemented and tested |
| 4 | Rule persistence and CRUD | DB-04, RULE-04 | Implemented and tested |
| 5 | SQL compiler and read-only executor | EXEC-01..06, TECH-04 | Draft/saved execution with full employee and department name |
| 6 | Explanations, counts, search and filtering | RESULTS-03..06 | Implemented via API; UI pending |
| 7 | Angular Hebrew RTL UI | TECH-05..07, RULE-01..05, RESULTS-01..06, UX-01 | First increment: Angular setup + saved list with server pagination; 10 tests, live proxy and Edge checks (docs/FRONTEND_LIST.md) |
| 8 | Python AI mock and approval flow | AI-01..07, TECH-02 | Implemented: five mock examples, metadata contract, validated .NET adapter and Angular approval flow; 69 UI tests and live backend/Python checks; browser demo pending |
| 9 | Documentation and clean setup verification | SUB-01..08 | In progress |

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

Review the AI flow in a browser with Angular, .NET and Python running (docs/AI_SERVICE.md). Five mock examples, business metadata, shared server validation, editable proposal review and explicit approval before save/run are implemented. Saved-rule editing now uses a guarded full-page route, and related boolean comparisons enforce type-compatible options; 84 frontend tests and live backend/Python checks pass. Native Edge UI checks cover full-page editing, branding, boolean controls and dialog close behavior. The full live three-service browser demo remains pending. Future increments include true backend result pagination, rule deletion in the UI. Calculated age is implemented; see docs/CALCULATED_FIELDS.md.

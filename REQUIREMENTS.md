# Data Controls — Requirements Traceability

> Source of truth: `מטלת בית - תוכניתן רמה ג 58-2026.docx`.
> This document distinguishes **explicit assignment requirements** from implementation choices. Statuses: `Not started`, `In progress`, `Implemented`, `Verified`.
> Do not mark `Verified` until an observable test/demo and relevant deliverable have been checked.

Documentation review: 2026-11-16. Implemented describes existing code and deliverables; it does not certify a clean installation or final live browser demonstration. Historical evidence retains its original scope.

## General and data

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| GEN-01 | Build a web application with frontend, backend and database | Implemented Angular/API/SQL flow and HTTP checks; full clean-checkout/browser submission walkthrough pending | Implemented |
| GEN-02 | Generic controls: add/change controls without dedicated code per rule | Metadata-driven full-page editor, generic comparisons/groups | Implemented |
| GEN-03 | Business users need no SQL/schema/relationship knowledge | Business labels, related field selection and create/edit/run UI | Implemented |
| DB-01 | Sample database with multiple related tables | SQL schema and FK relationship(s) | In progress |
| DB-02 | Sample valid and invalid business data | Seed script and verified sample cases | In progress |
| DB-03 | Rule engine works generically, not based on table/field names hardcoded in code | New table + catalog entity/field executed without code changes | Verified |
| DB-04 | Store control definitions | 23 persistence checks passed, including persist/restart/reload on isolated SQL DB | Verified |

## Stage A — Rule authoring, execution and results

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| RULE-01 | Create a control with name and description | Full-page name/description fields, server validation and create/edit browser checks | Implemented |
| RULE-02 | Select business data to check | Metadata-based entity and field selectors, including relationship labels | Implemented |
| RULE-03 | Define logical conditions, including combinations | Recursive AND/OR editor, typed comparisons and nested-tree tests | Implemented |
| RULE-04 | Save, edit and reuse controls | Explicit save/edit, reopen and separate unsaved execution checked in browser | Implemented |
| RULE-05 | Display business-friendly data and relationships rather than technical table/column names | Metadata business labels used in list, editor and executed-condition summary | Implemented |
| EXEC-01 | Generic translation of rule definition to dynamic SQL | 49 compiler/formatter checks; full employee results and new-table execution verified | Verified |
| EXEC-02 | Support complex conditions and relationships between tables | Nested groups, field comparisons, cross-table and missing-relation checks passed | Verified |
| EXEC-03 | Separate rule definition from query implementation | Distinct definition, validator, compiler, executor and shared draft/saved orchestration | Implemented |
| EXEC-04 | Prevent dangerous commands or data modification | Typed parameters, allowlisted/quoted identifiers, real SQL write-denial and no privileged fallback verified | Verified |
| EXEC-05 | Handle errors and display appropriate messages | API error tests and UI error/retry/save-failure checks; full live submission review pending | Implemented |
| EXEC-06 | Return records violating the control | Expected sample counts/records, dates, NULL and joins verified via execution tests | Verified |
| RESULTS-01 | Show list of defined controls | Angular list implemented; 10 UI/HTTP tests and live proxy + Edge checks | Implemented |
| RESULTS-02 | Execute a control from the list | Run action opens dedicated results route; executes displayed saved snapshot without saving | Implemented |
| RESULTS-03 | Show violation count | Results page displays total count, zero state and explicit truncation | Implemented |
| RESULTS-04 | Show violating records in a table | Generic table uses server columns, IDs and typed values; live desktop Edge check | Implemented |
| RESULTS-05 | Explain why each record failed | Per-row Hebrew failureReason displayed; structured explanation remains available in response | Implemented |
| RESULTS-06 | Search and filter results | Server-backed search and typed filters in saved/draft results, including age; matching/evaluated counts | Implemented |
| UX-01 | Clear, convenient, responsive UI | Saved-list desktop/mobile Edge review completed; other screens pending | In progress |

## Stage B — AI readiness (mock)

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| AI-01 | Free-text control description input | Dedicated Angular page with description input and five selectable examples; docs/AI_SERVICE.md | Implemented |
| AI-02 | Infrastructure to supply schema and business semantics to future AI model | Server supplies public business metadata; Pydantic contract and reference checks; docs/AI_SERVICE.md | Implemented |
| AI-03 | Define expected AI response structure | Pydantic models/OpenAPI and existing RuleDefinition contract; python-ai/models.py | Implemented |
| AI-04 | Demonstrate receiving AI response using mock | Five Python mock examples checked over live HTTP; docs/AI_SERVICE.md | Implemented |
| AI-05 | Translate AI response to Stage A control definition | Typed RuleDefinition and shared RuleValidator; live integration checks | Implemented |
| AI-06 | Show proposed control for user approval before execution | Shared editor review, approval reset on edits; 115 frontend tests and fixture-based browser checks; full live browser demo pending | Implemented |
| AI-07 | Decouple AI mechanism from rule execution, enabling model replacement | IAiRuleProposalProvider, separate Angular API service and same executor | Implemented |
| AI-OPTIONAL | Optional: proactively propose controls based on schema | Design only if time permits | Not started |

## Mandatory technology

| ID | Explicit requirement | Acceptance evidence | Status |
|---|---|---|---|
| TECH-01 | .NET Web API | Running backend | Implemented |
| TECH-02 | Python | Local FastAPI mock service, pinned dependencies and documented startup; python-ai/README.md | Implemented |
| TECH-03 | SQL Server | Running DB and scripts | In progress |
| TECH-04 | Secure dynamic SQL mechanisms | Parameterization/identifier quoting and real restricted-SQL-identity tests passed | Verified |
| TECH-05 | Angular | Angular 22 builds and runs against local API | Implemented |
| TECH-06 | Hebrew UI and RTL | Hebrew/RTL list, manual editor, AI review and results; desktop/mobile browser checks, final submission walkthrough pending | Implemented |
| TECH-07 | Reusable frontend components | Shared recursive condition editor, full-page editor, summary, result table and pagination | Implemented |
| TECH-08 | Organized architecture and separation of responsibilities | docs/ARCHITECTURE.md and docs/CODE_GUIDE.md; final human review pending | Implemented |

## Mandatory submission artifacts

| ID | Explicit requirement | Deliverable | Status |
|---|---|---|---|
| SUB-01 | Complete frontend and backend source | `frontend/`, `backend/`, Python component | In progress |
| SUB-02 | Scripts to create DB and load sample data | SQL scripts 01-06, persistence and read-only permissions; final clean-checkout validation pending | In progress |
| SUB-03 | Installation and run instructions | README.md covers database, dependencies and three services; clean-checkout validation pending | Implemented |
| SUB-04 | Short architecture and rule engine description | docs/ARCHITECTURE.md | Implemented |
| SUB-05 | Examples of definable/runnable controls | docs/EXAMPLE_RULES.md and docs/examples/*.json; final browser demonstration pending | Implemented |
| SUB-06 | Stage B demonstration using mock | Three-process flow implemented; live backend/Python and Angular approval tests pass; full browser demo pending | In progress |
| SUB-07 | Assumptions, limitations and possible extensions | DECISIONS.md | Implemented |
| SUB-08 | AI tools used and purpose of each | docs/AI_USAGE.md; author review before submission pending | Implemented |

## Evaluation criteria (review gates, not extra functional requirements)

- Generic extension without code per control.
- Separation between rule definition, SQL translation and execution.
- Business accessibility and UX.
- Backend API structure, security and error handling.
- Frontend components, state management and UX.
- SQL relationships, data and performance.
- Future AI model flexibility.
- Readability, maintainability, tests and edge cases.

## Assignment examples (demonstrations, not separate hard-coded rule implementations)

1. Employee younger than 18 **and** salary greater than 15,000.
2. Employment end date before start date.
3. Active employee assigned to inactive department.
4. Records missing business-required data.

## Decisions requiring explicit review

- **Metadata source resolved (D-010):** The server JSON catalog behind IMetadataProvider is validated against SQL Server. A new table/catalog mapping has been executed without dedicated rule code. No technical mappings are accepted from users or AI.
- **SQL scripts vs migrations:** EF Core migrations already exist. Submission SQL scripts must also create the schema and seed data independently. Keep both paths consistent; do not run both schema-creation paths against the same fresh database.
- **Python role:** The assignment requires Python but does not explicitly prescribe FastAPI or a separate service. The implemented Python mock service is a design decision, not an assignment mandate.
- **One root entity per rule:** Our design decision, not explicitly stated in the assignment; document as an assumption.
- **Stored rule execution results:** Optional architectural choice; the assignment requires showing results, not necessarily persisting every execution.

## Review protocol

For every task: (1) cite requirement IDs; (2) state design choices separately; (3) define acceptance tests; (4) implement; (5) verify; (6) update status and document evidence; (7) commit. Before submission, verify every mandatory `SUB-*`, `TECH-*`, and functional requirement. Do not infer completion from code generation alone.

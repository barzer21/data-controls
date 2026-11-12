# Data Controls — Requirements Traceability

> Source of truth: `מטלת בית - תוכניתן רמה ג 58-2026.docx`.
> This document distinguishes **explicit assignment requirements** from implementation choices. Statuses: `Not started`, `In progress`, `Implemented`, `Verified`.
> Do not mark `Verified` until an observable test/demo and relevant deliverable have been checked.

## General and data

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| GEN-01 | Build a web application with frontend, backend and database | UI, API and database run together | Not started |
| GEN-02 | Generic controls: add/change controls without dedicated code per rule | Create two different controls from UI without code edits | Not started |
| GEN-03 | Business users need no SQL/schema/relationship knowledge | Business metadata API implemented; UI create/run demonstration remains pending | In progress |
| DB-01 | Sample database with multiple related tables | SQL schema and FK relationship(s) | In progress |
| DB-02 | Sample valid and invalid business data | Seed script and verified sample cases | In progress |
| DB-03 | Rule engine works generically, not based on table/field names hardcoded in code | New table + catalog entity/field executed without code changes; see docs/RULE_EXECUTION.md | Verified |
| DB-04 | Store control definitions | 23 persistence checks passed, including persist/restart/reload on isolated SQL DB; see docs/RULE_PERSISTENCE.md | Verified |

## Stage A — Rule authoring, execution and results

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| RULE-01 | Create a control with name and description | Definition, validation and persisted API values verified; UI pending | In progress |
| RULE-02 | Select business data to check | Metadata API available; business field selector remains pending | In progress |
| RULE-03 | Define logical conditions, including combinations | Nested AND/OR validation verified via HTTP; UI + execution demo pending | In progress |
| RULE-04 | Save, edit and reuse controls | Save/edit/reopen/execute verified via API; UI demonstration pending | In progress |
| RULE-05 | Display business-friendly data and relationships rather than technical table/column names | Hebrew metadata API available; UI demonstration remains pending | In progress |
| EXEC-01 | Generic translation of rule definition to dynamic SQL | 25 compiler checks; multiple rule types, selected fields and new-table execution verified in docs/RULE_EXECUTION.md | Verified |
| EXEC-02 | Support complex conditions and relationships between tables | Nested groups, field comparisons, cross-table and missing-relation checks passed | Verified |
| EXEC-03 | Separate rule definition from query implementation | Distinct definition, validator, compiler, executor and shared draft/saved orchestration | Implemented |
| EXEC-04 | Prevent dangerous commands or data modification | Typed parameters, allowlisted/quoted identifiers, real SQL write-denial and no privileged fallback verified | Verified |
| EXEC-05 | Handle errors and display appropriate messages | Invalid definitions, missing ID, denied SELECT and real timeout verified via API; UI display pending | In progress |
| EXEC-06 | Return records violating the control | Expected sample counts/records, dates, NULL and joins verified via execution tests | Verified |
| RESULTS-01 | Show list of defined controls | Paginated summaries API implemented; list page pending | In progress |
| RESULTS-02 | Execute a control from the list | Saved execution API implemented; list Run action pending UI | In progress |
| RESULTS-03 | Show violation count | Exact count beyond returned-row limit verified via API; UI display pending | In progress |
| RESULTS-04 | Show violating records in a table | Selected root/related fields and Hebrew column metadata returned by API; persisted selection verified; grid pending | In progress |
| RESULTS-05 | Explain why each record failed | Per-record failure reason | Not started |
| RESULTS-06 | Search and filter results | Search/filter demonstration | Not started |
| UX-01 | Clear, convenient, responsive UI | Desktop/mobile viewport review | Not started |

## Stage B — AI readiness (mock)

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| AI-01 | Free-text control description input | UI text input | Not started |
| AI-02 | Infrastructure to supply schema and business semantics to future AI model | Schema/business metadata payload contract | Not started |
| AI-03 | Define expected AI response structure | Documented JSON schema/DTO and sample | Not started |
| AI-04 | Demonstrate receiving AI response using mock | Mock returns example proposal | Not started |
| AI-05 | Translate AI response to Stage A control definition | Same rule model/validator | Not started |
| AI-06 | Show proposed control for user approval before execution | Preview + approve step | Not started |
| AI-07 | Decouple AI mechanism from rule execution, enabling model replacement | AI adapter boundary and same executor | Not started |
| AI-OPTIONAL | Optional: proactively propose controls based on schema | Design only if time permits | Not started |

## Mandatory technology

| ID | Explicit requirement | Acceptance evidence | Status |
|---|---|---|---|
| TECH-01 | .NET Web API | Running backend | Implemented |
| TECH-02 | Python | Python component included and documented | Not started |
| TECH-03 | SQL Server | Running DB and scripts | In progress |
| TECH-04 | Secure dynamic SQL mechanisms | Parameterization/identifier quoting and real restricted-SQL-identity tests passed; docs/RULE_EXECUTION.md | Verified |
| TECH-05 | Angular | Running frontend | Not started |
| TECH-06 | Hebrew UI and RTL | Visible Hebrew + RTL layout | Not started |
| TECH-07 | Reusable frontend components | Shared rule-building components | Not started |
| TECH-08 | Organized architecture and separation of responsibilities | Architecture document and code review | Not started |

## Mandatory submission artifacts

| ID | Explicit requirement | Deliverable | Status |
|---|---|---|---|
| SUB-01 | Complete frontend and backend source | `frontend/`, `backend/`, Python component | In progress |
| SUB-02 | Scripts to create DB and load sample data | SQL scripts 01–06, including result-field persistence and read-only permissions; fresh setup verified by execution checks | In progress |
| SUB-03 | Installation and run instructions | `README.md` | In progress |
| SUB-04 | Short architecture and rule engine description | `docs/ARCHITECTURE.md` | Not started |
| SUB-05 | Examples of definable/runnable controls | `docs/EXAMPLE_RULES.md` and demo | Not started |
| SUB-06 | Stage B demonstration using mock | Running AI mock demo | Not started |
| SUB-07 | Assumptions, limitations and possible extensions | `docs/ASSUMPTIONS_AND_LIMITATIONS.md` | Not started |
| SUB-08 | AI tools used and purpose of each | `docs/AI_USAGE.md` | Not started |

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

- **Metadata generality risk:** The assignment says not to rely on table/field names hardcoded in code. A fixed C# `MetadataRegistry` is an implementation shortcut that may not fully satisfy DB-03. Decide on a database-backed/configuration-driven metadata catalog, or document and convincingly demonstrate an extensible provider before implementing the rule engine.
- **SQL scripts vs migrations:** EF Core migrations already exist. Submission SQL scripts must also create the schema and seed data independently. Keep both paths consistent; do not run both schema-creation paths against the same fresh database.
- **Python role:** The assignment requires Python but does not explicitly prescribe FastAPI or a separate service. A Python mock service is our proposed design, not an assignment mandate.
- **One root entity per rule:** Our design decision, not explicitly stated in the assignment; document as an assumption.
- **Stored rule execution results:** Optional architectural choice; the assignment requires showing results, not necessarily persisting every execution.

## Review protocol

For every task: (1) cite requirement IDs; (2) state design choices separately; (3) define acceptance tests; (4) implement; (5) verify; (6) update status and document evidence; (7) commit. Before submission, verify every mandatory `SUB-*`, `TECH-*`, and functional requirement. Do not infer completion from code generation alone.

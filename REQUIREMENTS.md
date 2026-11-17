# Data Controls — Requirements Traceability

> Source of truth: `מטלת בית - תוכניתן רמה ג 58-2026.docx`.
> This document distinguishes **explicit assignment requirements** from implementation choices. Statuses: `Not started`, `In progress`, `Implemented`, `Verified`.
> Do not mark `Verified` until an observable test/demo and relevant deliverable have been checked.

Submission verification updated: 2026-11-17. Deliverables checked against the original assignment DOCX. SQL scripts 01-07 now also pass an automated isolated-DB regression (47 checks, including all ten seeded controls and repeated seeding); frontend dependencies reinstalled; Python dependencies installed in a fresh virtual environment. Live Angular/.NET/Python browser flow passed. A fresh GitHub clone of 5e3e488 was installed and checked on 2026-11-17 on the same machine: builds, automated frontend/Python/.NET tests, isolated SQL setup and persistence/execution, browser regression against a simulated API and separate live Python integration. Another-machine installation remains untested. Historical evidence below retains its original scope; current results are recorded in README.md.

## General and data

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| GEN-01 | Build a web application with frontend, backend and database | Live Angular/.NET/Python walkthrough recorded on 2026-11-16; current fixture-based browser regression passed. Fresh-clone checks passed on 2026-11-17; another-machine installation not tested. | Verified |
| GEN-02 | Generic controls: add/change controls without dedicated code per rule | Metadata-driven full-page editor, generic comparisons/groups | Implemented |
| GEN-03 | Business users need no SQL/schema/relationship knowledge | Business labels, related field selection and create/edit/run UI | Implemented |
| DB-01 | Sample database with multiple related tables | SQL scripts recreated related Employees/Departments tables and Rules storage | Verified |
| DB-02 | Sample valid and invalid business data | 20 employees and 5 departments seeded; executable examples demonstrate valid/invalid cases | Verified |
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
| EXEC-05 | Handle errors and display appropriate messages | Shared safe API error handling; frontend error/retry tests and live AI upstream error checks passed on 2026-11-16. | Verified |
| EXEC-06 | Return records violating the control | Expected sample counts/records, dates, NULL and joins verified via execution tests | Verified |
| RESULTS-01 | Show list of defined controls | Angular list implemented; 10 UI/HTTP tests and live proxy + Edge checks | Implemented |
| RESULTS-02 | Execute a control from the list | Run action opens dedicated results route; executes displayed saved snapshot without saving | Implemented |
| RESULTS-03 | Show violation count | Results page displays total count, zero state and explicit truncation | Implemented |
| RESULTS-04 | Show violating records in a table | Generic table uses server columns, IDs and typed values; live desktop Edge check | Implemented |
| RESULTS-05 | Explain why each record failed | Per-row Hebrew failureReason displayed; structured explanation remains available in response | Implemented |
| RESULTS-06 | Search and filter results | Server-backed search and typed filters in saved/draft results, including age; matching/evaluated counts | Implemented |
| UX-01 | Clear, convenient, responsive UI | Desktop/mobile workflow regression passed for manual creation, editing, AI approval and results/filtering; final human usability review remains open. | Implemented |

## Stage B — AI readiness (mock)

| ID | Explicit requirement from assignment | Acceptance evidence | Status |
|---|---|---|---|
| AI-01 | Free-text control description input | Dedicated Angular page with description input and five selectable examples; docs/AI_SERVICE.md | Implemented |
| AI-02 | Infrastructure to supply schema and business semantics to future AI model | Server supplies public business metadata; Pydantic contract and reference checks; docs/AI_SERVICE.md | Implemented |
| AI-03 | Define expected AI response structure | Python/.NET share 39 contract fixtures: eight operators, optional description, strict properties/types and tree limits; both suites passed. | Verified |
| AI-04 | Demonstrate receiving AI response using mock | Five Python mock examples checked over live HTTP; docs/AI_SERVICE.md | Implemented |
| AI-05 | Translate AI response to Stage A control definition | Typed RuleDefinition and shared RuleValidator; live integration checks | Implemented |
| AI-06 | Show proposed control for user approval before execution | Live walkthrough recorded on 2026-11-16; current 180 frontend tests and desktop/mobile browser regression cover approval and reset after editing. | Verified |
| AI-07 | Decouple AI mechanism from rule execution, enabling model replacement | IAiRuleProposalProvider, separate Angular API service and same executor | Implemented |
| AI-OPTIONAL | Optional: proactively propose controls based on schema | docs/AI_RULE_SUGGESTIONS_PLAN.md describes scope, contracts, integration, validation, user approval and acceptance checks; design only, no implementation | Implemented |

## Mandatory technology

| ID | Explicit requirement | Acceptance evidence | Status |
|---|---|---|---|
| TECH-01 | .NET Web API | Running backend | Implemented |
| TECH-02 | Python | Local FastAPI mock service, pinned dependencies and documented startup; python-ai/README.md | Implemented |
| TECH-03 | SQL Server | SQL Server setup, API execution and permission checks passed | Verified |
| TECH-04 | Secure dynamic SQL mechanisms | Parameterization/identifier quoting and real restricted-SQL-identity tests passed | Verified |
| TECH-05 | Angular | Angular 22 builds and runs against local API | Implemented |
| TECH-06 | Hebrew UI and RTL | Hebrew/RTL list, manual editor, AI review and results; desktop/mobile browser checks, final submission walkthrough pending | Implemented |
| TECH-07 | Reusable frontend components | Shared recursive editor/results; typed comparison operators, labels and field-type compatibility centralized in core/rules/comparison-operators.ts. | Verified |
| TECH-08 | Organized architecture and separation of responsibilities | docs/ARCHITECTURE.md and docs/UI_COMPONENTS.md describe the implemented structure; docs/ARCHITECTURE_AUDIT.md records review findings and current disposition. | Implemented |

## Mandatory submission artifacts

| ID | Explicit requirement | Deliverable | Status |
|---|---|---|---|
| SUB-01 | Complete frontend and backend source | frontend/, backend/ and python-ai/ present; .NET and Angular builds passed | Verified |
| SUB-02 | Scripts to create DB and load sample data | Test-SubmissionSetup.ps1: 47 checks against a unique disposable DB, scripts 01-07, 20 employees, 5 departments, 10 controls, reader permissions, validation/execution and repeated seed preserving edits. | Verified |
| SUB-03 | Installation and run instructions | README.md commands checked; npm ci and fresh Python environment installation passed; all three services started | Verified |
| SUB-04 | Short architecture and rule engine description | docs/ARCHITECTURE.md reviewed against the submission requirement | Verified |
| SUB-05 | Examples of definable/runnable controls | docs/EXAMPLE_RULES.md and five JSON examples validated/executed against the rebuilt DB | Verified |
| SUB-06 | Stage B demonstration using mock | Live Edge flow: Python mock proposal, approval, draft, save, edit and saved execution passed | Verified |
| SUB-07 | Assumptions, limitations and possible extensions | DECISIONS.md combines design choices, assumptions, limitations and possible extensions | Verified |
| SUB-08 | AI tools used and purpose of each | docs/AI_USAGE.md describes GPT planning and Codex development purposes; author remains responsible for understanding the solution | Verified |

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

# Data Controls - Implementation Plan

> Current state reviewed on 2026-11-17 against the repository and recorded test evidence. Requirement IDs refer to `REQUIREMENTS.md`. Historical verification reports retain their original scope; they are not current test counts.

## Current baseline

- Angular Hebrew/RTL UI supports a saved-control list, manual authoring/editing, AI proposal review and shared draft/saved results with search and typed filters.
- .NET provides storage, validation, SQL compilation, restricted read-only execution and explanations. EF Core handles control storage; execution uses a separate connection under `DataControlsRuleReader`, without a privileged fallback.
- Server-owned metadata maps business entities and fields to DB objects. Users and AI supply business references, not SQL mappings.
- Python provides five deterministic mock examples. Its proposal contract supports all eight comparison operators and optional descriptions; 39 shared fixtures check Python/.NET compatibility. A real AI model remains an extension.
- Scripts 01-07 create the DB, seed business data, configure storage and reader permissions, and load ten editable controls. Controls are not seeded automatically at application startup.
- Pkcs is pinned to 9.0.23. The vulnerability scan recorded in README passed at the time of that check.

## Work packages

| Order | Work package | Requirements | Current state |
|---|---|---|---|
| 0 | Requirement baseline and metadata approach | DB-03, all SUB | Catalog implemented; requirements and review evidence synchronized |
| 1 | DB structure and sample data | DB-01, DB-02, SUB-02 | Scripts 01-07 pass 47 automated checks in a disposable DB |
| 2 | Metadata API and Hebrew labels | DB-03, GEN-03, RULE-02, RULE-05 | Implemented; generic extension and SQL mapping checks recorded |
| 3 | Rule definition and validation | RULE-01, RULE-03, EXEC-03 | Implemented; shared Python/.NET contract fixtures pass |
| 4 | Control storage and CRUD | DB-04, RULE-04 | Implemented; isolated persistence tests recorded; deletion is API-only |
| 5 | SQL compiler and read-only executor | EXEC-01..06, TECH-04 | Implemented; all ten seeded controls validate and execute in the new setup regression |
| 6 | Explanations, counts, search and filtering | RESULTS-03..06 | Implemented in API and shared draft/saved UI; browser regression passes |
| 7 | Angular Hebrew RTL UI | TECH-05..07, RULE-01..05, RESULTS-01..06, UX-01 | Build and 180 tests pass; desktop/mobile workflow regression passes; final human usability review remains open |
| 8 | Python AI mock and approval flow | AI-01..07, TECH-02 | Five live mock proposals and upstream error checks pass; 39 shared contract cases pass in both languages; approval flow checked in browser |
| 9 | Documentation and clean setup verification | SUB-01..08 | Documentation synchronized; isolated SQL setup verified; fresh-clone installation passed on the same machine; another-machine installation remains untested |

## Implemented architecture choices

- One .NET Web API with separate metadata, storage, validation, compilation and execution responsibilities.
- EF Core for application persistence; parameterized SQL for business control execution.
- One root entity per control; related fields reached through catalog-defined relationships.
- Nested AND/OR groups, field-to-constant and field-to-field comparisons; age calculated from birth date.
- Python mock behind an adapter; explicit user approval before using an AI proposal.
- Shared Angular components and one typed comparison-operator definition for editing, filtering and display.
- Numeric UI input has documented precision limits and explicitly rejects unsupported values.

## Verification

Commands and prerequisites are in README and `docs/AI_SERVICE.md`. The current automated setup regression is:

```powershell
dotnet build backend/DataControls.slnx -c Release
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-SubmissionSetup.ps1
```

It needs SQL Server and `sqlcmd`, creates a unique DB, starts a temporary API and drops only that DB in cleanup. It does not reset the development DB. The existing persistence suite keeps its empty-control fixture and remains separate. Browser regression uses a built frontend and a simulated API; live .NET/Python integration is checked separately.

## Pre-submission gate

- [x] A new DB can be created from all seven submitted SQL scripts; ten controls validate and execute.
- [x] Sample data includes intentionally invalid records; repeated control seed preserves edits.
- [x] Local installation/startup commands were exercised in the existing workspace, including dependency reinstallation and a fresh Python environment, as recorded in README.
- [x] Manual authoring/editing, draft/saved execution, results filtering and AI approval have browser evidence.
- [x] Compiler, execution and SQL permission checks have recorded evidence; no raw SQL is accepted from users or AI.
- [x] Architecture, examples, limitations and AI-tool disclosure are present; stale document links and current-state contradictions addressed.
- [x] Fresh clone of 5e3e488 installed and checked on 2026-11-17: builds, 180 Angular tests, Python/.NET contract tests, isolated SQL setup and execution, browser regression and live Python integration.
- [ ] Another-machine installation has not been tested.
- [ ] Complete final human review of usability, requirements and submitted files. `Implemented` rows are not automatically promoted to `Verified`.

## Next work

Remaining findings are tracked in `docs/ARCHITECTURE_AUDIT.md`: metadata reference resolution and other optional maintenance changes. Redundant pre-validation was removed. Navigation-confirmation handling remains unchanged at the user's request. Handle each separately with targeted regression checks. True result pagination, UI deletion and a real AI model are extensions, not completed features.

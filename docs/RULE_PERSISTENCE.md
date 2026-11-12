# Rule persistence and CRUD

Requirements: DB-04, RULE-01, RULE-04; design D-014.

The application stores controls in `dbo.Rules`, separately from sample business data. EF Core handles the writes; business-rule SQL execution is implemented separately in [RULE_EXECUTION.md](RULE_EXECUTION.md).

`SavedRule` stores an identity ID, name (up to 200 characters), optional description (up to 2,000), business root entity ID, condition tree JSON, definition format version (currently 1), and UTC creation/update timestamps. Names may repeat. Version is a format marker, not a revision or concurrency token. The JSON column has an `ISJSON` check constraint; semantic validity is enforced by `RuleValidator` before every API create/update.

Optional `ResultFieldsJson` stores selected result-field references (D-017). NULL preserves root-field defaults for old definitions. GET includes `definition.resultFields`; POST/PUT validate and save it. PUT replaces the full selection, so omission/null resets it. The format version remains 1 for this additive optional property.

`RuleService` coordinates validation, EF persistence and reconstruction of the tree using the same JSON serializer options as the API. It is scoped to the request, like `AppDbContext`; the validator has no database dependency. The existing HTTP definition is unchanged. No generic repository abstraction was added because EF already supplies persistence and there is no second implementation.

## API

| Method | Path | Result |
|---|---|---|
| POST | `/api/rules` | 201 with saved rule and Location header; 400 if invalid |
| GET | `/api/rules?page=1&pageSize=20` | 200 with summaries and total count |
| GET | `/api/rules/{id}` | 200 with full definition, or 404 |
| PUT | `/api/rules/{id}` | 200 with replaced definition; 400 if invalid; 404 if missing |
| DELETE | `/api/rules/{id}` | 204 if deleted; 404 if missing |
| POST | `/api/rules/validate` | Existing validation-only endpoint; no write |

POST and PUT take a `RuleDefinition`, exactly as documented in [RULE_DEFINITION.md](RULE_DEFINITION.md). The saved response wraps it:

```json
{
  "id": 1,
  "definition": {
    "name": "תאריך תחילת העסקה חסר",
    "description": null,
    "rootEntityId": "employee",
    "condition": {
      "kind": "comparison",
      "left": { "fieldId": "startDate", "relationshipPath": null },
      "operator": "isNull",
      "right": null
    }
  },
  "definitionVersion": 1,
  "createdAtUtc": "2026-11-12T10:00:00+00:00",
  "updatedAtUtc": "2026-11-12T10:00:00+00:00"
}
```

GET list returns `{ "items": [...], "totalCount": 2, "page": 1, "pageSize": 20 }`. Summaries contain name, description, root ID, version and timestamps, but not the tree. Ordering is by ascending ID; page must be positive, page size 1–100 and the offset must fit an int. Empty/beyond-last pages return an empty items array. Count and page are separate queries and may reflect concurrent changes.

Updates replace all definition properties, preserve the ID and creation timestamp, and validate before writing. If an update has both a missing ID and invalid content, validation returns 400 first. Updates currently use last-write-wins; there is no edit history, optimistic revision check, authentication or per-user ownership. A simultaneous deletion during save may return 409. DELETE is permanent. These are current limitations, not assignment requirements.

Saved definitions remain readable if the metadata catalog changes; they must pass the current validator on update and before execution. Unsupported stored format versions or corrupt stored trees are server errors, not silently converted. Both execution paths revalidate definitions; GET is not approval to execute.

Semantic failures retain the existing Hebrew validation result. Malformed JSON returns 400; create/update request bodies are limited to 64 KiB (413). Missing rules return Hebrew ProblemDetails (404). SQL/EF errors are logged on the server and return generic Hebrew ProblemDetails (503) without SQL details; input HTTP status codes are preserved by the exception middleware. There is no automatic schema migration on startup.

## Schema setup

`AddSavedRules` (`20261112093455_AddSavedRules`) adds only the Rules table. Existing employee/department data is unaffected.

- New SQL-script install: run scripts 01, 02, 03, then 04. Script 04 selects DataControlsDb, so review/change that USE statement if targeting another database.
- Existing database with InitialCreate: run only `database/04_create_rules.sql` once, or apply the pending EF migration. Do not rerun 02.
- EF setup: run `dotnet ef database update --project backend/DataControls.Api`; seed separately with script 03 if sample data is needed.

`AddRuleResultFields` (`20261112103841_AddRuleResultFields`) adds nullable ResultFieldsJson and its JSON check. For a database already at AddSavedRules, apply only script 06 once or the pending EF migration. For a fresh scripted install also run 06 after 04 (05 sets execution permissions). Existing controls are not deleted or rewritten. The updated EF model requires column 06 for CRUD even if a rule omits resultFields.

Script 06 was generated using `dotnet ef migrations script AddSavedRules AddRuleResultFields`, with an explicit USE and a GO between adding the column and its check so SQL Server compiles the latter after the column exists. Preserve that boundary in SSMS/SQLCMD. Scripts 04/06 are single-application schema scripts, not rerunnable seeds.

The SQL migration body was generated by `dotnet ef migrations script InitialCreate AddSavedRules --project backend/DataControls.Api`, then prefixed with an explicit database selection. It records the same migration ID/version in `__EFMigrationsHistory`. Script 04 is not a rerunnable seed; do not apply it a second time if already recorded. EF uses history to skip applied migrations. Run either the SQL schema path or the EF path for a given migration, not both.

## Verification

```powershell
dotnet build backend/DataControls.slnx
dotnet ef migrations has-pending-model-changes --no-build --project backend/DataControls.Api
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-RulePersistence.ps1
```

The test requires SQLCMD and permission to create a database on localhost. It creates a unique `DataControlsPersistenceTest_<suffix>` database from schema/seed scripts 01–04 and 06 and starts a temporary API on port 5200. The optional execution mode also applies 05. It creates, updates and deletes only test rules, restarts the API to check persistence, and temporarily renames/restores the test Rules table to exercise failure responses. It never changes DataControlsDb or DataControlsTestDb. Test databases and logs are retained for inspection, including on failure; no automatic DROP is performed. The full suite passed 60 assertions after selection support; see RULE_EXECUTION.md for its isolated database and fixtures.

On 2026-11-12, all 23 persistence checks passed against `DataControlsPersistenceTest_81616204`; two rules remain for inspection and the sample data remains at 5 departments/20 employees. Build and EF model/migration consistency checks passed. The developer database has not been upgraded by these tests. The previous failed test run `DataControlsPersistenceTest_f06e0d9c` was also retained. UI editing remains future work; saved execution was later implemented and tested separately. The optional `-IncludeExecution` switch also provisions script 05 and runs the execution suite in the same isolated test database.

Example HTTP requests are in `backend/DataControls.Api/SavedRules.http`. Set `ruleId` to the actual ID returned by creation; PUT sends just the `definition` object, not the response wrapper.

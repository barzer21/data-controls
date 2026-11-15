# Rule persistence and CRUD

Requirements: DB-04, RULE-01, RULE-04; design D-014.

The application stores controls in `dbo.Rules`, separately from sample business data. EF Core handles the writes; business-rule SQL execution is implemented separately in [RULE_EXECUTION.md](RULE_EXECUTION.md).

`SavedRule` stores an identity ID, name (up to 200 characters), optional description (up to 2,000), business root entity ID, condition tree JSON, definition format version (currently 1), and UTC creation/update timestamps. Names may repeat. Version is a format marker, not a revision or concurrency token. The JSON column has an `ISJSON` check constraint; semantic validity is enforced by `RuleValidator` before every API create/update.

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

GET list returns `{ "items": [...], "totalCount": 2, "page": 1, "pageSize": 20 }`. Summaries contain name, description, root ID, version, timestamps and `createdWithAi`, but not the tree. Ordering is by ascending ID; page must be positive, page size 1–100 and the offset must fit an int. Empty/beyond-last pages return an empty items array. Count and page are separate queries and may reflect concurrent changes.

Updates replace all definition properties, preserve the ID and creation timestamp, and validate before writing. If an update has both a missing ID and invalid content, validation returns 400 first. Updates currently use last-write-wins; there is no edit history, optimistic revision check, authentication or per-user ownership. A simultaneous deletion during save may return 409. DELETE is permanent. These are current limitations, not assignment requirements.

Saved definitions remain readable if the metadata catalog changes; they must pass the current validator on update and before execution. Unsupported stored format versions or corrupt stored trees are server errors, not silently converted. Both execution paths revalidate definitions; GET is not approval to execute.

Semantic failures retain the existing Hebrew validation result. Malformed JSON returns 400; create/update request bodies are limited to 64 KiB (413). Missing rules return Hebrew ProblemDetails (404). SQL/EF errors are logged on the server and return generic Hebrew ProblemDetails (503) without SQL details; input HTTP status codes are preserved by the exception middleware. There is no automatic schema migration on startup.

## Schema setup

`AddSavedRules` (`20261112093455_AddSavedRules`) adds only the Rules table. Existing employee/department data is unaffected.

- New SQL-script install: run scripts 01, 02, 03, then 04. Script 04 selects DataControlsDb, so review/change that USE statement if targeting another database.
- Existing database with InitialCreate: run only `database/04_create_rules.sql` once, or apply the pending EF migration. Do not rerun 02.
- EF setup: run `dotnet ef database update --project backend/DataControls.Api`; seed separately with script 03 if sample data is needed.

For the current schema, also apply `AddRuleAiOrigin` (`20261115085736_AddRuleAiOrigin`) or script 06 after the Rules table exists. It adds `CreatedWithAi bit NOT NULL DEFAULT 0` and preserves existing definitions. Existing rows remain untagged; their source cannot be recovered from the previous schema. Script 06 checks EF migration history and can be repeated safely. Manual POST defaults to false; `POST /api/rules?createdWithAi=true` records AI origin. PUT preserves the original flag regardless of query arguments. This is a creation-source label supplied by the application flow, not a security or audit attestation. The flag does not enter RuleDefinition or affect validation/execution.

The SQL migration body was generated by `dotnet ef migrations script InitialCreate AddSavedRules --project backend/DataControls.Api`, then prefixed with an explicit database selection. It records the same migration ID/version in `__EFMigrationsHistory`. Script 04 is not a rerunnable seed; do not apply it a second time if already recorded. EF uses history to skip applied migrations. Run either the SQL schema path or the EF path for a given migration, not both.

## Verification

```powershell
dotnet build backend/DataControls.slnx
dotnet ef migrations has-pending-model-changes --no-build --project backend/DataControls.Api
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-RulePersistence.ps1
```

The test requires SQLCMD and permission to create a database on localhost. It creates a unique `DataControlsPersistenceTest_<suffix>` database from schema/seed scripts 01–04 and starts a temporary API on port 5200. The optional `-IncludeExecution` mode also applies 05. It creates, updates and deletes test rules, restarts the API to check persistence, and temporarily renames/restores the test Rules table to exercise failure responses. The harness retains its database and logs by default; it does not change DataControlsDb or DataControlsTestDb.

On 2026-11-12, the combined suite passed all 93 persistence/execution checks on the clean schema. Build and EF model/migration consistency checks passed. As explicitly requested, the project databases were recreated: DataControlsDb and DataControlsTestDb each contain 5 departments, 20 employees and no saved rules. Old experimental databases and the verification database were removed. UI editing remains future work.

Example HTTP requests are in `backend/DataControls.Api/SavedRules.http`. Set `ruleId` to the actual ID returned by creation; PUT sends just the `definition` object, not the response wrapper.

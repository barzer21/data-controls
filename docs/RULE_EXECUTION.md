# Rule compilation and execution

Requirements: EXEC-01..06, TECH-04; decisions D-003, D-005, D-015 and D-016.

## Two entry points, one engine

- `POST /api/rules/execute?limit=100` accepts a RuleDefinition, validates and executes the draft without saving it or changing another control.
- `POST /api/rules/{id}/execute?limit=100` loads the current saved definition, revalidates it against the current metadata, then uses the same execution service. A missing ID returns 404.

Both return HTTP 200 with the same shape:

```json
{
  "totalCount": 2,
  "returnedCount": 2,
  "truncated": false,
  "columns": [
    { "id": "firstName", "label": "שם פרטי", "type": "text" }
  ],
  "records": [
    { "id": 6, "values": { "firstName": "Yael" } },
    { "id": 16, "values": { "firstName": "Eden" } }
  ]
}
```

The illustration omits other fields for brevity. By default all root fields approved in the catalog are returned. Optional `resultFields` selects 1–50 root/related fields in the requested order (D-017); SQL mappings and SQL text are not returned. Dates are calendar dates. Records are ordered by the root primary key. The optional limit must be 1–500 (default 100). `totalCount` counts all violations in the same SELECT using COUNT_BIG OVER before TOP is applied. `truncated` explicitly reports when not all rows were returned. Zero matches return count zero and an empty records array.

For a selected `{ "fieldId": "name", "relationshipPath": ["employeeDepartment"] }`, `columns` includes ID `employeeDepartment.name` and label `מחלקת העובד ← שם המחלקה`; records include `values["employeeDepartment.name"]`. IDs use canonical catalog spelling. A missing relationship yields null. Display-only related fields add a LEFT JOIN even if no condition uses that relationship; shared paths reuse joins. The root row ID is always separate. Selection persists with the rule. Invalid selections return 400 rather than silently falling back to root fields.

The API currently has no paging beyond this bounded result, result search/filtering or per-record failure reasons. These belong to package 6. There is no Angular UI yet. Future UI actions are Run draft on the editor and Run saved on the list. AI proposals must still require explicit user approval before invoking either execution route. No AI integration/approval UI is implemented by these endpoints.

## Compiler

`RuleSqlCompiler` always calls `RuleValidator` before generating SQL. It creates parenthesized AND/OR conditions, maps only allowed operators, resolves fields and directional relationships through metadata, and quotes identifiers including closing brackets. Constants become named, typed SqlParameters (Unicode text up to 4,000; boolean; decimal with scale; date). Root metadata and SQL parameters are separate from executable SQL text. No user SQL fragment or per-business-rule query is supported. Join aliases are shared for the same relationship path, including case-insensitive IDs.

SQL NULL semantics are preserved, including `notEquals`: UNKNOWN is not a violation unless another OR branch is TRUE. Missing values use IS NULL/IS NOT NULL. All navigations use LEFT JOIN. A nullable related field can be NULL because the relation is missing or because its value is missing; the API does not claim those cases are distinct.

Dates use CONVERT(date, column) on both compared fields, including datetime/datetime2 columns; constants are typed date parameters. This intentionally discards times, without timezone conversion. Conversion may prevent ordinary datetime indexes being used efficiently; large data sets may need date-range compilation or indexed computed columns later. Text equality follows the SQL column collation, including SQL Server's normal trailing-space behavior. Numeric comparisons follow SQL Server numeric conversion rules; no arithmetic/aggregate rule operators or calculated age exist yet.

## Read-only SQL identity

Run `database/05_rule_reader.sql` after creating the business tables. This is repeatable deployment/security setup, not an EF schema migration. It creates `DataControlsRuleReader` WITHOUT LOGIN, grants SELECT on Employees and Departments and denies INSERT, UPDATE, DELETE, EXECUTE and ALTER at database scope. It grants no SELECT on Rules. For another authorized business table, grant SELECT explicitly as part of deployment and register it in metadata. Never grant it db_owner, schema-wide access to application tables or permissions beyond the needed business data.

`RuleExecutor` opens a separate, unpooled SQL connection and immediately runs a fixed EXECUTE AS USER statement before executing compiler output. CRUD remains on its existing EF identity/connection. Closing the unpooled connection ends the impersonated session even after timeout/cancellation, so that identity cannot leak into later CRUD requests. There is no fallback to the privileged identity if impersonation or SELECT permission fails. SQL security setup and the application database user must be controlled by deployment administrators; the JSON catalog alone does not grant database permissions.

The application connection identity must be allowed to impersonate DataControlsRuleReader (the current local Windows database owner/sysadmin can). For a least-privilege application database user, an administrator can grant `IMPERSONATE ON USER::DataControlsRuleReader` to that user, together with its normal application-table CRUD permissions. This app connection still performs approved CRUD; arbitrary SQL is never exposed through the API. A separate login/connection for query execution is a future deployment alternative.

Connection timeout is 10 seconds, impersonation command timeout 10 seconds, SELECT command timeout 15 seconds and execution's linked cancellation deadline 30 seconds. Client cancellation is propagated. SQL timeouts/deadlines return generic Hebrew HTTP 504; other SQL/permission failures return Hebrew HTTP 503 and are logged server-side. Invalid definitions return the existing 400 validation shape; malformed JSON is handled by ASP.NET Core. No execution history is written; D-011 remains open.

## Try and verify

Example requests: `backend/DataControls.Api/Execution.http`. These are POST requests, so use an HTTP client, not a browser navigation. Saved runs take an ID, whereas draft runs take a complete definition. They both require the read-only user to be provisioned in the target database; configuration/source files are not automatically changed by the tests.

```powershell
dotnet run --project backend/tests/CompilerChecks
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-RuleExecution.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-Rules.ps1
```

CompilerChecks is a dependency-free assertion runner (no test framework packages) referencing the API project. It tests SQL generation without SQL execution. The integration wrapper reuses the persistence harness, creates a unique isolated database from scripts 01–05, and starts a temporary API. Its fixtures change test salaries/dates, add a new table and grant only that table's SELECT to verify metadata-driven extension, briefly revoke a SELECT grant to prove no privileged fallback, and hold a lock to verify the real 15-second timeout. The test restores temporary permissions/catalog settings and rolls back the lock transaction. Test databases/logs are retained, not automatically dropped. Existing databases are not modified.

Verification on 2026-11-12: 25 compiler checks and 60 combined persistence/execution assertions passed, including 23 preexisting persistence checks and selection round trips across restart/update. Full integration test database: `DataControlsPersistenceTest_2deed1e0`. It contains two saved rules, 20 employees, 5 departments and the extra ExecutionAccounts test table. Fixture data differs from the standard seed. Scripts 01–06 were applied, including the nullable projection column. Earlier test databases from failed runs were retained for inspection. Dependency vulnerability warnings already documented in README remain unresolved.

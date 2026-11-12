# Data Controls

## Execute draft or saved rules

`POST /api/rules/execute` runs an unsaved rule using `{ "definition": { ... }, "options": { ... } }`; `POST /api/rules/{id}/execute` runs the saved definition with an optional `{ "options": { ... } }` body. Both validate against the current catalog and share the parameterized compiler and read-only executor. Neither saves a draft or execution history. `?limit=100` controls returned rows (maximum 500); the response includes the total count and a truncation flag. Old bare-definition draft execution bodies must now be wrapped; CRUD/validation request bodies are unchanged.

Optional `options.search` searches displayed text fields; `options.filter` uses the existing condition tree on displayed result fields. They apply in SQL before the limit/count and do not change the original rule or its explanations. See [docs/RESULT_FILTERING.md](docs/RESULT_FILTERING.md) and `backend/DataControls.Api/Filtering.http` for examples and validation rules. No migration is required.

Provision the read-only SQL user with `database/05_rule_reader.sql` before executing controls. The application identity needs permission to impersonate that user. SQL scripts/migrations alone do not automatically apply this permission setup. See [docs/RULE_EXECUTION.md](docs/RULE_EXECUTION.md) for setup, semantics, limits and tests; examples are in `backend/DataControls.Api/Execution.http`.

Each violating record also contains a Hebrew `failureReason` and structured `explanation` tree with actual/expected values. SQL determines which branches matched, including NULL and nested groups; C# formats the evidence. Results include the full employee record and department name. See [docs/RULE_EXPLANATIONS.md](docs/RULE_EXPLANATIONS.md) for the response and tests.

## Save, open and edit rules

The API now supports create/list/get/update/delete under `/api/rules`. Apply the `AddSavedRules` migration or run `database/04_create_rules.sql` once on a database with InitialCreate before using persistence endpoints. Existing databases are not upgraded automatically. Validation and metadata endpoints continue to work without the Rules table.

See [docs/RULE_PERSISTENCE.md](docs/RULE_PERSISTENCE.md) for API response shapes, schema upgrade paths, limitations and verification. Example requests: `backend/DataControls.Api/SavedRules.http`. The persistence test creates its own database: `powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-RulePersistence.ps1`.

## Validate a rule definition

`POST http://localhost:5037/api/rules/validate` validates a JSON expression tree against the metadata catalog. It does not save or execute the rule. Example requests are in `backend/DataControls.Api/Rules.http`; the contract, supported operators, limits and response shapes are documented in [docs/RULE_DEFINITION.md](docs/RULE_DEFINITION.md).

After building, run `powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-Rules.ps1`. This uses a temporary API and the test database's schema. All 43 rule validation HTTP cases passed on 2026-11-12; the UI remains future work.

## Run the API and inspect metadata

Requires the .NET 10 SDK and the SQL Server database created below. From the repository root:

```powershell
dotnet build backend/DataControls.slnx
dotnet run --project backend/DataControls.Api --launch-profile http
```

Open `http://localhost:5037/api/metadata`. The response contains business IDs, Hebrew labels, field types and directional relationships, without SQL table/column mappings.

The trusted server configuration is `backend/DataControls.Api/Metadata/metadata.json`. At startup the API checks IDs, references, supported types, physical columns, single-column primary keys and enabled/trusted single-column foreign keys. Invalid configuration or an unavailable database prevents startup. Check the server log for details. Changes require restart. Mappings use the exact identifier spelling from the database. No SQL text or expressions are accepted in the catalog.

Version 1 supports direct text/number/date/boolean fields and employee-to-department navigation (many-to-one). Calculated age and reverse collection navigation are not implemented yet. Execution compares date fields by calendar date, without time or timezone conversion (D-015).

After building, run the repeatable integration checks against the previously created test database:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-Metadata.ps1
```

The checks use temporary content directories and a temporary API on port 5198. They only read database schema; they do not edit the source catalog or business data. They cover the API contract, Hebrew labels, a JSON-only field addition and invalid catalogs. Temporary catalogs and logs are retained at the printed path. An alternative test connection can be passed using `-ConnectionString`.

Verification on 2026-11-12: build succeeded and metadata integration checks passed against the clean `DataControlsTestDb`, including related-column configuration validation. The build reported NU1902/NU1903 for the existing transitive dependency `System.Security.Cryptography.Pkcs` 9.0.4; dependency remediation remains pending. No UI requirement is marked verified by these checks.

## Initialize the sample database in SSMS

The SQL scripts create the `DataControlsDb` database used by the development connection string in `backend/DataControls.Api/appsettings.Development.json`.

For a fresh database, run these scripts once in numeric order in SSMS:

1. `database/01_create_database.sql`
2. `database/02_create_tables.sql`
3. `database/03_seed_data.sql`
4. `database/04_create_rules.sql`
5. `database/05_rule_reader.sql`

Scripts 02/04 create the schema and record InitialCreate/AddSavedRules in EF history. Alternatively run `dotnet ef database update --project backend/DataControls.Api`, then seed with 03 and provision permissions with 05. Do not run both schema paths for the same migration. Script 03 can be repeated without adding duplicate seed rows; script 05 is repeatable permission setup.

Employee runs return all employee fields, departmentId and department name, with the employee ID separately in record.id. The server catalog's relatedColumns setting supplies the related name without request-level column selection.

## Verify the database in SSMS

After running all five scripts, open a new query window and execute:

```sql
USE [DataControlsDb];

SELECT
    (SELECT COUNT(*) FROM [dbo].[Departments]) AS DepartmentCount,
    (SELECT COUNT(*) FROM [dbo].[Employees]) AS EmployeeCount;

SELECT [MigrationId], [ProductVersion]
FROM [dbo].[__EFMigrationsHistory];

SELECT e.[FirstName], e.[LastName], e.[Salary], e.[BirthDate]
FROM [dbo].[Employees] AS e
WHERE e.[BirthDate] > DATEADD(YEAR, -18, CONVERT(date, GETDATE()))
  AND e.[Salary] > 15000;

SELECT [FirstName], [LastName], [StartDate], [EndDate]
FROM [dbo].[Employees]
WHERE [EndDate] < [StartDate];

SELECT e.[FirstName], e.[LastName], d.[Name] AS DepartmentName
FROM [dbo].[Employees] AS e
INNER JOIN [dbo].[Departments] AS d ON d.[Id] = e.[DepartmentId]
WHERE e.[IsActive] = 1 AND d.[IsActive] = 0;

SELECT [FirstName], [LastName]
FROM [dbo].[Employees]
WHERE [StartDate] IS NULL;

SELECT [FirstName], [LastName]
FROM [dbo].[Employees]
WHERE [DepartmentId] IS NULL;

SELECT [Name]
FROM [dbo].[Departments]
WHERE [IsActive] = 1 AND [ManagerName] IS NULL;
```

On the initial clean setup, the counts should be 5 departments and 20 employees, and each of the six business-rule checks should return at least one row. The migration history query should include `20261112080545_InitialCreate` with product version `10.0.0`.

The migration history should also include `20261112093455_AddSavedRules` after script 04. Rules starts empty; controls are created through the API.

The existing schema represents a department manager as nullable `ManagerName` text; it does not define a manager entity or foreign key. Therefore, the no-manager sample is represented by an active department whose `ManagerName` is `NULL`.

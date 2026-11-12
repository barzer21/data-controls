# Data Controls

## Validate a rule definition

`POST http://localhost:5037/api/rules/validate` validates a JSON expression tree against the metadata catalog. It does not save or execute the rule. Example requests are in `backend/DataControls.Api/Rules.http`; the contract, supported operators, limits and response shapes are documented in [docs/RULE_DEFINITION.md](docs/RULE_DEFINITION.md).

After building, run `powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-Rules.ps1`. This uses a temporary API and the test database's schema. All 43 rule validation HTTP cases passed on 2026-11-12; persistence, SQL compilation and UI remain future work.

## Run the API and inspect metadata

Requires the .NET 10 SDK and the SQL Server database created below. From the repository root:

```powershell
dotnet build backend/DataControls.slnx
dotnet run --project backend/DataControls.Api --launch-profile http
```

Open `http://localhost:5037/api/metadata`. The response contains business IDs, Hebrew labels, field types and directional relationships, without SQL table/column mappings.

The trusted server configuration is `backend/DataControls.Api/Metadata/metadata.json`. At startup the API checks IDs, references, supported types, physical columns, single-column primary keys and enabled/trusted single-column foreign keys. Invalid configuration or an unavailable database prevents startup. Check the server log for details. Changes require restart. Mappings use the exact identifier spelling from the database. No SQL text or expressions are accepted in the catalog.

Version 1 supports direct text/number/date/boolean fields and employee-to-department navigation (many-to-one). Calculated age, reverse collection navigation and rule execution are not implemented yet. Date fields currently map SQL date/datetime values; date/time comparison semantics will be defined with the rule contract.

After building, run the repeatable integration checks against the previously created test database:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-Metadata.ps1
```

The checks use temporary content directories and a temporary API on port 5198. They only read database schema; they do not edit the source catalog or business data. They cover the API contract, Hebrew labels, a JSON-only field addition and invalid catalogs. Temporary catalogs and logs are retained at the printed path. An alternative test connection can be passed using `-ConnectionString`.

Verification on 2026-11-12: build and publish succeeded; the published output included `Metadata/metadata.json`. All seven integration cases passed against `DataControlsTestDb`: valid catalog, JSON-only extension, duplicate field, unknown entity, missing column, incompatible type and invalid relationship. The build reported NU1902/NU1903 for the existing transitive dependency `System.Security.Cryptography.Pkcs` 9.0.4; dependency remediation remains pending. No rule-engine or UI requirement is marked verified by these checks.

## Initialize the sample database in SSMS

The SQL scripts create the `DataControlsDb` database used by the development connection string in `backend/DataControls.Api/appsettings.Development.json`.

1. Connect in SQL Server Management Studio (SSMS) to the SQL Server instance configured for the application. The account needs permission to create a database.
2. Open and execute these files in numeric order, one at a time:
   - `database/01_create_database.sql`
   - `database/02_create_tables.sql`
   - `database/03_seed_data.sql`
3. Check that each script completes without errors. The first script creates `DataControlsDb` if it does not already exist. The table-creation script is for a fresh database and should be run once.
4. The seed script may be run again safely; existing sample departments (matched by name) and employees (matched by first and last name) are left unchanged.

The scripts create the schema from the `InitialCreate` EF Core migration. The `__EFMigrationsHistory` row records that migration as applied (EF Core 10.0.0), so later EF Core migration operations do not try to create these tables again. For a fresh installation, use either these SQL scripts or `dotnet ef database update` to create the schema; do not run both schema-creation paths against the same database.

## Verify the database in SSMS

After running all three scripts, open a new query window and execute:

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

The existing schema represents a department manager as nullable `ManagerName` text; it does not define a manager entity or foreign key. Therefore, the no-manager sample is represented by an active department whose `ManagerName` is `NULL`.

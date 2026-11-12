# Rule definition contract — version 1

Requirements: RULE-01, RULE-03, EXEC-03; decision D-003, refinement D-013.

This is a custom expression tree serialized as JSON, not `System.Linq.Expressions`. Its types live in `Rules/RuleDefinition.cs`. The rule uses business IDs from the metadata catalog. It contains no technical mappings or SQL. The same `RuleValidator` is intended for future persistence and AI proposal validation.

## Validation API

`POST /api/rules/validate`, with `Content-Type: application/json`.

The endpoint validates the definition, not the underlying business records. It does not save the rule, create SQL or execute a control. Only application startup reads the SQL Server schema to validate the catalog.

This endpoint and CRUD still take RuleDefinition directly. Draft execution separately takes `{ "definition": { ... }, "options": { ... } }`; options are transient search/filter settings, not properties of RuleDefinition (D-019, [RESULT_FILTERING.md](RESULT_FILTERING.md)).

Valid rule: HTTP 200:

```json
{ "isValid": true, "errors": [] }
```

Semantically invalid rule: HTTP 400, with stable codes and JSON-style paths. Messages are in Hebrew:

```json
{
  "isValid": false,
  "errors": [
    {
      "path": "condition.right.value",
      "code": "constantTypeMismatch",
      "message": "יש להזין מספר בטווח הנתמך על ידי decimal, ללא מרכאות."
    }
  ]
}
```

Malformed JSON, unknown properties, missing/unknown `kind`, wrong JSON structure or an excessively deep JSON document are rejected by ASP.NET Core with HTTP 400 `ValidationProblemDetails`, before the semantic validator runs. Framework-generated messages are not currently localized. Requests exceeding 64 KiB receive HTTP 413. The client must handle these transport/binding errors separately from semantic errors.

## Definition

- `name`: required, non-whitespace, at most 200 characters.
- `description`: optional, at most 2,000 characters.
- `rootEntityId`: an existing business entity ID.
- `condition`: a comparison or a group. A matching condition describes a **violation** ("אתר רשומות שעונות לתנאים הבאים"), per D-003.
- `resultFields`: optional ordered list of field references to return, including related fields (D-017). Omitted/null means all root fields, preserving existing definitions. Explicit lists require 1–50 valid fields and unique result IDs; empty lists and null entries are invalid.

For example, to return an employee's first/last name and department name:

```json
"resultFields": [
  { "fieldId": "firstName" },
  { "fieldId": "lastName" },
  { "fieldId": "name", "relationshipPath": ["employeeDepartment"] }
]
```

The response column/value key for the last field is `employeeDepartment.name`; its Hebrew label includes the relationship and field labels. Root fields keep their ordinary IDs. The row ID is always returned separately. Selection does not alter conditions. Both drafts and saved rules support selection; PUT replaces it, and omission/null resets the default.

`kind` may appear anywhere in its object. Business IDs are matched case-insensitively, consistently with the catalog's duplicate checks. Kinds, operators and types use the exact documented spelling. Unknown properties are rejected rather than silently ignored. Adding a new operator remains a code change; adding rules from supported operators does not.

## Groups and comparisons

A group has `kind: "group"`, `operator: "and"` or `"or"`, and a nonempty `children` array. Children can be comparisons or nested groups. One-child groups are permitted.

A comparison has `kind: "comparison"`, a `left` field reference, an `operator`, and (except for null checks) a `right` operand.

| Operator | Supported field types | Right operand |
|---|---|---|
| `equals`, `notEquals` | text, number, date, boolean | constant or same-type field |
| `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual` | number, date | constant or same-type field |
| `isNull`, `isNotNull` | all supported types | omitted (or JSON null) |

A field reference is `{ "fieldId": "salary" }`. An omitted/null/empty `relationshipPath` selects a field on the root entity. To reference a related entity:

```json
{ "fieldId": "isActive", "relationshipPath": ["employeeDepartment"] }
```

Each relationship ID must start from the current entity in the path. Navigation only follows the approved many-to-one direction. Both left and right field references are resolved from the rule's root, not from the other operand. Fields not in the catalog cannot be selected even if their SQL columns exist.

A right constant is `{ "kind": "constant", "value": 15000 }`.
A right field is `{ "kind": "field", "field": { "fieldId": "startDate" } }`.

Constant types are strict:

- number: JSON number representable as .NET decimal; quoted numbers, arrays and objects are invalid. Physical-column precision/conversion and query behavior will be addressed by the compiler/executor.
- boolean: JSON `true` or `false`, not strings or 0/1.
- date: a valid calendar date string in exact `yyyy-MM-dd` form, without a time or timezone. Execution compares calendar dates and discards the time component of SQL date/time fields (D-015).
- text: a JSON string up to 4,000 characters. An empty string is permitted; it is not SQL NULL. SQL-looking text remains data and must later be parameterized by the compiler.

NULL literals are not allowed in binary comparisons; use `isNull`/`isNotNull`. The validator checks definitions, not whether actual records contain NULL values. Execution preserves SQL UNKNOWN in ordinary comparisons and uses LEFT JOIN for optional relationships; see [RULE_EXECUTION.md](RULE_EXECUTION.md).

Limits (design choices, not assignment mandates): root condition is depth 1, maximum condition depth 8; maximum 100 nodes including groups; maximum 4 relationships per field path; request body 64 KiB. Validation state is local to each call and the validator has no persistence or execution dependency.

## Try examples and verify

Start the API as described in README, then send requests from `backend/DataControls.Api/Rules.http` using an HTTP client that supports `.http` files, or copy a request body into Postman. The file includes active/high-salary employees, date-to-date comparison, inactive department navigation, missing start date and an invalid quoted number. These are validation examples, not runnable controls yet. Calculated age is not yet in the catalog.

Build and run the integration checks from the repository root:

```powershell
dotnet build backend/DataControls.slnx
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-Rules.ps1
```

The test uses a temporary API on port 5199 and reads schema from `DataControlsTestDb`; it does not modify business data or the source catalog. Logs remain in the printed temporary directory. Stop a running instance using the Debug output before rebuilding if Windows reports locked binaries.

Verified on 2026-11-12: build succeeded; 43 HTTP cases passed, including both limit boundaries, nested AND/OR, field/constant/related operands, Hebrew semantic errors, malformed JSON, unknown mappings and oversized requests. Persistence and execution have since been added separately: see [RULE_PERSISTENCE.md](RULE_PERSISTENCE.md) and [RULE_EXECUTION.md](RULE_EXECUTION.md). Full UI authoring remains unimplemented.

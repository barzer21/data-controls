# Searching and filtering rule results

Requirement RESULTS-06; decision D-019. These are transient execution options, not changes to the rule or its saved result fields.

## Request contracts

Draft execution now takes an envelope. This intentionally replaces the old bare-definition execution body:

```json
{
  "definition": {
    "name": "עובדים פעילים",
    "rootEntityId": "employee",
    "condition": {
      "kind": "comparison",
      "left": { "fieldId": "isActive" },
      "operator": "equals",
      "right": { "kind": "constant", "value": true }
    }
  },
  "options": {
    "search": "Noam",
    "filter": {
      "kind": "comparison",
      "left": { "fieldId": "salary" },
      "operator": "greaterThan",
      "right": { "kind": "constant", "value": 15000 }
    }
  }
}
```

Send this to `POST /api/rules/execute?limit=100`. Definition is required; options is optional/null. For `POST /api/rules/{id}/execute`, send only `{ "options": { ... } }`. Omitting the saved-run body or sending `{}` keeps the old unfiltered behavior. A definition in the saved-run envelope is rejected, preventing it from silently replacing the saved version.

`limit` remains a query parameter (default 100, range 1–500). It is not an options property. Both execution bodies are limited to 64 KiB. Unknown envelope/option properties are rejected. Create, update and validation endpoints still take bare RuleDefinition; the stored definition/schema is unchanged. Old bare-definition draft execution requests now return HTTP 400 and must be wrapped under `definition`.

## Search

Search is an optional string, at most 200 UTF-16 code units before trimming. Empty/null/whitespace-only search is ignored. Leading/trailing whitespace is trimmed, and the remaining text is matched as one literal substring against all displayed fields of metadata type text, including selected related fields. Fields omitted from resultFields and non-text fields are not searched. Defaults use all root catalog fields as before.

Multiple text columns are combined with OR, inside parentheses. SQL column collation controls case/accent sensitivity. There is no number/date-to-string conversion or search through labels, explanations or hidden evidence. Nonblank search with no displayed text fields is a 400 `noSearchableFields` error, not an ignored restriction.

The compiler creates a Unicode parameter and escapes `~`, `%`, `_` and `[` before surrounding the literal with `%`; LIKE uses `ESCAPE N'~'`. Search text is never inserted into SQL. Quotes and SQL-looking input remain data. LIKE metacharacters are literal, not wildcards available to the caller.

## Structured filtering

`options.filter` uses the existing comparison/group AST, operators and strict type rules. Nested AND/OR, field-to-constant, field-to-field and explicit null checks work. Both sides of a field comparison must be displayed result fields. An otherwise valid metadata field that is not displayed returns `filterFieldNotDisplayed`. Existing relationship direction, date and SQL NULL rules apply unchanged.

Filters are independently limited to the same maximum 8 condition levels/100 nodes, with relationship paths up to 4. The original rule has its own limits. Invalid filters return the existing `{ "isValid": false, "errors": [...] }` shape, with paths rooted at `options.filter`; original rule errors retain their original definition-relative paths. Other semantic option errors use `options.search`. Malformed JSON/kinds/shapes are rejected by ASP.NET Core before compilation.

`RuleExecutionOptionsValidator` delegates filter semantics to RuleValidator using the same root/catalog/result selection, then enforces that references are displayed. The compiler uses its existing predicate builder with explanation generation disabled for option filters; there is no second SQL operator implementation.

## Query and response

The effective predicate is `(original violation condition) AND (optional filter) AND (optional text search)`. Parentheses preserve nested OR semantics. All constants are typed parameters with distinct names. The original explanation tree/flags/evidence include only rule conditions. Options do not become reasons why a record is a business violation.

COUNT_BIG OVER and TOP apply after the effective WHERE. `totalCount` therefore counts violations matching the current options, not all unfiltered violations. `returnedCount` is the returned page-sized subset, and `truncated` reports whether the limit cut it. There is no additional unfilteredCount or result paging in this task. Empty results return zero/empty records. Reset options to return to all violations.

Both routes use the same compiler/executor/limited SQL identity. No options, definitions or execution history are written by either execute route. No database migration, AI behavior or UI is added. The existing time/row limits still apply; leading-wildcard LIKE may scan data, and these limits bound runtime rather than guarantee index efficiency.

## Examples and verification

- `backend/DataControls.Api/Execution.http`: envelope-based runs without filtering.
- `backend/DataControls.Api/Filtering.http`: draft/saved options, related text search and null filtering.

```powershell
dotnet run --project backend/tests/CompilerChecks
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-RuleExecution.ps1
```

Verified on 2026-11-12: 45 compiler/formatter checks and 98 isolated SQL persistence/execution assertions passed. The suite covers late-row search before TOP, exact filtered counts, combined search/filter, selected related fields, missing relations, numeric/date/boolean/nested filters, invalid/hidden fields and types, strict envelopes, unchanged saved definitions/reasons, literal LIKE metacharacters and SQL-looking input. Database `DataControlsPersistenceTest_cef2b38f` and logs are retained; no existing database was changed. The test helper wraps definition objects only for draft execution calls, while raw JSON strings test HTTP contract rejection directly.

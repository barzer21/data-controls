# Per-record failure explanations

Requirement RESULTS-05; decision D-018. This implements API evidence/reasons, not the future result grid.

Every violating record returned by either draft or saved execution now contains:

- `values`: selected result fields, unchanged.
- `failureReason`: a Hebrew multiline explanation built from fixed templates.
- `explanation`: a structured tree of contributing conditions/groups, with business field IDs/labels, operators and typed actual/expected values.

For active employees in inactive departments, the reason is:

```text
כל התנאים הבאים התקיימו:
• עובד פעיל: כן.
• מחלקת העובד ← מחלקה פעילה: לא.
```

For a single salary comparison:

```text
התנאי שהתקיים:
• שכר: גדול מ־15,000. הערך שנמצא: 18,000.
```

A single comparison's structured tree looks like:

```json
{
  "path": "condition",
  "kind": "comparison",
  "operator": "greaterThan",
  "message": "שכר: גדול מ־15,000. הערך שנמצא: 18,000.",
  "left": {
    "kind": "field",
    "fieldId": "salary",
    "label": "שכר",
    "type": "number",
    "value": 18000
  },
  "right": {
    "kind": "constant",
    "fieldId": null,
    "label": null,
    "type": "number",
    "value": 15000
  },
  "children": []
}
```

Groups have kind `group`, operator `and`/`or`, a message, null left/right and children. Paths such as `condition.children[1]` refer to positions in the original rule, not to positions in the pruned explanation array. The future UI can render this tree without parsing the prose. Messages and values are text/data, not HTML; UI rendering must treat them as such.

## SQL decides, C# describes

The compiler builds each predicate once as SQL text with typed parameters. The same predicate is reused in WHERE and in internal CASE columns (`CASE WHEN predicate THEN 1 ELSE 0 END`) for every comparison and group. SQL returns 1 only for TRUE; FALSE and UNKNOWN are not described as matches. Additional internal columns supply actual operand values even for fields omitted from resultFields. Existing joins are reused.

The executor reads those internal columns separately from public values/columns. `RuleExplanationService` does not re-evaluate comparisons, collation or group logic; it follows SQL match flags and creates a pruned tree. If an AND group is false/unknown under an OR, that whole branch is omitted even when a child within it was true. A true OR includes all matching branches; a true AND includes its contributing children. SQL CASE flags and operand values are fetched in the same SELECT as the violating row, not with additional queries.

The text renderer uses the catalog's business labels and constant operator templates. Boolean equality reads `עובד פעיל: כן.` or `מחלקה פעילה: לא.`; null checks read `ערך חסר` or `ערך קיים`. Numbers use fixed Hebrew-culture formatting with grouping separators. Dates are shown as dd/MM/yyyy and returned structurally as calendar-date ISO values, matching the CONVERT(date, ...) comparison. Field-to-field comparisons include both labels and compared values. Text retains the raw value structurally; only line breaks in the prose are replaced by spaces. No AI or rule-specific explanation code is used.

An isNull explanation on a related field reports a missing value, not proof that the relationship is absent: a present related row can also contain NULL. This preserves D-015's distinction. Related field IDs/labels follow D-017. Evidence not selected for result columns appears only in the contributing explanation, not as extra grid columns; it is still restricted to fields authorized by the catalog and SQL reader grants.

## Scope and verification

Definitions, CRUD, default projections, limits, counts and read-only execution are unchanged. The response has additive fields. There is no schema migration, persisted reason, AI call, execution-history decision, search/filtering or UI work in this task. Predicate repetition and evidence columns add SELECT width/evaluation work; existing node/depth/row/time limits still apply. Future optimization must preserve SQL-authoritative semantics.

The examples in `backend/DataControls.Api/Execution.http` return the boolean AND explanation above and a salary explanation with salary omitted from visible result columns. The later search/filter task changed draft execution to a definition/options envelope (D-019); both examples have been updated. Search/filter options never enter the explanation tree or text.

Verified on 2026-11-12: 34 compiler/formatter checks and 71 combined SQL persistence/execution assertions passed. The SQL suite includes hidden evidence, AND/OR nesting, a true leaf inside a false AND, UNKNOWN omission, multiple true OR branches, field-to-field dates, related nulls, saved/draft equality and SQL trailing-space text equality. Database: `DataControlsPersistenceTest_9622bb48`; retained for inspection. Existing databases were not changed. The standard build still reports the previously documented dependency vulnerability warnings.

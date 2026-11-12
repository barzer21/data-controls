# Generic create/edit rule modal

Implemented 2026-11-12. Assignment scope: GEN-02/03, RULE-01..05, TECH-07, EXEC-05 and UX-01. Modal placement, native dialog, metadata traversal bounds and inline draft preview are design choices (D-024), not additional assignment requirements.

## UI and boundaries

- A New Rule button with an inline SVG plus icon appears above the saved-rule list, including its empty state. Each row has Edit alongside Run.
- Both actions open the same `RuleEditorDialogComponent`. Native `dialog.showModal()` provides modal semantics, background inertness and keyboard focus containment. The dialog has a named heading, fixed header/footer, scrollable content and SCSS styles. Escape/Cancel/Close ask for confirmation if there are unsaved edits; requests disable duplicate actions and closing while in flight.
- New rules receive an initial comparison based on the selected metadata entity. Edit fetches the entire saved definition by ID and edits a deep copy, not a list summary. Failed loads cannot submit a blank replacement.
- Name (required, up to 200 characters), description (optional, up to 2,000), business entity and nested condition tree are editable. Changing the entity requires confirming a reset of the old conditions.
- `ConditionEditorComponent` is reusable and recursive. Business fields are discovered from metadata, including outgoing relationship paths bounded to four links. JSON references remain stable while labels are business-facing. Groups support AND/OR, adding comparisons/subgroups and removing children while preserving at least one child. Controls enforce the eight-level bound, and the dialog rejects trees over 100 nodes.
- Comparison options follow field type: equality/inequality and missing/not-missing for all types; ordering for numbers/dates. Right operands can be typed constants or metadata fields of the same type. Number/boolean/date inputs produce JSON numbers/booleans/ISO dates. NULL operators omit the right operand. Grouping does not silently change existing selections; NgModel keeps select display synchronized when nested views are recreated.

## Save and run

Both actions first POST the current definition to `/api/rules/validate`. The server remains authoritative; semantic messages and business condition numbers are displayed without internal SQL details. Input remains available after validation/network failures.

- Save explicitly POSTs `/api/rules` for a new rule or PUTs `/api/rules/{id}` for edits. It never runs a rule. Success closes the modal, reports success and refreshes the list. Creation navigates to the estimated last page (API sorts by ID); edit preserves the current list page.
- Run submits only the current draft snapshot to the existing execution endpoint. It never POSTs a saved definition or PUTs an existing one. The modal shows the exact executed conditions and reuses the generic result table/count/empty/truncation states. Edits clear previous preview data. Run neither closes the editor nor discards unsaved work.

## Verification

- All 38 frontend tests passed: 12 list tests, 7 results-route tests, 11 modal tests and 8 condition-editor tests. Coverage includes explicit create/PUT, draft execution without persistence, semantic errors preserving input, duplicate-action prevention, discard/reset confirmation, failed loads, empty names, node/depth bounds, typed constants, compatible fields, related paths, nested AND/OR, sibling preservation, cyclic metadata bounds and selected-option preservation after grouping. List tests verify final/current-page refresh after create/edit.
- Edge headless at 1440×1000 exercised real modal creation, typed salary condition plus active-employee condition, Run Without Saving, explicit save, reopening Edit and description update. The unsaved run returned one violation without changing rule count. GET confirmed the edited description and unchanged numeric/boolean operands. Screenshots were inspected.
- QA used uniquely named temporary rules and deleted only those newly created records afterwards. Each run restored its initial rule count; existing user/sample rules were preserved. Artifacts are ignored under `.angular/preview/`.
- Production build passed with strict template/type checking. No backend source or schema changed; existing backend checks were not rerun.

## Remaining work

Search/filter UI has since been added to the dedicated results page (docs/UI_RESULT_FILTERS.md). The inline draft preview remains unchanged. Backend result pagination, deletion, calculated age and the Python AI mock remain separate tasks. Results retain the current 100-row cap. Concurrent edit conflict detection is not provided by the existing PUT contract. There is no draft persistence across full reload or application navigation; users should explicitly save work they want to retain. Desktop UI was reviewed; broader responsive authoring remains for the final assignment review.

Codex assisted with design, implementation, automated tests, browser QA and documentation; this supplements the previous increment disclosures.

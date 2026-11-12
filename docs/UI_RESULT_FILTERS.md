# Search and column filters in the results page

Implemented 2026-11-12. Assignment scope: RESULTS-06, with count/empty/error behavior under RESULTS-03, EXEC-05 and UX-01. D-025 records implementation choices; the assignment does not prescribe a specific filtering layout.

## Behavior

- The dedicated results page offers an explicit search button/Enter action across displayed text fields (up to 200 characters). Search is literal and may match part of text; per-column text equality/inequality is exact, following the existing API. There are no client-side row scans.
- Filter icons appear in metadata-backed data column headers; the same columns are selectable in the toolbar. A selected column opens a typed panel above the table: numeric/date ordering, equality/inequality, boolean yes/no and missing/not-missing checks. One active comparison is supported per column; different columns combine with AND. The API also supports more complex trees, but that is not exposed by this simple column-filter UI.
- Active criteria appear as removable chips; Clear All restores the unfiltered request. Filtering is temporary and distinct from the displayed business violation conditions. Search/filter submission re-executes the same loaded definition snapshot, not a newly fetched/possibly edited saved rule. No definition is saved or mutated.
- Counts describe all violations matching the current options. The existing 100-row cap still applies, and truncation remains explicit. Zero matches means no matches for the active criteria, not that the underlying rule has no violations. The toolbar and column headers remain accessible for recovery even at zero matches.
- Filter controls remain mounted while execution is pending or fails. A newer request cancels the previous one and old results are removed while loading. Retry reloads the saved snapshot as before but preserves criteria; switching to a different rule resets criteria and cancels pending work.

## Data and component boundaries

- `RulesApiService.execute` accepts optional `RuleExecutionOptions`; absent/empty options preserve the previous `{ definition }` request contract used by the editor and initial execution.
- `result-filters.model.ts` maps returned column IDs to metadata-approved field references, including related paths. Only displayed, type-compatible metadata fields are filterable. It builds the existing condition tree in `options.filter`; values are JSON numbers/booleans/ISO dates/strings. NULL checks omit the right operand. Search is sent in `options.search`, with no SQL or wildcard rewriting in the UI.
- `ResultFiltersComponent` renders controls, validates local input and emits immutable selections. It has no HTTP access. The results page owns the snapshot, active criteria and cancellation; `ExecutionResultsComponent` emits column-filter intents and displays active icons/counts/empty states.
- Row IDs and generated failure reasons are not filter fields in the current backend contract and have no misleading filter control. Per-column filtering is not added to the modal draft preview in this increment.

## Verification

- Production build passed. All 54 frontend tests passed (38 existing + 16 new). New coverage includes metadata/path mapping, typed values including zero/false/NULL, operator restrictions, invalid numbers/dates, literal search, exact request envelopes, combined filters, replacing/removing/resetting criteria, opening a filter from a header, zero matches with accessible controls, cancellation, retry preservation and resetting on another rule.
- Edge headless at 1440×1000 used the real local API and an existing salary rule: 13 violations → name search plus related department-name filter → one violation. An additional salary filter produced zero matches; removing it restored the matching row; Clear All restored the unfiltered request. Six observed execution requests all contained the unchanged definition snapshot. The saved-rule GET response and original per-row failure reason were identical before/after. No database writes were issued for QA.
- Screenshot review confirmed the visible rule context, search toolbar, chips and column icons, without document horizontal overflow; wide data remains horizontally scrollable inside the table. Temporary browser artifacts are ignored under `.angular/preview/`.
- No backend code/schema changes. Existing backend checks were not rerun; backend filtering semantics remain documented in [RESULT_FILTERING.md](RESULT_FILTERING.md).

## Remaining work

True result pagination is still required for browsing all matching rows beyond the current cap. Filters use current API operators, not per-column contains/range/multi-value extensions. Criteria are local to the open results route and not persisted across full reload. Desktop was verified; broader responsive UX remains part of the final assignment review.

Codex assisted with implementation, focused tests, read-only browser QA and documentation, supplementing prior AI usage disclosures.

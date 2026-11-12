# Dedicated execution results page

Implemented 2026-11-12. Assignment requirements: RESULTS-02..05 (run from list, count, table and failure reasons), RULE-05 (business vocabulary), EXEC-05 (errors), TECH-07 (reusable components) and UX-01. Desktop layout, dedicated route, snapshot execution and persistent rule context are design choices (D-023).

## Flow and responsibilities

1. The list emits the selected rule ID. Its page component navigates to `/rules/{id}/results?page={listPage}`. The list page is represented in the URL and restored on return. Angular Router lazy-loads both pages.
2. The results page loads the saved definition using GET `/api/rules/{id}` and loads shared metadata. It displays the rule name, optional description and a recursive Hebrew condition tree. AND/OR group boundaries are explicit; relationship/field names come from metadata, not SQL mappings.
3. The exact loaded definition is submitted to POST `/api/rules/execute?limit=100` as `{ definition }`. This is an intentional use of the existing draft execution endpoint: another client editing the saved rule after GET cannot make the displayed summary differ from the submitted conditions. There are no save/update requests. Reopening/retrying loads a fresh saved definition and executes a fresh snapshot. There is no history of results.
4. A reusable results component renders count, ID, dynamic columns in server order and each row's `failureReason`. Dates retain their calendar date, numbers use Hebrew formatting, booleans use כן/לא, and NULL uses לא צוין. The structured explanation is retained in the response model but not separately rendered.
5. The full-height desktop layout has a separate table scroll region. Rule context remains outside it; table headers are sticky. Exceptionally long condition trees can be scrolled within the bounded context panel.

Loading, execution, zero violations, deleted rule, invalid ID, timeout and generic errors are explicit states. Internal server details are not displayed. During execution failures the selected definition remains visible. Route changes/destruction cancel pending HTTP work; obsolete responses cannot replace a newer request.

## Verification

- Production build passed. All 17 tests passed (10 existing list tests + 7 new results route tests).
- New tests cover execution of the displayed snapshot without saving; nested conditions and metadata relationship labels; server column order, zero/false/NULL/date values, IDs, failure reasons and truncation; deleted and invalid rules; timeout and retry with freshly loaded definition; returning to list page 2; and request cancellation.
- Edge headless at 1440×900 exercised the live local API: list page 2 → Run → results for rule 21 → back to list page 2. Rule name/conditions and real violation data rendered correctly; there was no document overflow. Screenshots were inspected.
- To stress vertical scrolling without adding business data, 100 row copies were added only to the browser DOM during QA. At scrollTop 500, context remained above the table and table headers remained aligned with the scroll region's top. The live API result and count were not used as evidence for that synthetic row count. Temporary QA artifacts are ignored under `.angular/preview/`.
- Browser QA used a separate local dev server on port 4201 because the pre-existing dev server needed a restart after adding Router. Production/development builds and API contracts were unchanged by this test setup.
- No backend source changes; its existing 188 checks were not rerun.

## Limits and next increments

- Search and filter controls are not implemented in this increment; the backend options remain available for the next task. Generic creation/editing has since been added in the shared modal; see [UI_EDITOR.md](UI_EDITOR.md).
- The response returns at most 100 rows. Truncation is explicit; no client-side pagination pretends to expose unreturned rows. True large-data browsing requires backend result pagination.
- The results page is designed and checked for desktop, per user preference. Broader responsive results UX remains an assignment item to revisit.
- Direct links/reload execute a new read-only snapshot. Production hosting must support SPA fallback for Angular paths and route `/api` separately. No backend CORS changes are required by the local development proxy.

AI assistance: Codex implemented the scoped frontend changes, route/HTTP tests and documentation, and used Edge headless for local QA. This supplements the first-increment disclosure; project-wide SUB-08 remains pending.

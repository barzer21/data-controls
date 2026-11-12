# Saved rules list — first Angular increment

Implemented on 2026-11-12. Scope: RESULTS-01; partial TECH-05..07, RULE-05, EXEC-05 and UX-01. Angular, Hebrew/RTL and reusable components are assignment requirements. The following structure and local proxy are implementation choices, recorded as D-022.

## Responsibilities and flow

- `core/api`: readonly TypeScript response interfaces and injectable `HttpClient` services for list/metadata GETs. No database or SQL knowledge in the frontend.
- `SavedRulesPageComponent`: local signal state (`loading`, `error`, `loaded`), server page requests and retry. RxJS `switchMap` cancels superseded requests; destruction cancels pending work. List and metadata must both succeed before rendering business data.
- `SavedRulesListComponent`: receives rule summaries and metadata, renders name/description and entity labels without HTTP calls. Unknown entities use a Hebrew fallback rather than an internal ID.
- `PaginationComponent`: receives page/pageSize/totalCount and emits page changes. Boundaries follow the server response, not the number of returned items.
- Metadata is replayed across successful page loads. Failed metadata requests can be retried. If concurrent deletions empty a later page, return to an earlier available page.
- Development proxy: browser `/api/**` → Angular dev server → `http://localhost:5037`. No CORS changes and no writes to the backend.

## Verification performed

- Production `npm.cmd run build` passed with strict TypeScript and template checking.
- `npm.cmd test -- --watch=false`: 10 tests passed using Angular TestBed, real API services and mocked HTTP transport. They cover loading until both responses arrive; arbitrary metadata labels and missing descriptions; actual pagination button events and request parameters; empty results; failed-page retry without leaking internal details; metadata retry; obsolete request cancellation; concurrent deletion fallback; unknown entity fallback; and cleanup on component destruction.
- With the existing local backend running, the development server returned HTTP 200, and both `/api/rules?page=1&pageSize=20` and `/api/metadata` succeeded through the proxy. The current database contained one saved rule. No rules or business data were created/edited for this verification.
- Edge headless rendered the real saved rule at exact viewport widths 1440 and 390. Both had Hebrew document language and RTL direction, correct business entity label, and document width equal to viewport width (no horizontal page overflow). The mobile list stacked vertically. Desktop/mobile screenshots were inspected; temporary browser artifacts remain ignored under `frontend/.angular/preview/`.
- The initial sandboxed build was blocked by esbuild reading parent directories; the same build and tests passed outside that filesystem restriction.

## Remaining scope

The final reviewed list template displays each rule name as a heading, followed by its description and business entity badge, without repeated field labels.

Follow-up on 2026-11-12: at the user's request all source styles were moved to SCSS, including global styles and pagination. Angular CLI component defaults and inline style language now use SCSS. Production build and all 10 existing tests passed again; emitted production bundle hashes remained unchanged.

No Run button, execution results, editor, search/filter UI, deletion or AI UI in this increment. The existing backend's 188 checks were not rerun because backend code was unchanged. Pagination and failures were verified with mocked HTTP responses. For subsequent manual review, the user requested sample data: 45 validated sample rules were created through the API, bringing the local total to 46. API pagination returned 20, 20 and 6 records across three pages. Sample IDs were recorded locally under ignored `.angular/manual-data/`; sample data is not included in Git. Broader UI accessibility and multi-screen responsiveness remain pending. The overall UI requirements are not marked fully verified by this increment.

AI disclosure for this increment: OpenAI Codex assisted with repository/assignment inspection, Angular architecture, implementation, tests and documentation. Angular CLI generated the initial workspace. This note does not replace the eventual project-wide AI usage deliverable (SUB-08).

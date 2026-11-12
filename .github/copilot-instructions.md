## Mandatory assignment traceability

- Before every implementation task, read `REQUIREMENTS.md` and `IMPLEMENTATION_PLAN.md`.
- Identify the exact requirement IDs addressed and list relevant acceptance tests.
- Treat the original assignment as authoritative. Distinguish explicit requirements from architecture decisions and optional improvements.
- Do not mark a requirement complete merely because code compiles; provide observable verification.
- Do not introduce one-off SQL queries for individual business rules.
- The metadata system must address the assignment's prohibition on hardcoded table/field names in the rule engine. Flag any design that may violate this.
- Keep SQL schema scripts and EF Core migrations consistent. Sample data should have one authoritative seed source.
- The UI must be in Hebrew and RTL; results must include per-record failure reasons and search/filtering.
- The AI mock must return a structured proposal, be validated by the same rule validator, and require user approval before execution.
- Keep the mandatory submission artifacts current: setup instructions, SQL creation/seed scripts, architecture, examples, assumptions/limitations, and AI tools disclosure.
- Keep edits scoped to the requested task. Explain changed files, verification performed, outstanding gaps, and requirement status updates.

## Architecture Decision Log

- Read DECISIONS.md before making architectural changes.
- Follow decisions marked Accepted.
- Do not implement decisions marked Open without discussing them first.
- Distinguish assignment requirements from our design decisions.
- When proposing a new architectural decision, explain the alternatives and trade-offs.
- Update DECISIONS.md whenever a decision is made or changed.
- Never silently override an existing decision.

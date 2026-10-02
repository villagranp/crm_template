# Implementation plans

One plan per user story: `PLAN-US-XXX.md`. The plan is written and approved
**before** the first line of code (CLAUDE.md, "No code-first").

## Template

```markdown
# Implementation plan — US-XXX

## Understanding
Restatement of the story in technical terms. Ambiguities resolved, with the
source of each resolution.

## Affected modules
Backend modules, frontend features, shared contracts.

## Data model changes
Entities, fields, indexes, migrations. Backwards compatibility statement.

## API contract
Endpoints, methods, request and response shapes, status codes, error codes.
Follows API-STANDARDS.md.

## Authorization
Permissions introduced or required, and where they are enforced.

## Frontend design
Routes, components, state ownership (server state vs. client state), forms and
validation schemas.

## Security considerations
Input validation, sensitive data handling, audit events, rate limits.

## Test plan
Unit, integration and e2e tests mapped to each acceptance criterion.

## Observability
What is logged, at which level, and which correlation fields are carried.

## Risks and trade-offs
What could go wrong, and what was deliberately not done.

## Steps
Ordered, reviewable increments. Each step leaves the repository green.
```

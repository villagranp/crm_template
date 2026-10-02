# Requirements

One file per business requirement: `REQ-XXX-short-name.md`.

Produced by the `requirements-analysis` skill before any user story exists.
A requirement that has not been analysed here cannot enter the Definition of
Ready.

## Template

```markdown
# REQ-001: <title>

## Business need
What problem is being solved, and for whom. No solution language.

## Current situation
How it is handled today, including the cost of leaving it as it is.

## Scope
In scope / out of scope, stated explicitly.

## Business rules
Numbered, testable rules (BR-1, BR-2, …).

## Actors and permissions
Who does what, expressed as `resource.action` permissions.

## Data involved
Entities, sensitivity classification, retention expectations.

## Assumptions
Explicit assumptions, each with the person who must confirm it.

## Open questions
Blocking questions. A requirement with open blocking questions is NOT ready.

## Acceptance criteria (business level)
Observable outcomes that prove the need is met.
```

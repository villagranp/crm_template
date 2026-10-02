# Testing documentation

The strategy is in the root `TESTING.md` and in ADR-013. This folder holds the
plans and the traceability evidence.

| File | Contents |
|---|---|
| `test-plan-US-XXX.md` | Test plan for a story, derived from its acceptance criteria |
| `traceability.md` | Acceptance criterion -> test mapping for the whole product |
| `manual-checks.md` | The few checks that are deliberately not automated, and why |

## Rules

1. Every acceptance criterion maps to at least one automated test.
2. A bug fix starts with a failing test that reproduces the bug.
3. Tests state behaviour, not implementation. A refactor that preserves
   behaviour must not require rewriting the test suite.

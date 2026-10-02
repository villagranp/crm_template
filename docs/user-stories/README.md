# User stories

One file per story: `US-XXX-short-name.md`. Stories derive from a requirement
in `docs/requirements/` and are produced by the `user-story` skill.

A story enters development only when it satisfies the Definition of Ready in
CLAUDE.md.

## Template

```markdown
# US-001: <title>

- **Requirement:** REQ-XXX
- **Status:** draft | ready | in progress | done
- **Owner:** <role>

## Story
As a <role>, I want <capability> so that <business value>.

## Acceptance criteria
### AC-1: <name>
Given <context>
When <action>
Then <observable outcome>

### AC-2: …

## Out of scope
What this story explicitly does not deliver.

## Permissions
`resource.action` values required to execute this story.

## Data and validation rules
Fields, types, formats, limits and error messages.

## Non-functional expectations
Performance, auditability, accessibility, volume.

## Dependencies
Other stories, external systems, decisions pending an ADR.

## Traceability
| AC | Test | Level |
|---|---|---|
| AC-1 | `<file>::<test name>` | unit / integration / e2e |
```

# docs/

Project documentation. Everything here is written **before** the code it
describes (see CLAUDE.md, "No code-first").

| Folder | Contents | Produced by |
|---|---|---|
| `requirements/` | Analysed business requirements, one file per requirement | business-analyst |
| `user-stories/` | User stories with acceptance criteria (`US-XXX-*.md`) | business-analyst |
| `implementation-plans/` | Technical plan per story, approved before coding | architect / tech lead |
| `architecture/` | Component and module designs beyond the root ARCHITECTURE.md | architect |
| `adr/` | Architecture Decision Records — the decision log of the project | architect |
| `api/` | API contracts, OpenAPI fragments, endpoint catalogues | backend-engineer |
| `database/` | Data models, migration notes, indexing and retention decisions | database-engineer |
| `security/` | Threat models, security reviews, control evidence | security-engineer |
| `testing/` | Test plans and traceability from acceptance criteria to tests | qa-engineer |
| `deployment/` | Environment topology, configuration and release runbooks | devops-engineer |
| `diagrams/` | Diagram sources (Mermaid preferred, kept in version control) | any role |

## Rules

1. Documentation lives in Git, next to the code it describes. No external wiki
   as the source of truth.
2. Diagrams are text (Mermaid) so they can be reviewed in a pull request.
3. A document that no longer matches the code is a defect. Update it in the
   same pull request that changes the behaviour.
4. Decisions go in `adr/`, never in a chat thread or a comment.

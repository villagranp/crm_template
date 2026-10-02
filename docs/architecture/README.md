# Architecture documentation

The system-level view lives in the root `ARCHITECTURE.md`. This folder holds
the detail that would drown that document: module designs, sequence diagrams
for non-obvious flows, and integration designs.

| File pattern | Contents |
|---|---|
| `module-<name>.md` | Responsibilities, public contract, dependencies, invariants |
| `integration-<system>.md` | External system, protocol, failure modes, retries, timeouts |
| `flow-<name>.md` | Sequence diagram and narrative for a cross-cutting flow |

Rules:

1. A decision belongs in `docs/adr/`, not here. This folder describes **what
   the system is**; ADRs record **why it is that way**.
2. Diagrams are Mermaid, embedded in the Markdown, so pull requests can review
   them.
3. If a module design and the code disagree, the code is not automatically
   right: reconcile them deliberately in one pull request.

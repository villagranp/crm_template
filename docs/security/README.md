# Security documentation

The security baseline is in the root `SECURITY.md`. This folder holds the
project-specific evidence and analysis.

| File | Contents |
|---|---|
| `threat-model.md` | Assets, trust boundaries, threats and mitigations |
| `review-<date>.md` | Security review of a release or of a sensitive change |
| `data-classification.md` | Which data is personal, confidential or public |

## Rules

1. A feature that handles personal data requires a threat model entry before
   implementation.
2. Findings are tracked with a severity and an owner. "Known and accepted" is
   a valid outcome only when written down with the accepting role.
3. No real credential, token, customer record or personal datum may appear in
   any document in this repository, including examples. Use obvious
   placeholders.

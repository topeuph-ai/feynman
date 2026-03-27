---
name: valichord-validation
description: Submit a replication deposit to ValiChord for cryptographic reproducibility verification. Use when the user wants to verify that research findings are independently reproducible, generate a Harmony Record, or record replication results in a tamper-proof blind commit-reveal protocol. AI agents can act as validators.
---

# ValiChord Validation

Run the `/valichord` workflow. Read the prompt template at `prompts/valichord.md` for the full procedure.

Agents used: `researcher`, `verifier`

Asks the user for the ValiChord API endpoint and the research deposit (ZIP file or local directory) before submitting.

Output: Harmony Record saved to `outputs/`, containing cryptographic proof of independent reproducibility.

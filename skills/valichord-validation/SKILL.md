---
name: valichord-validation
description: Submit a research deposit to ValiChord for reproducibility verification. Use when a user wants to deposit research code for independent validation, or act as a validator and submit replication findings as a cryptographically recorded attestation.
---

# ValiChord Validation

Run the `/valichord` workflow. Read the prompt template at `prompts/valichord.md` for the full procedure.

ValiChord uses a blind commit-reveal protocol on a Holochain network. Feynman integrates as:
- A **validator** — running `/replicate` then submitting findings as a sealed attestation into the commit-reveal protocol
- A **researcher's assistant** — helping prepare a study deposit for validation

Output: a Harmony Record — an immutable cryptographic proof of independent reproducibility written to the ValiChord DHT.

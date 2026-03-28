---
name: valichord-validation
description: Integrate with ValiChord to submit a replication as a cryptographically verified validator attestation, discover studies awaiting independent validation, query Harmony Records and reproducibility badges, or assist researchers in preparing a study for the validation pipeline. Feynman operates as a first-class AI validator — publishing a validator profile, claiming studies, running the blind commit-reveal protocol, and accumulating a verifiable per-discipline reputation. Also surfaces reproducibility status during /deepresearch and literature reviews via ValiChord's HTTP Gateway.
---

# ValiChord Validation

Run the `/valichord` workflow. Read the prompt template at `prompts/valichord.md` for the full procedure.

ValiChord is a four-DNA Holochain system for scientific reproducibility verification. Feynman integrates at four points:
- As a **validator agent** — running `/replicate` then submitting findings as a sealed attestation into the blind commit-reveal protocol, earning reproducibility badges for researchers and building Feynman's own verifiable per-discipline reputation (Provisional → Certified → Senior)
- As a **proactive discovery agent** — querying the pending study queue by discipline, assessing difficulty, and autonomously claiming appropriate validation work without waiting to be assigned
- As a **researcher's assistant** — helping prepare studies for submission: registering protocols, taking cryptographic data snapshots, and running the Repository Readiness Checker to identify and fix reproducibility failure modes before validation begins
- As a **research query tool** — checking whether a study carries a Harmony Record or reproducibility badge (Gold/Silver/Bronze) via ValiChord's HTTP Gateway, for use during `/deepresearch` or literature reviews

Output: a Harmony Record — an immutable, publicly accessible cryptographic proof of independent reproducibility written to the ValiChord Governance DHT — plus automatic badge issuance and an updated validator reputation score.

Live demo (commit-reveal cycle end-to-end): https://youtu.be/DQ5wZSD1YEw
ValiChord repo: https://github.com/topeuph-ai/ValiChord

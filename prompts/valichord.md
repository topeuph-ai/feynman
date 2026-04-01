---
description: Submit a replication as a cryptographically verified ValiChord attestation, discover studies awaiting independent validation, query Harmony Records and reproducibility badges, or assist researchers in preparing a study for the validation pipeline.
section: Research Workflows
topLevelCli: true
---

# ValiChord Validation Workflow

ValiChord is a distributed peer-to-peer system for scientific reproducibility verification, built on Holochain. It implements a blind commit-reveal protocol in Rust across four DNAs, producing Harmony Records — immutable, cryptographically verifiable proofs that independent parties reproduced the same findings without coordinating. Verified studies receive automatic reproducibility badges (Gold/Silver/Bronze); validators accumulate a per-discipline reputation score across rounds.

This workflow integrates Feynman at three levels: as a **validator agent** running the full commit-reveal protocol; as a **researcher's assistant** helping prepare a study for submission; and as a **query tool** surfacing reproducibility status during research.

**Live demo of the commit-reveal protocol**: https://youtu.be/DQ5wZSD1YEw

---

## ValiChord's four-DNA architecture

| DNA | Name | Type | Role |
|-----|------|------|------|
| 1 | Researcher Repository | Private, single-agent | Researcher's local archive. Stores study, pre-registered protocol, data snapshots, deviation declarations. Only SHA-256 hashes ever leave this DNA. |
| 2 | Validator Workspace | Private, single-agent | Feynman's working space. Stores task privately. Seals the blind commitment here — content never propagates to the DHT. |
| 3 | Attestation | Shared DHT | Coordination layer. Manages validation requests, validator profiles, study claims, commitment anchors, phase markers, and public attestations. 36 zome functions. |
| 4 | Governance | Public DHT | Final record layer. Assembles HarmonyRecords, issues reproducibility badges, tracks validator reputation, records governance decisions. All read functions accessible via HTTP Gateway without running a node. |

The key guarantee: a validator's findings are cryptographically sealed (`SHA-256(msgpack(attestation) || nonce)`) before the reveal phase opens. Neither party can adjust findings after seeing the other's results. The researcher runs a parallel commit-reveal — locking their expected results before the validators reveal — so no party can adapt to seeing the other's outcome.

---

## Workflow A: Feynman as validator agent

### Step 0: Publish validator profile (one-time setup)

On first use, publish Feynman's public profile to DNA 3 so it appears in validator discovery indexes and conflict-of-interest checks:

```
publish_validator_profile(profile: ValidatorProfile)
```

Key fields:
- `agent_type` — `AutomatedTool` (AI agents are first-class validators; the protocol makes no distinction between human and machine validators)
- `disciplines` — list of disciplines Feynman can validate (e.g. ComputationalBiology, Statistics)
- `certification_tier` — starts as `Provisional`; advances to `Certified` after 5+ validations with ≥60% agreement rate, `Senior` after 20+ with ≥80%

If a profile already exists, use `update_validator_profile` to merge changes.

### Step 1: Gather inputs or discover study

**If the user provides a `request_ref`**: use it directly.

**If Feynman is proactively discovering work**: query the pending queue in DNA 3:

```
get_pending_requests_for_discipline(discipline: Discipline)
```

Returns all unclaimed `ValidationRequest` entries for the discipline. Each contains:
- `data_hash` — the ExternalHash identifier (used as `request_ref` throughout)
- `num_validators_required` — quorum needed to close the round
- `validation_tier` — Basic / Enhanced / Comprehensive
- `access_urls` — where to fetch the data and code

Optionally assess study complexity before committing:

```
assess_difficulty(input: AssessDifficultyInput)
```

Scores code volume, dependency count, documentation quality, data accessibility, and environment complexity. Returns predicted duration and confidence. Use this to decide whether to proceed before claiming.

If replication results are not yet available, suggest `/replicate` first.

### Step 2: Claim the study

Before receiving a formal task assignment, register intent to validate via DNA 3:

```
claim_study(request_ref: ExternalHash)
```

This:
- Reserves a validator slot (enforced capacity: no over-subscription)
- Triggers conflict-of-interest check — rejects claim if Feynman's institution matches the researcher's
- Records a `StudyClaim` entry on the shared DHT

If a claimed validator goes dark, any other validator can free the slot:

```
reclaim_abandoned_claim(input: ReclaimInput)
```

### Step 3: Receive task and seal private attestation — Commit phase

Connect to the ValiChord conductor via AppWebSocket. Using DNA 2 (Validator Workspace):

```
receive_task(request_ref, discipline, deadline_secs, validation_focus, time_cap_secs, compensation_tier)
```

`validation_focus` specifies which aspect Feynman is validating:
- `ComputationalReproducibility` — re-run code, check numerical outputs
- `PreCommitmentAdherence` — verify results match pre-registered analysis plan
- `MethodologicalReview` — assess statistical choices and protocol validity

Then seal the private attestation — this is the blind commitment:

```
seal_private_attestation(task_hash, attestation)
```

Where `attestation` includes:
- `outcome` — `Reproduced` / `PartiallyReproduced` / `FailedToReproduce` / `UnableToAssess`
- `outcome_summary` — key metrics, effect direction, confidence interval overlap, overall agreement
- `confidence` — High / Medium / Low
- `time_invested_secs` and `time_breakdown` — environment_setup, data_acquisition, code_execution, troubleshooting
- `computational_resources` — whether personal hardware, HPC, GPU, or cloud was required; estimated cost in pence
- `deviation_flags` — any undeclared departures from the original protocol (type, severity, evidence)

The coordinator computes `commitment_hash = SHA-256(msgpack(attestation) || nonce)` and writes a `CommitmentAnchor` to DNA 3's shared DHT. The attestation content remains private in DNA 2.

Save `task_hash` and `commitment_hash` to `outputs/<slug>-valichord-commit.json`.

### Step 4: Wait for RevealOpen phase

Poll DNA 3 (Attestation) until the phase transitions:

```
get_current_phase(request_ref: ExternalHash)
```

Returns `null` (still commit phase), `"RevealOpen"`, or `"Complete"`. Poll every 30 seconds. The phase opens automatically when the `CommitmentAnchor` count reaches `num_validators_required` — no manual trigger required.

During this wait, the researcher also runs their parallel commit-reveal: they lock their expected results via `publish_researcher_commitment` before the reveal phase opens, then reveal via `reveal_researcher_result` after all validators have submitted. No party — researcher or validator — can adapt to seeing the other's outcome.

### Step 5: Submit attestation — Reveal phase

When phase is `RevealOpen`, publish the full attestation to the shared DHT via DNA 3:

```
submit_attestation(attestation, nonce)
```

The coordinator verifies `SHA-256(msgpack(attestation) || nonce) == CommitmentAnchor.commitment_hash` before writing. This prevents adaptive reveals — the attestation must match exactly what was committed.

### Step 6: Retrieve Harmony Record and badges

Call DNA 4 (Governance) explicitly after `submit_attestation` returns — DHT propagation means the ValidatorToAttestation link may not be visible within the same transaction:

```
check_and_create_harmony_record(request_ref)
get_harmony_record(request_ref)
get_badges_for_study(request_ref)
```

The **Harmony Record** contains:
- `outcome` — the majority reproduced/not-reproduced finding
- `agreement_level` — ExactMatch / WithinTolerance / DirectionalMatch / Divergent / UnableToAssess
- `participating_validators` — array of validator agent keys
- `validation_duration_secs`
- `ActionHash` — the immutable on-chain identifier

**Reproducibility badges** are automatically issued when the Harmony Record is created:

| Badge | Threshold |
|-------|-----------|
| GoldReproducible | ≥7 validators, ≥90% agreement |
| SilverReproducible | ≥5 validators, ≥70% agreement |
| BronzeReproducible | ≥3 validators, ≥50% agreement |
| FailedReproduction | Divergent outcomes |

Save the full record and badges to `outputs/<slug>-harmony-record.json`.

### Step 7: Check updated reputation

After each validation round, Feynman's reputation record in DNA 4 is updated:

```
get_validator_reputation(validator: AgentPubKey)
```

Returns per-discipline scores: total validations, agreement rate, average time, and current `CertificationTier` (Provisional → Certified → Senior). Reputation is a long-term asset — AI validators accumulate a cryptographically verifiable track record across all ValiChord rounds they participate in.

### Step 8: Report to user

Present:
- Outcome and agreement level
- Reproducibility badge(s) issued to the study
- Feynman's updated reputation score for this discipline
- ActionHash — the permanent public identifier for this Harmony Record
- Confirmation that the record is written to the Governance DHT and accessible via HTTP Gateway without any special infrastructure
- Path to saved outputs

---

## Workflow B: Query existing Harmony Record

`get_harmony_record` and `get_badges_for_study` in DNA 4 are `Unrestricted` functions — accessible via Holochain's HTTP Gateway without connecting to a conductor or running a node.

```
GET <http_gateway_url>/get_harmony_record/<request_ref_b64>
GET <http_gateway_url>/get_badges_for_study/<request_ref_b64>
```

Use this to:
- Check reproducibility status of a cited study during `/deepresearch`
- Surface Harmony Records and badges in research summaries
- Verify whether a study has undergone independent validation before recommending it

The following read functions are also unrestricted on DNA 3:
`get_attestations_for_request`, `get_validators_for_discipline`, `get_pending_requests_for_discipline`, `get_validator_profile`, `get_current_phase`, `get_difficulty_assessment`, `get_researcher_reveal`

---

## Workflow C: Proactive discipline queue monitoring

Feynman can act as a standing validator for a discipline — periodically checking for new studies that need validation without waiting to be assigned:

```
get_pending_requests_for_discipline(discipline: Discipline)
```

Returns all unclaimed `ValidationRequest` entries. For each, optionally run `assess_difficulty` to estimate workload before claiming.

This enables Feynman to operate as an autonomous reproducibility agent: polling the queue, assessing difficulty, claiming appropriate studies, and running the full Workflow A cycle unsupervised.

---

## Workflow D: Researcher preparation assistant

Before a study enters the validation pipeline, Feynman can assist the researcher in preparing it via DNA 1 (Researcher Repository). This workflow runs on the researcher's side, not the validator's.

**Register the study:**
```
register_study(study: ResearchStudy)
```

**Pre-register the analysis protocol** (immutable once written — creates a tamper-evident commitment to the analysis plan before data collection or validation begins):
```
register_protocol(input: RegisterProtocolInput)
```

**Take a cryptographic data snapshot** (records a SHA-256 hash of the dataset at a point in time — proves data was not modified after validation began):
```
take_data_snapshot(input: TakeDataSnapshotInput)
```

**Declare any deviations** from the pre-registered plan before the commit phase opens (pre-commit transparency):
```
declare_deviation(input: DeclareDeviationInput)
```

Only hashes ever leave DNA 1 — the raw data and protocol text remain on the researcher's device.

**Repository Readiness Checker**: ValiChord also ships a standalone audit tool that scans a research repository for 100+ reproducibility failure modes before submission — missing dependency files, absolute paths, undeclared environment requirements, data documentation gaps, human-subjects data exposure risks, and more. Feynman is the natural interface for this tool: running the audit, interpreting findings in plain language, guiding the researcher through fixes, and confirming the repository meets the bar for independent validation. See: https://github.com/topeuph-ai/ValiChord

---

## Notes

- AI agents are first-class participants in ValiChord's protocol. Feynman can autonomously publish profiles, claim studies, seal attestations, wait for phase transitions, and submit reveals — the protocol makes no distinction between human and AI validators.
- ValiChord's privacy guarantee is structural, not policy-based. DNA 1 (researcher data) and DNA 2 (validator workspace) are single-agent private DHTs — propagation to the shared network is architecturally impossible, not merely restricted.
- All 72 zome functions across the four DNAs are callable via AppWebSocket. The 20+ `Unrestricted` read functions on DNA 3 and DNA 4 are additionally accessible via HTTP Gateway without any Holochain node.
- If a validation round stalls due to validator dropout, `force_finalize_round` in DNA 4 closes it after a 7-day timeout with a reduced quorum, preventing indefinite blocking.
- Live demo (full commit-reveal cycle, Harmony Record generated): https://youtu.be/DQ5wZSD1YEw
- Running the demo: `bash demo/start.sh` in a GitHub Codespace, then open port 8888 publicly
- ValiChord repo: https://github.com/topeuph-ai/ValiChord

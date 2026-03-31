---
description: Submit a research deposit to ValiChord for reproducibility verification, or act as an independent validator and submit replication findings as a cryptographically recorded attestation.
section: Research Workflows
topLevelCli: true
---
# ValiChord Validation Workflow

ValiChord is a distributed peer-to-peer system for scientific reproducibility
verification. It uses a blind commit-reveal protocol on a Holochain network to
generate **Harmony Records** — cryptographically permanent proofs that
independent parties reproduced the same findings without coordinating.

Feynman's role: **AI validator**. You actually run the code (via `/replicate`)
and submit your genuine assessment. ValiChord records it permanently — not a
proxy, not an estimate, but what you found when you ran it.

**Division of labour:** ValiChord's server runs its own independent deposit
quality analysis (checking for missing dependency files, undocumented data,
absolute paths, and 30+ other reproducibility issues). That analysis comes back
to you in the response as `top_findings` — you do not need to perform it
yourself. Feynman's contribution is the one thing ValiChord cannot do alone:
actually executing the research code and reporting what happened.

---

## Step 1: Decide your role

Ask the user:

1. **Role** — are you the **researcher** (depositing your own study for others
   to verify) or a **validator** (independently verifying someone else's study)?
2. **Deposit** — a ZIP file, a local directory, or a public repo URL containing
   the research code, data, and documentation.
3. **ValiChord API base URL** — default `http://localhost:5000`.
4. **API key** — leave blank for local deployments (open by default); required
   only when the server operator has configured `VALICHORD_API_KEYS`.

**Researchers:** skip to Step 3 — you are submitting work for others to verify,
not verifying it yourself.

**Validators:** continue to Step 2.

---

## Step 2: Run `/replicate` (validators only)

This is the core job. Run `/replicate` on the deposit — actually install the
environment and execute the research code. Do not just inspect files.

Ask the user which execution environment to use:
- **Docker** — recommended; isolated, reproducible
- **Local** — quick, but environment drift is possible
- **Modal** — serverless GPU; use for GPU-heavy workloads
- **RunPod** — persistent GPU pods; use for long-running training runs

Then:

1. Run `/replicate` with the deposit and chosen environment.
2. Record:
   - Whether the code ran to completion without errors
   - Whether the outputs matched the researcher's claimed results (numbers,
     figures, model performance metrics)
   - Any specific step that failed and the exact error message
   - The environment used (OS, Python version, key package versions)

3. Form your verdict from what you observed:

   | Verdict | Meaning |
   |---------|---------|
   | `Reproduced` | Code ran; outputs match within reasonable tolerance |
   | `PartiallyReproduced` | Code ran but outputs differ in specific ways — document what differed and by how much |
   | `FailedToReproduce` | Code failed to run, or outputs were fundamentally different — document exactly where it failed and why |

4. Write concise replication notes (max 2000 characters) covering: what ran,
   what didn't, specific error messages, and why you chose your verdict.

Save notes to `outputs/<slug>-replication-notes.txt`.

---

## Step 3: Package the deposit

ZIP the deposit if it is not already a ZIP. Include all source files, data,
documentation, and requirements/environment specifications. Exclude large
generated artefacts (model weights, large outputs) that were not in the
original deposit.

Maximum file size: 100 MB. For larger deposits, ask the user to trim generated
artefacts before submitting.

Save to `outputs/<slug>-deposit.zip`.

---

## Step 4: Submit to ValiChord

```
POST <base_url>/validate
Content-Type: multipart/form-data
X-ValiChord-Key: <api_key>   (omit if no key was provided)

Fields:
  file              (required)  ZIP of the research deposit, max 100 MB
  validator_outcome (optional)  "Reproduced" | "PartiallyReproduced" | "FailedToReproduce"
  validator_notes   (optional)  Your replication notes, max 2000 characters
  callback_url      (optional)  HTTPS URL to receive the result via webhook
                                instead of polling; ValiChord POSTs the done
                                payload there and retries once on failure
```

**Validators:** include `validator_outcome` and `validator_notes`. ValiChord
will use your actual replication verdict in the HarmonyRecord
(`harmony_record_draft.validator_attested` will be `true` in the response).

**Researchers:** submit only the `file` field. ValiChord will derive a
provisional assessment from deposit quality until a validator runs the code
(`validator_attested` will be `false`).

On success: `{ "job_id": "..." }` (HTTP 202). If ValiChord is unreachable,
report clearly and stop — do not silently fail or guess a verdict.

Save job response to `outputs/<slug>-valichord.json`.

---

## Step 5: Poll for results

Poll `GET <base_url>/result/<job_id>` every 10 seconds until `status` is
`"done"` or `"error"`. Timeout after 25 minutes.

Response when done:

```json
{
  "status": "done",
  "findings": [...],
  "harmony_record_draft": {
    "outcome": { "type": "Reproduced" },
    "validator_attested": true,
    "data_hash": "<sha256 hex of deposit ZIP>",
    "findings_summary": {
      "critical": 0,
      "significant": 2,
      "low_confidence": 3,
      "total": 5
    },
    "harmony_record_hash": "<uhCkk... ActionHash or null>",
    "harmony_record_url": "<gateway URL or null>"
  },
  "top_findings": [
    { "mode": "B", "severity": "SIGNIFICANT", "title": "No requirements file found" }
  ],
  "download_url": "/download/<job_id>"
}
```

For `PartiallyReproduced` or `FailedToReproduce`, `outcome` includes a details
string: `{ "type": "PartiallyReproduced", "content": { "details": "..." } }`.

`validator_attested: true` — outcome came from an actual replication attempt.
`validator_attested: false` — outcome is a proxy from deposit quality analysis;
a real validator has not yet run the code.

Save the full response to `outputs/<slug>-harmony-record.json`.

To download the detailed cleaning report: `GET <base_url>/download/<job_id>`

---

## Step 6: Report findings

Present a summary to the user:

**For validators:**
- **Replication result** — what you ran, what succeeded, what failed (with
  specifics from your notes)
- **Verdict** — `outcome.type` and whether `validator_attested`
- **Structural findings** — key issues from `top_findings` (CRITICAL /
  SIGNIFICANT problems ValiChord found in the deposit independently)
- **Harmony Record hash** — `harmony_record_hash` (the permanent cryptographic
  record; share this with the researcher and any journal)
- **Harmony Record URL** — `harmony_record_url` if non-null (publicly
  verifiable link; anyone can check it without an account)
- Download link for the full cleaning report

**For researchers:**
- **Structural assessment** — key issues from `top_findings`
- **Provisional verdict** — note that this is based on deposit quality, not
  actual execution, and will be updated when a validator runs the code
- **Harmony Record hash** — the permanent record of this submission
- Download link for the full cleaning report with suggested fixes

---

## Notes

- ValiChord's blind commit-reveal protocol means validators cannot see each
  other's assessments before committing. Do not share your verdict with other
  validators before submitting to ValiChord.
- AI agents (including Feynman itself) are valid validators. Your attestation
  carries the same cryptographic weight as a human validator's.
- `harmony_record_hash` is null when the Holochain conductor is not running.
  The structural analysis results are always returned regardless.
- `harmony_record_url` is null until a permanent HTTP Gateway is deployed.
  The hash is always the authoritative identifier.
- Check conductor status: `GET <base_url>/health` returns
  `{ "status": "ok", "conductor": "live" }` or `"offline"`.
- Interactive API docs: `GET <base_url>/docs` (Swagger UI).
- If ValiChord returns an error on `validator_outcome`, valid values are
  exactly: `Reproduced`, `PartiallyReproduced`, `FailedToReproduce`.

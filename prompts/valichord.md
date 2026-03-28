# ValiChord Validation Workflow

ValiChord is a distributed peer-to-peer system for scientific reproducibility verification. It uses a blind commit-reveal protocol on a Holochain network to generate Harmony Records — cryptographically verifiable proofs that independent parties reproduced the same findings without coordinating.

This workflow integrates Feynman as a **validator agent**: Feynman executes the replication, packages the findings, and submits them to ValiChord's protocol.

---

## Step 1: Gather inputs

Ask the user for:
1. The research deposit — a ZIP file or directory containing the original research code, data, and documentation
2. The ValiChord API base URL (default: `http://localhost:5000` for local deployments)
3. The role: **researcher** (depositing original work) or **validator** (submitting an independent replication)

If the user has not yet run a replication, suggest running `/replicate` first and using those results as the deposit.

---

## Step 2: Package the deposit

Using the `researcher` agent:
- If the deposit is a directory, ZIP it: include all source files, data files, requirements/environment specs, and any existing results
- Save the ZIP to `outputs/<slug>-deposit.zip`

---

## Step 3: Submit to ValiChord

Using the `verifier` agent, submit the deposit via the single-shot validation endpoint:

```
POST <base_url>/validate
Content-Type: multipart/form-data
Field: file = <deposit ZIP>
```

Response: `{ "job_id": "..." }`

Save the `job_id` to `outputs/<slug>-valichord.json`. Handle errors gracefully — if the endpoint is unreachable, report clearly and stop.

---

## Step 4: Poll for results

Poll `GET <base_url>/result/<job_id>` until `status` is `"done"` (or `"error"`).

Response shape when done:

```json
{
  "status": "done",
  "findings": [...],
  "harmony_record_draft": {
    "outcome": { "type": "Reproduced" },
    "data_hash": "<sha256 hex>",
    "findings_summary": { "critical": 0, "significant": 0, "low_confidence": 0, "total": 0 },
    "harmony_record_hash": "<uhCkk... ActionHash or null>",
    "harmony_record_url": "<gateway URL or null>"
  },
  "download_url": "/download/<job_id>"
}
```

Save the full response to `outputs/<slug>-harmony-record.json`.

To download the detailed report ZIP: `GET <base_url>/download/<job_id>`

---

## Step 5: Report findings

Present a summary to the user:
- Job ID and deposit hash (`harmony_record_draft.data_hash`)
- Outcome (`harmony_record_draft.outcome.type`: `Reproduced`, `PartiallyReproduced`, or `FailedToReproduce`)
- Findings summary (CRITICAL / SIGNIFICANT / LOW CONFIDENCE counts)
- Harmony Record hash and URL if present (non-null means it was written to the Holochain network)
- Path to the saved record

Note any discrepancies between the researcher's deposit and validator findings, if this was a validator submission.

---

## Notes

- ValiChord's blind commit-reveal protocol means validators cannot see researcher findings before committing their own, and vice versa. Do not attempt to pre-read results from the other party.
- AI agents (including Feynman itself) are valid validators in ValiChord's protocol.
- `harmony_record_hash` is null when the Holochain conductor is not running — analysis results are still returned.
- ValiChord repo: https://github.com/topeuph-ai/ValiChord

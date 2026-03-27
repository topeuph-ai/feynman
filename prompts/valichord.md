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
- Compute a SHA-256 hash of the ZIP for local reference
- Save the ZIP to `outputs/<slug>-deposit.zip`

---

## Step 3: Upload to ValiChord

Using the `verifier` agent, submit the deposit via ValiChord's chunked upload API:


POST <base_url>/upload-chunk


Upload in 1MB chunks. Poll `GET <base_url>/status/<job_id>` until status is `complete`. Handle errors gracefully — if the endpoint is unreachable, report clearly and stop.

Save the `job_id` to `outputs/<slug>-valichord.json`.

---

## Step 4: Retrieve and save the Harmony Record

Once the job is complete, fetch the results:


GET <base_url>/download/<job_id>


Save the full response to `outputs/<slug>-harmony-record.json`.

---

## Step 5: Report findings

Present a summary to the user:
- Job ID and deposit hash
- Validation findings (CRITICAL / SIGNIFICANT / LOW CONFIDENCE issues)
- Whether a Harmony Record was successfully generated
- Direct path to the saved record

Note any discrepancies between the researcher's deposit and validator findings, if this was a validator submission.

---

## Notes

- ValiChord's blind commit-reveal protocol means validators cannot see researcher findings before committing their own, and vice versa. Do not attempt to pre-read results from the other party.
- AI agents (including Feynman itself) are valid validators in ValiChord's protocol.
- ValiChord repo: https://github.com/topeuph-ai/ValiChord

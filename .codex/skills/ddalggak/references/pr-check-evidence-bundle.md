# PR check evidence bundle

Use this reference when a ddalggak/Dobby report needs to summarize GitHub PR checks without copying raw CI logs.

## Contract

- Source inputs are public GitHub check metadata such as `gh pr checks --json ...`, `statusCheckRollup`, or Checks/Actions API JSON.
- Allowed output fields: check name, workflow name, normalized state, conservative failure class, details/job URL, timestamps, and obvious matrix axis such as `Node 20`.
- Forbidden output fields: raw logs, command stdout/stderr excerpts, secret/token/env values, private workflow output, or inferred root cause not supported by metadata.
- Failure classes are conservative: `infra-failure`, `test-failure`, `permission-auth-failure`, or `unknown-failure`.
- `unknown-failure` means a human or later safe log inspection is still needed; do not promote it to a code finding.

## Local helper

```bash
gh pr checks <PR_NUMBER> --repo OWNER/REPO \
  --json bucket,completedAt,description,event,link,name,startedAt,state,workflow \
  > /tmp/pr-checks.json
node scripts/pr-check-evidence-report.mjs --input /tmp/pr-checks.json
```

The Markdown output is intended for final reports, issue comments, or PR status comments. Use `--json` when another script needs the deterministic summary.

## Review rule

A content-light check evidence bundle is not an APPROVE signal by itself. Pending/failing checks still block APPROVE and ready transitions until the current head has terminal success/skipped checks or a verified no-CI exception.

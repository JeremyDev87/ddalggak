# Artifact Manifest

```yaml
schema: ddalggak-artifact-manifest/v1
lane_id: "<lane id>"
issue:
  number: <issue-number-or-null>
  url: "<issue-url-or-empty>"
branch:
  name: "<branch>"
  base_sha: "<base sha>"
  head_sha: "<head sha or empty before commit>"
pull_request:
  number: <pr-number-or-null>
  url: "<pr-url-or-empty>"
  head_sha: "<current reviewed/pushed sha>"
artifacts:
  patches:
    - path: "<path or URL>"
      sha256: "<sha256 or not-applicable>"
      source: "<local|github|ci|not-applicable>"
  validation_logs:
    - command: "<command>"
      result: "passed|failed|skipped|not_run"
      evidence_path_or_summary: "<path/url/short summary>"
  screenshots:
    - path_or_url: "<path/url-or-not-applicable>"
      viewport: "<viewport-or-not-applicable>"
      reason: "<why included or not-applicable>"
  review_comments:
    - url: "<comment-url-or-empty>"
      head_sha: "<sha>"
      conclusion: "approve|change request|comment|pending"
omissions:
  - artifact: "<artifact name>"
    reason: "<why safely absent>"
privacy:
  secrets_redacted: true
  raw_private_output_included: false
readiness:
  deep_interview_verdict: "READY|NEEDS_INTERVIEW|BLOCKED"
  critic_consensus_verdict: "ACCEPT|NARROW|REWORK"
  blocking_gaps: []
```

Rules:

- The manifest is resumability/review evidence, not a substitute for live PR/diff/check verification.
- `privacy.raw_private_output_included` must stay `false`; summarize private output instead of pasting raw secrets, prompts, tokens, or transcripts.
- A lane cannot be reported ready if `branch.head_sha`, `pull_request.head_sha`, or required validation evidence is missing without an explicit blocker.

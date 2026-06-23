# Start Workflow Reference
Use when: a `start` run needs full issue implementation detail beyond the hot path, including target resolution, task scope, worker brief, validation, and PR-ready evidence.
Required by: `start`; implementation gate families selected by Quality Lens Router.
Side effects: source-edit
Do not use when: the user asked only for `plan`, `status`, `check`, `prompt`, or another read-only subcommand.


Use this when `start` needs full issue implementation detail beyond the hot path.

## Required flow
1. Resolve any GitHub URL target before trusting cwd.
2. Run base freshness checks: `git fetch --prune`, status, branch, upstream ahead/behind, and worktree list.
3. Read issue body and comments together. Latest explicit human comment can refine or override body scope.
4. Build Issue-PR Strategy with Conflict Fallback. Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it.
5. For each lane, write a task scope contract: Goal, Authorized files, Forbidden files/actions, Allowed side effects, Escalation-required actions, Validation commands, Completion evidence.
6. Use isolated worktrees. Independent issue lanes must create their own issue PR; hard-conflict fallback lanes hand off patch/commit evidence to one fallback PR.
7. Completion is not test pass. Require commit, push, PR URL/evidence, validation evidence, and review gate state.

Gajae-Code `team` pattern, minimized for ddalggak: before running a worker lane, fill the Worker Brief `Artifact Path Manifest` and the Lane State `artifacts` block. This is a resumability/compact/review manifest, not a durable engine or database. If a lane needs a user answer, record a question ID and question in `pending_user_input`, then stop at the human gate instead of guessing.

## Stale base / conflict refresh rule

If `start` detects that the lane base is stale or conflicts with the live base, it must not stop at a vague stale-base warning. The conductor owns the refresh decision:

1. Re-read live base/PR/issue state and name the current base SHA, lane head SHA, and conflicting files.
2. Prefer a normal rebase onto the refreshed base for an unshared or automation-owned lane branch.
3. Use `--force-with-lease` only after recording the old remote head SHA and only for the same lane branch; never force-push someone else's branch or a protected base.
4. If the branch is human-owned, ambiguous, or the conflict expands scope beyond the issue contract, stop with `blocked` and ask for direction instead of rewriting history.
5. After any rebase/conflict fix, rerun the focused validation plus repo verification, update `lane-state` with the new base/head SHA, and require a fresh current-head review before ready.

## Required gates
- Quality Lens Router Output
- Evidence Contract
- Simplicity / Deletability Gate with small direct change first
- Frontend Design Gate only for UI/frontend work
- Vercel Agent Skills Gate only for React/Vercel/mobile/motion work
- Continuous Regression Library only for known/repeated Medium/High risks

## Issue body → worker brief field mapping

When converting an issue body (`templates/issue-body.md`, keyed by GitHub issue form ids) into a worker brief (`templates/worker-brief.md`), follow this table. Ad-hoc reinterpretation outside the table is forbidden.

| Issue body section (form id) | Worker brief field | Default when missing |
|---|---|---|
| 목적 / 문제 (`goal`) | Task → Goal, Expected outcome | required — halt conversion and confirm with the conductor |
| 원본 근거 / Source of Truth (`source_of_truth`) | Context Assembly Manifest → Issue body/comments, Required references | required — halt conversion and confirm with the conductor |
| 범위 / Non-Goals (`scope`) | Task → Goal scope bounds; Non-Goals go to Task Scope Contract → Forbidden files/actions | required — halt conversion and confirm with the conductor |
| 파일 소유권 / Must-not-touch (`owned_files`) | Task Scope Contract → Authorized files (change table), Forbidden files/actions (Must-not-touch) | mark `미지정 — conductor가 보강` |
| 완료 기준 / 검증 · Evidence (`validation`) | Task Scope Contract → Validation commands, Completion evidence; Evidence Contract → Required evidence | mark `미지정 — conductor가 보강`, then record it under Evidence Contract → Blocking evidence gaps |
| Blockers / Unknowns (`blockers`) | Context Assembly Manifest → Assumptions / known blockers | mark `미지정 — 없음으로 단정하지 않음` |

Rules for unmappable or missing fields:
- If a required field (`goal`/`source_of_truth`/`scope`) is missing, `start` must not improvise a substitute. Halt the conversion and confirm with the conductor or the user.
- If an optional field is missing, write the table's default marker verbatim into the worker brief field. Never leave it blank or omit it (blocks implicit "none" interpretation).
- Worker brief fields absent from the table (Quality Lens Router Output, the remaining Evidence Contract items, Completion Signal) are produced by `start`'s own gates, not taken from the issue body.
- Non-form sections: the issue body's Wiki Context Manifest is auxiliary input for Context Assembly Manifest → Required references. Owned files / Must not touch under 병렬 실행 메모 are auxiliary signals for the `owned_files` table; on conflict, the `owned_files` table wins.

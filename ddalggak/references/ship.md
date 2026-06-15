# Ship 상세 절차
Use when: `ship` needs to publish already-existing validated changes as a draft PR with Korean metadata and manual-merge boundaries.
Required by: `ship`; combined `start` → `ship` runs after implementation evidence exists.
Side effects: github-write
Do not use when: there is no meaningful diff against the intended base or validation/scope evidence is missing.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Ship

`ship`은 이미 존재하는 변경만 commit/push/draft PR로 게시한다. issue body/comments 재확인, scope 확인, validation, local adversarial review, intended files만 stage, What/Why commit, draft PR body의 What/Why/Validation/Risk/Issues를 포함한다. merge/auto-merge 금지.

## Draft → ready transition

`ship` may create a draft PR, but it must not leave the ready boundary implicit. The conductor may mark the PR ready for review / ready for manual merge only after all of these are true for the current head SHA:

1. The PR URL, base branch, head branch, head SHA, and file list were read back from GitHub.
2. Required local validation and `git diff --check` passed after the latest push/rebase.
3. Independent current-head review concluded `approve` with blocker count 0, or a top-level self-review verdict was posted when formal approval is inappropriate.
4. GitHub checks for the current head are terminal success/skipped, or a documented no-CI exception applies.
5. `lane-state` moves from `pr_opened`/`review_pending` to `ready_for_manual_merge` and records the review comment URL.

If the PR is still draft after those gates, `ship`/conductor may run `gh pr ready <pr>` and then read back `isDraft=false`. This is not merge or auto-merge authority. If any gate is missing, keep the PR draft or report `review_pending`/`blocked` with the missing evidence.

## Stale base before publishing

Before commit/push/PR update, `ship` must verify the lane branch is based on the intended live base. For automation-owned lane branches, rebase onto the refreshed base and push with `--force-with-lease` only after recording the old remote head SHA. For human-owned or ambiguous branches, stop before rewriting and ask. After any rebase, rerun validation and current-head review evidence before draft→ready.

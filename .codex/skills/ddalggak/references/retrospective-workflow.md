# Retrospective Workflow Reference
Use when: a `retro` run executes the retrospective steps: PR confirmation, note writing, memory extraction, completion report, and wiki registration.
Required by: `retro`; every retrospective artifact written outside the repository.
Side effects: repo-external writes only (retrospective notes, memory artifacts); never edits repository files.
Do not use when: the work would write any path inside the repository, or a wiki write would bypass the approval-gated `setwiki` bridge.

`ddalggak retro` runs after a PR merge or after a completed session when the user explicitly chooses a session-based retrospective. It writes retrospective artifacts only; it does not edit source code.

## Write-permission boundary

The canonical contract is `write_side_effects` in `core/commands/retro.yaml`; retro may write only repo-external locations.

- **Allowed**: the retrospective note under `~/workspace/retrospective/` (or the `RETRO_DIR` override path), and memory files or memory-update request artifacts in the runtime memory directory.
- **Forbidden**: no writes to any path inside the repository — source, docs, or config alike, with no exceptions. The permission table's source-edit ❌ covers every repo path.
- **Wiki**: never written directly; only approval-gated `/setwiki` proposals through the `wiki-bridge.md` bridge.
- Improvements to the ddalggak skill or its permission tables stay proposal-only inside the retrospective note.

## Target selection

1. If a PR number is provided, use that PR.
2. If no PR is provided, list recent merged PRs authored by the current account and ask the user to choose.
3. If no merged PR exists, either write a session-based retrospective with an explicit session slug or stop.

Verify a PR target before writing:

```bash
gh pr view <pr-number> --json number,state,mergedAt,title,url
```

Stop if the PR is not merged.

## Retrospective document

Use this structure:

```markdown
# 회고 — PR #<N> <제목>

- **날짜**: YYYY-MM-DD
- **PR**: <URL>
- **소요**: (리뷰 반복 횟수, 주요 이슈 수)

## 무엇을 했는가
(변경 항목 요약 테이블)

## 잘 된 것
(리뷰 iteration을 줄인 요인 / 예상보다 빠른 진행 원인 / 반복해서 쓸 가치 있는 패턴·접근법)

## 실패 패턴과 교훈
- **시도**:
- **결과**:
- **근본 원인**:
- **교훈**:

## 지식 추출 분리
- one-off incident record: facts tied only to this PR/session/environment
- reusable knowledge extraction: durable rule classified under `harness-engineering/*`, `principles/*`, `frontend/*`, or `llm-wiki/*`
- do not turn PR numbers, commit SHAs, or single-session completion logs into durable guidance unless generalized

## 아키텍처 정리 (해당 시)

## 최종 결과
(CI, review verdict, merge date)
```

## Storage and reporting

Before classifying any lesson as a memory or wiki candidate, load `references/wiki-growth-triage.md` and apply its triage criteria: assign each lesson to exactly one primary classification lane (immediate guardrail / reference-template / verifier-script / GitHub issue / defer-reject) and run the getwiki deduplication check before proposing it as a memory artifact or a setwiki bridge candidate.

Default path:

```text
~/workspace/retrospective/YYYY-MM-DD-pr<N>-<slug>.md
```

If a project-specific retrospective directory is configured, use that instead. Create only retrospective or memory-update request artifacts.

Completion line:

```text
RETRO DONE PR#<N>: 파일=<경로> 메모리=<저장한 개수>개
```

If wiki registration is requested or configured, use the `wiki-bridge.md` setwiki bridge for a `retrospectives` category candidate. The default is review-only; do not write wiki files until explicit approval. Wiki registration failure should not fail the retrospective when the local file was saved successfully.

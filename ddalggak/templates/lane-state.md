# Lane State Template

이 템플릿은 ddalggak 실행 중 `stale head`, `stale review`, PR 미생성, phase/wave 전환 누락을 사람이 빠르게 재현·검증하기 위한 lightweight runtime event 기록 양식이다.

## 사용 원칙

- durable runtime engine, scheduler, database를 만들기 위한 계약이 아니다.
- 긴 세션 compact, reviewer handoff, PR rescue, phase 전환 직전에 로컬 scratch 파일이나 PR/issue comment에 필요한 범위만 복사해 사용한다.
- secret, `.env.local`, token, service key, private workflow output은 기록하지 않는다.
- `head_sha`가 바뀌면 기존 review conclusion은 stale로 보고 `review_pending` 또는 `fix_pending`으로 되돌린다.
- `pr_url`이 비어 있으면 완료 상태가 아니다. 구현·검증이 끝났더라도 `pushed` 상태에 머물게 하고 다음 gate를 PR 생성으로 둔다.
- draft PR은 `ready_for_manual_merge`가 아니다. current-head validation, terminal checks, and `approve` review evidence가 모두 기록된 뒤 conductor가 `gh pr ready`를 실행하고 `is_draft=false`를 readback해야 ready 상태로 전환할 수 있다.

## 상태 전이

권장 상태 값:

1. `planned` — issue scope, allowed files, validation path가 정리됨.
2. `implementing` — branch/worktree가 만들어졌고 코드·문서 변경 중.
3. `validated` — 로컬 검증은 끝났지만 아직 commit/push/PR 전.
4. `pushed` — commit이 remote branch에 push됨.
5. `pr_opened` — PR URL이 확인됨.
6. `review_pending` — current head에 대한 독립 리뷰 또는 CI/check terminal success가 아직 없음.
7. `fix_pending` — current head 리뷰/CI에서 blocker가 발견되어 수정 필요.
8. `ready_for_manual_merge` — current head checks가 success/skipped 또는 no-CI 검증 완료이고, current head 독립 리뷰가 `APPROVE` 결론이며, draft PR이면 `gh pr ready` 후 `is_draft=false` readback이 끝남.
9. `blocked` — credentials, scope, conflict, validation gap 등으로 자동 진행 불가.
10. `merged` — 사람이 merge했고 target branch evidence가 확인됨.

## Event Record

```yaml
schema: ddalggak-lane-state/v1
recorded_at: "<ISO-8601>"
repo: "<owner/repo>"
base_branch: "master"
phase: "<phase-name-or-number>"
lane_id: "<lane-id>"
state: "planned|implementing|validated|pushed|pr_opened|review_pending|fix_pending|ready_for_manual_merge|blocked|merged"

issue:
  number: <issue-number>
  url: "https://github.com/<owner>/<repo>/issues/<number>"
  title: "<issue-title>"

branch:
  name: "feature/issue-<number>-<slug>"
  worktree: "<absolute-worktree-path>"
  base_sha: "<origin/base sha used to start/rebase>"
  head_sha: "<current branch head sha or empty before commit>"

pull_request:
  url: "<PR URL or empty>"
  number: <pr-number-or-null>
  is_draft: true
  base_ref: "master"
  head_ref: "feature/issue-<number>-<slug>"

scope:
  allowed_files:
    - "<path>"
  forbidden_files:
    - "<path-or-domain>"
  non_goals:
    - "<explicit non-goal>"

validation:
  commands:
    - command: "<exact command>"
      result: "not_run|passed|failed|skipped"
      evidence: "<short log path or summary>"
  blocking_gaps:
    - "<gap or empty>"

review:
  required_for_head_sha: "<head sha that must be reviewed>"
  latest_conclusion: "none|pending|approve|changes_requested"
  conclusion_head_sha: "<head sha named by latest conclusion or empty>"
  comment_url: "<review/comment URL or empty>"
  stale_reason: "<empty or why stale>"

ready_transition:
  owner: "conductor|human"
  command: "gh pr ready <pr-number> or human action"
  allowed_when: "current-head validation passed; checks terminal success/skipped; review approve@head; blocker_count=0"
  is_draft_readback: true
  merge_authority: "manual-only; no merge/auto-merge"

next_gate:
  owner: "conductor|worker|reviewer|human"
  action: "<exact next action>"
  command: "<exact command if applicable>"
  exit_condition: "<observable completion signal>"
```

## Manual Replay Checklist

### Stale head/review 확인

- [ ] `branch.head_sha`와 GitHub PR current head SHA가 같은가?
- [ ] `review.conclusion_head_sha`가 current `branch.head_sha`와 같은가?
- [ ] 다르면 `state=review_pending` 또는 `fix_pending`으로 되돌리고 fresh independent review를 요구했는가?

### PR 미생성 확인

- [ ] `validation.commands`가 모두 passed여도 `pull_request.url`이 비어 있으면 완료로 보고하지 않았는가?
- [ ] `state=pushed`에서 멈춘 경우 `next_gate.action`이 PR 생성으로 지정됐는가?
- [ ] GitHub에서 같은 issue를 닫거나 참조하는 open PR이 이미 있는지 중복 확인했는가?

### Phase/wave 전환 확인

- [ ] 이전 phase의 PR들이 실제로 merged이고 target branch에 반영됐는가?
- [ ] 다음 phase branch가 최신 `origin/<base_branch>` 또는 의도한 stacked base에서 시작됐는가?
- [ ] 이전 phase의 stale worktree/branch head를 새 작업의 base로 재사용하지 않았는가?

### Scope/allowed-files 확인

- [ ] 실제 diff가 `scope.allowed_files` 안에 들어가는가?
- [ ] `forbidden_files` 또는 secret/local-only 파일이 diff에 포함되지 않았는가?
- [ ] 범위 밖 변경이 있으면 `blocked` 또는 `fix_pending`으로 기록했는가?

## Compact Handoff Summary

긴 세션 compact 직전에는 위 YAML 전체 대신 아래 축약형을 함께 남긴다.

```text
LANE_STATE: issue=#<number> state=<state> branch=<branch> pr=<url-or-none> base=<base_sha> head=<head_sha> review=<conclusion>@<sha-or-none> next=<owner>:<action>
```

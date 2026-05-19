# Local Diff Check Reference

`ddalggak check` is a read-only one-shot review for uncommitted local changes or a specific worktree diff. It reports findings to the user and does not open GitHub comments, edit files, stage, commit, push, or create PRs.

## Inputs

- No argument: review current unstaged/staged diff against `HEAD`.
- `<worktree-path>`: review that checkout's diff against `HEAD`.
- `--staged`: review staged changes only.

## Required discovery

Before judging the diff, record base freshness and local state:

```bash
git fetch --prune
git status -sb
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
git diff HEAD --stat
git diff --stat --cached
```

For a worktree target:

```bash
git -C <worktree-path> diff HEAD --stat
git -C <worktree-path> status -sb
```

If there is no diff, stop with `리뷰할 변경사항이 없습니다.` If the diff is very large, narrow the scope or get explicit user confirmation before continuing.

## Review contract

- Use a fresh reviewer session when the runtime supports one; otherwise say the review is not independent.
- Keep the review read-only.
- Do not use GitHub commands from the review brief.
- Read extra files only when the diff lacks necessary context.
- Classify findings as Critical, High, Medium, or Low.
- Do not guess beyond the diff and directly inspected context.

## Output format

```text
CHECK DONE: critical=N high=N medium=N low=N
```

Then report:

```markdown
## Check 결과 — <branch> (<파일 수>개 파일, +N/-M줄)

| 심각도 | 건수 |
|--------|------|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |

### Critical
...

### High
...

### Medium / Low (요약)
...

## 권고
- Critical+High = 0: ship 가능
- Critical+High > 0: 아래 항목 수정 후 ship 권장
```

There is no fix iteration loop. The user decides whether to apply changes.

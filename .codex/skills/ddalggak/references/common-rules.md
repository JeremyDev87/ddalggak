# Common Rules Reference
Use when: any ddalggak command needs shared safety, GitHub, Markdown, review-boundary, or validation rules not duplicated in SKILL.md.
Required by: all ddalggak commands.
Side effects: none.
Do not use when: the task is outside ddalggak workflow execution and does not need ddalggak shared rules.

Korean responses by default, no AI trailers, no secrets, no merge/auto-merge without explicit current-turn request, raw UTF-8 GitHub metadata, issue comments as source-of-truth candidates, and exact validation evidence.

Use active voice only for known actors; never turn explanations into commands. Do not mechanically apply English grammar, dictionaries or word limits to Korean.

## Approval comment versus formal approval

`review` posts no formal approval or top-level verdict. Only authorized verified inline findings on the requested PR may publish; current head SHA or source version, review scope, validation evidence, blocking finding count, and conclusion stay in chat.

A historical top-level comment is not GitHub formal review approval. Final reports and PR evidence must separate `CI/check 상태`, `reviewDecision`, `mergeStateStatus`, branch protection, and manual merge boundary. Do not imply "mergeable" from CI success plus a top-level APPROVE comment alone.

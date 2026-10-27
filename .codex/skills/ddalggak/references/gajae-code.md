# Gajae-Code Delegation
Use when: `gjc-plan`, `gjc-execute`, or `gjc-team` delegates work to the gajae-code coordinator MCP server.
Required by: `gjc-plan`, `gjc-execute`, `gjc-team`
Side effects: coordinator delegation only; mutation requires explicit user approval and enabled coordinator mutation class.
Do not use when: the task can be completed directly inside ddalggak without delegation.

## Coordinator tools

- `gjc-plan` calls `gjc_delegate_plan` for consensus planning.
- `gjc-execute` calls `gjc_delegate_execute` for approved implementation and verification.
- `gjc-team` calls `gjc_delegate_team` for parallel team execution.

Pass the current project `cwd`, user task, and effective language/explicit override to the coordinator. Keep `allow_mutation: false` unless the user explicitly approved mutation for this turn and the coordinator mutation class is enabled.

For `gjc-plan`, include the shared criteria from `references/quality-lens-router.md` and the independent critic contract from `references/ralplan-critic-consensus.md` in the delegated request. Require the returned plan artifact to identify the actual fresh critic session, reviewed version, findings/no-findings with coverage, and parent reconciliation. Keep code-shape criteria conditional and distinguish proposed validation from executed checks.

## Evidence

Record the returned `turn_id`, then poll bounded coordinator state with `gjc_coordinator_await_turn` or `gjc_coordinator_watch_events`. Treat terminal turn state and artifacts as source of truth, not terminal scrollback. A terminal state alone is not independent review evidence: for `gjc-plan`, inspect the actual critic result and current plan artifact, recheck candidate findings against source evidence/counterexamples, and record adoption/rejection reasons and residual dissent. Missing, stale, or mismatched critic artifacts leave the plan incomplete; report the gap without `GJC_PLAN_DONE`.

## Visible tmux sessions

Visible gajae-code sessions are an external GJC helper surface, not a ddalggak packaged script surface. Use them only when the installed GJC checkout exposes its session helper commands; otherwise stay on the Coordinator MCP path.

For visible sessions, require a dedicated worktree, a stable session name, bounded tail/readiness evidence, and durable recovery artifacts such as metadata, pane log, event log, and final status.

Never hard-code channel ids, mentions, tokens, credentials, or private host paths in public docs, prompts, or scripts.

## Completion

End with `GJC_PLAN_DONE`, `GJC_EXECUTE_DONE`, or `GJC_TEAM_DONE` after coordinator evidence and cleanup are recorded; `GJC_PLAN_DONE` additionally requires the verified independent critic result and parent reconciliation above.

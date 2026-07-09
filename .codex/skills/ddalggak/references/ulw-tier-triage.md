# ULW Tier Triage and QA Channel Matrix
Use when: `ulw-loop` must size implementation rigor, choose real-surface QA, or translate lazycodex ultrawork execution-loop concepts into ddalggak.
Required by: `ulw-loop`
Side effects: none
Do not use when: the task is read-only research or plan-only; use `ulw-research.md` or `ulw-plan.md` instead.

This reference absorbs lazycodex v4.16.0 `ultrawork` / `ulw-loop` concepts as a ddalggak-native contract. Copy the operating shape, not OMO/Codex-specific state or tools.

## Tier triage

Classify once at bootstrap and record the tier plus one-line justification in the work note / conductor state. Default to LIGHT only when the work is narrow and reversible. Upgrade immediately if a HEAVY fact appears; never downgrade mid-task.

| Tier | Use when | Minimum success criteria | Required review shape |
| --- | --- | --- | --- |
| LIGHT | Narrow change inside existing layers: one bugfix, one validation rule, one command/doc reference patch, one query/copy/config tweak. | 1-2 criteria: happy path plus riskiest edge. | Direct implementation, self-review for Critical/High, real-surface proof. |
| HEAVY | New module/layer/domain model/abstraction; auth/security/session/permissions; external API/queue/payment/webhook; DB schema/migration; concurrency/transactions/cache invalidation; cross-domain refactor; user asks for careful/high-accuracy review. | 3+ criteria: happy, edge, regression, adversarial. | Plan/wave decomposition, independent reviewer or critic pass, rerun after fixes. |

Tier controls process size, not honesty: both tiers require evidence, cleanup receipts, and explicit gaps.

## Execution loop summary

Run each criterion through `PIN -> RED -> GREEN -> SURFACE -> CLEAN`:

1. **PIN** existing behavior before changing it when the behavior already exists. For docs/instruction changes, PIN may be the current marker set, verifier baseline, or `--show-doc` output captured before the edit.
2. **RED** capture failing-first proof for the target gap. For docs/instruction changes, RED may be marker absence, verifier failure, or `--show-doc` missing the new required reference.
3. **GREEN** make the smallest scoped edit that flips RED to GREEN.
4. **SURFACE** run the real surface named by the criterion, not only unit/static checks.
5. **CLEAN** remove spawned servers, tmux sessions, browser contexts, temp dirs, containers, or QA-only env and record a cleanup receipt.

## Manual-QA channel matrix

| Channel | Exact proof shape | ddalggak evidence template mapping | Use for |
| --- | --- | --- | --- |
| HTTP | `curl -i <url>` or Playwright API request; capture status, headers, body. | Data/API/backend or deploy/runtime evidence. | Live endpoint/API behavior. |
| tmux | Start a named tmux session, drive keystrokes, capture pane transcript, then kill/verify cleanup. | Bugfix/regression or CLI/TUI real-surface evidence. | Long-running CLI, TUI, REPL, watcher flows. |
| Browser | Drive the real page with browser automation and capture action log plus screenshot/DOM state. | UI/design/frontend rendered evidence. | User-visible web behavior. |
| Computer use | Drive the actual desktop/GUI app with OS automation and capture action log plus screenshot. | UI/design/frontend or desktop runtime evidence. | Non-browser GUI behavior. |
| Auxiliary surface | CLI stdout, parsed config dump, file hash, DB diff, generated manifest, `--show-doc` output. | Data/API/backend, docs/runtime-asset, or instruction-surface evidence. | CLI/data/docs/skill-reference changes where the user-facing surface is not HTTP/browser/GUI. |

A scenario must name the literal command/action, inputs, artifact path, and binary PASS/FAIL observable. `looks correct`, dry-run-only output, and build/lint/test green without the surface proof are insufficient for completion claims.

## ddalggak translation table

| lazycodex/OMO concept | ddalggak equivalent |
| --- | --- |
| `multi_agent_v1.spawn_agent` workers | `delegate_task` or ddalggak worker brief; Dobby verifies child self-reports before claiming completion. |
| `.omo/ulw-loop/*` state | Compact conductor/work note, `.omo/plans/*` when already present, and Discord handoff for cross-turn continuity. |
| `update_plan` | Hermes `todo` plus a durable handoff/conductor note when the work may resume later. |
| `create_goal` / `get_goal` | The user-approved ddalggak objective and success criteria; do not create duplicate runtime goals. |
| Codex browser/computer-use tools | Use the available Hermes/browser/computer-use/terminal equivalents; if unavailable, record a blocking evidence gap. |

## Non-goals / forbidden imports

- Do not introduce `.omo` CLI state management, `omo ulw-loop`, or Codex `teammode` as ddalggak dependencies.
- Do not expand `source_edit_allowed`, `github_write_allowed`, deploy, merge, release, publish, or public-write authority.
- Do not replace ddalggak evidence-contract, wiki-context-preflight, simplicity/deletability, or handoff rules; this reference layers sizing and QA-channel rigor onto them.

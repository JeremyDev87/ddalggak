# ULW Plan
Use when: a user wants a decision-complete implementation plan before source edits.
Required by: `ulw-plan`
Side effects: none
Do not use when: the user has authorized implementation now; use `ulw-loop`.

`ulw-plan` turns a goal into a bounded execution plan without editing source files.

## Executable artifact runtime

`ddalggak ulw-plan scaffold <slug> [--clear|--unclear] [--review-required]` creates only a resume-safe draft and gate state under `.omo/`. Explicit `approve` creates the plan artifact; before that `.omo/plans/<slug>.md` must not exist. The remaining state transitions are `review-init`, `review-receipt`, `finalize`, and `status`. These writes are plan artifacts, not source edits.

Finalization fails closed until the draft approval binds its digest. When review is required, both `momus` and `independent` receipts must match the current round, launch, session, target, and plan SHA-256; duplicate, stale, mismatched, or post-review-modified plans are rejected.

## OMO origin and parity boundary

The behavioral reference is oh-my-openagent `v3.8.3` at `84e103c41f9863ea32533b9532b013a796053587`, especially its Prometheus interview and plan-generation surfaces. That release has no named `ulw-plan` command: this is a clean-room ddalggak translation, not an exact command or prompt-text copy. The CLI state machine preserves durable gates; the surrounding Hermes skill procedure still owns investigation, clarification, and reviewer orchestration. See `core/ulw-plan/SOURCE.json` for the pinned source map and non-claims.

## Procedure

1. Read the relevant repo, issue, docs, and evidence surfaces.
2. State the goal, source of truth, non-goals, and forbidden actions.
3. Route intent with `ulw-intent-routing.md`: CLEAR, UNCLEAR, or ON-THE-FENCE; record `review_required` separately.
4. Lock topology: enumerate 1-6 independently succeeding/failing components and trace todos to them.
5. List owned files, must-not-touch files, success criteria, and validation commands.
6. Identify parallel lanes only when write surfaces are independent.
7. When delegated work is part of the plan, emit a `Delegation Recommendation` using the semantic task category and the available runtime boundary; do not imply that the plan executed the delegation.
8. Name blockers instead of guessing.
9. End with `ULW_PLAN_DONE`.

## Phase Execution Ledger

Every plan that may cross a compact, wait, handoff, or session boundary must
include a durable phase ledger, even when the plan has only one phase. The
ledger is the execution contract, not a progress narrative:

- Store the plan artifact at a path recorded in `lanes[].artifacts.plan`.
- Compute `plan_hash` as `sha256:<64 lowercase hex>` over the LF-normalized
  UTF-8 bytes of that plan artifact; do not hash a chat transcript.
- Record each phase's `id`, `goal`, `status`, observable `exit_condition`,
  `next_phase_id`, evidence, and blocker when applicable.
- `phase_ledger.phases[]` is canonical. `phase_ledger.current_phase_id`,
  `phase_ledger.next_phase_id`, and top-level `phase` are projections; any
  mismatch is `NEEDS_RECONCILIATION`, never an invitation to guess.
- A non-terminal multi-phase plan must have exactly one `in_progress` phase and
  a planned next phase when one exists. A terminal ledger is valid when every
  phase is `completed` or `skipped`, `next_phase_id` is `null`, and the
  current/top-level phase projections point to the final phase. A completed
  phase requires non-empty evidence.
- A single-phase plan must still declare `mode: single`, an exact plan hash,
  and a next gate; legacy state without a ledger is not sufficient for a new
  multi-phase ULW loop.

## Delegation Recommendation

When the plan contains work that may be delegated, include this block after topology and lane decisions:

```markdown
### Delegation Recommendation
- Task category: `deep | standard | quick`
- Model lane: `Sol | Terra | Luna`
- Worker profile: `<Kanban profile or unresolved>`
- Runtime: `delegate_task | Kanban`
- Rationale:
- Parallelization:
- Fallback / escalation:
- Parent verification:
```

Route by task role before naming a model:

- `deep` → **Sol**: architecture, security, difficult multi-file reasoning, and high-risk final review.
- `standard` → **Terra**: ordinary implementation, bug fixes, tests, documentation, and bounded research.
- `quick` → **Luna**: inventory, extraction, classification, deduplication, and repetitive high-volume work.

Use `Terra` as the normal standard-work default. Escalate to `Sol` when requirements are ambiguous or failure cost is high; use `Luna` only when the work is mechanical and independently verifiable. Do not silently downgrade an ambiguous or high-risk task to `quick`.

### Runtime boundary

- `delegate_task` has no profile-selection parameter in the current runtime contract. Recommend a model lane/category only; never report profile isolation as executed.
- Recommend `Kanban` when the work is long-running, multi-turn, retryable, profile-isolated, or needs durable task state. A worker profile may be named only when its live availability is verified.
- The recommendation is advisory. `ulw-plan` does not spawn workers, choose credentials, mutate runtime configuration, or claim that a child ran.
- If category support or profile availability is unresolved, report the gap explicitly and preserve the plan-only boundary.

## Intent routing summary

See `references/ulw-intent-routing.md` for the ddalggak translation of lazycodex v4.16.0 `ulw-plan` routing.

- **CLEAR**: user knows the outcome; ask only genuine owner-decisions that repo/wiki/source evidence cannot answer.
- **UNCLEAR**: desired outcome is fuzzy; research, adopt defensible best-practice defaults, record assumptions/reversibility, then present the approval brief.
- **ON-THE-FENCE**: ask exactly one highest-leverage question rather than silently choosing.

Topology lock happens before detailed planning: list the 1-6 independent components, dependencies, owned surfaces, and forbidden side effects. Approval gate is `grounding -> brief_presented -> awaiting-approval -> approved` with `scope_changed` looping back to a fresh brief. `review_required` uses `ralplan-critic-consensus.md` / critic review before finalizing.

## Non-goals

Do not import Codex teammode or source-edit authority. The ddalggak-native runtime may write only its `.omo/drafts`, `.omo/plans`, and `.omo/ulw-plan` artifacts. Plan-only remains no source edits and no GitHub writes unless a separate ddalggak command explicitly grants them.

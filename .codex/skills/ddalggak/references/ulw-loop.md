# ULW Loop
Use when: a user asks ddalggak to implement a bounded goal through an evidence-led loop.
Required by: `ulw-loop`
Side effects: source edits inside the stated goal scope only; no GitHub writes.
Do not use when: the user only wants a plan or research; use `ulw-plan` or `ulw-research`.

`ulw-loop` executes the smallest faithful implementation loop on top of ddalggak's existing evidence and simplicity gates.

## Procedure

1. Define observable success criteria and non-goals.
2. If the user supplied only `ulw-loop`/a terse router word, first recover the obvious target from the immediately preceding substantive user message, replied-to context, current handoff, active task list, or last ddalggak research/plan result. Treat a just-delivered research/plan artifact with one concrete durable-surface target as recoverable scope. If exactly one target is recoverable, proceed with that scope and state the assumption; if multiple or none are recoverable, ask for the target instead of editing.
3. Confirm the failing-first proof or cite why the provided RED evidence already covers it.
4. Size the work with `ulw-tier-triage.md`: LIGHT for narrow reversible changes, HEAVY for risky/cross-domain changes; upgrade only.
5. Make the smallest source edit that satisfies the criteria.
6. Run targeted checks and one real-surface proof for the changed behavior.
7. Self-review for Critical or High issues, fix accepted blockers, and rerun the affected checks.
8. Report evidence, cleanup, unresolved blockers, and `ULW_LOOP_DONE`.

## LazyCodex ultrawork concepts absorbed

See `references/ulw-tier-triage.md` for the ddalggak translation of lazycodex v4.16.0 `ultrawork` / `ulw-loop`:

- Tier triage: LIGHT = 1-2 criteria + direct self-review; HEAVY = 3+ criteria + critic/reviewer loop.
- Execution loop: `PIN -> RED -> GREEN -> SURFACE -> CLEAN` for every success criterion.
- Manual-QA channels: HTTP, tmux, browser, computer-use, and auxiliary CLI/data/docs surfaces with exact artifact capture.

Do not import `.omo` CLI state, Codex `teammode`, or `multi_agent_v1` as dependencies; translate them to ddalggak worker briefs, Hermes `todo`, `delegate_task`, evidence-contract, and handoff/conductor notes.

## Persistent-surface loops

When the loop changes durable operating surfaces rather than application code (wiki pages, cron prompts, handoffs, workcell docs, or skill references):

- Treat the user's `ulw-loop` after `ulw-research`/`ulw-plan` as approval to apply the planned bounded changes, but do not run unrelated side-effectful actions such as image generation, cron execution, deploys, or public/GitHub writes unless explicitly requested. If the plan itself included image generation and the user says to run the loop or corrects that photos should be generated, that is explicit scope approval for the planned image-generation step; do not stop at setwiki or other preparatory durable-surface updates.
- Before doing any work, preserve the routing contract: the first visible line must be exactly `-> ulw-loop 실행`. Do not answer with `ulw-plan` or repeat the plan just because the previous turn was plan-like.
- Update every authoritative surface in the dependency chain, not only the first matching file. Typical order: canonical wiki/SSOT or config → local workcell docs/templates → handoff → relevant class-level skill/reference → runtime prompt/config if in scope.
- Preserve cross-domain boundaries explicitly. If transferring a workflow from one persona/domain to another, copy the operating contract/gate shape, not the source domain's character canon or volatile state.
- Verify with marker readback on each surface plus the domain's canonical index/update path (for the iCloud wiki, `qmd update`, `qmd embed`, `qmd search`, and `qmd get`).
- For persona/image-generation correction loops, distinguish prompt hints from acceptance gates. When the user says an output “does not feel like X” (e.g. body proportion, identity, hair, naturalness), add or tighten explicit `PASS_*` / `RETRY_*` gates in the canonical wiki or authority surface, then propagate the same markers to workcell prompt templates, QA docs, active context, relevant cron prompts, and handoff. Do not stop at prose-only prompt wording; require actual-pixel QA and final-report fields for the new gate.
- For real-person-inspired persona styling overlays (e.g. “make this fictional persona more like celebrity X, but preserve the persona”), persist the result as a **lower-priority style/mood overlay**, not a face/body identity replacement. Add a named marker, raw support note, compile-order rule, PASS/RETRY labels (including an “overlay overpowers identity” retry), and explicit “not a real-person lookalike/copy” boundary. The overlay must compile after P0 persona identity/appearance gates and before scene/outfit variables; final QA can pass the overlay only after actual pixels preserve the persona first.
- iCloud/QMD dataless-file pitfall: if direct file reads return empty (`1|`) or Python/file APIs raise `Resource deadlock avoided`, do **not** treat the wiki page as empty. Use `qmd get qmd://wiki/<path> -l <large>` as the readback source, parse only the document body after the folder-context/frontmatter separators, then materialize/write the full edited file. If direct write also raises `Resource deadlock avoided`, run `brctl download <file>`, write to a temporary sibling, then atomic-replace the target; verify again with direct marker checks and `qmd get/search`.
- When adding a log/status entry before final indexing, make its status truthful for the current phase. If it says closeout is still needed, patch it after the verification completes, then rerun the canonical update/embed/update path so the indexed log matches the final report.
- For cross-profile skill-library sync/follow-up loops (for example default/Dobby ↔ Alfredo), verify both support-file inventory and main `SKILL.md` body drift, union-merge bidirectional durable rules, preserve markers, check frontmatter/fence/size/diff equality, and update the handoff with residual-drift closeout evidence.
- For peer-plan-to-profile-skill loops (for example `Javis 계획대로 반영해` where the plan targets Javis profile-local skills/references/report contracts), apply only the bounded mandatory durable-surface changes, keep optional residual cleanup/non-goals out unless separately approved, update the thread handoff, and verify marker readback plus profile/script health checks.
- Final report must say which side effects were intentionally not run.

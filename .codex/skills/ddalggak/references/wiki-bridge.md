# Wiki Bridge Contract
Use when: ddalggak crosses into wiki/getwiki/setwiki context, including read-only wiki retrieval or approval-gated wiki writes.
Required by: `plan`, `review`, `retro`, `getwiki`, `setwiki`; wiki context/admission boundary.
Side effects: approval-gated-write
Do not use when: the task has no wiki retrieval/write surface, or another dedicated wiki skill owns the detailed procedure.


Use this reference when ddalggak needs LLM Wiki context or wants to preserve a reusable lesson from planning, implementation, review, ship, or retro work.

The bridge is an admission and approval boundary. ddalggak does not own iCloud, QMD, or wiki ingestion mechanics; it decides when to call the existing `getwiki`, `setwiki`, and `pjw-icloud-llm-wiki` workflows and what evidence must remain in the ddalggak artifact.

## getwiki bridge — read-only retrieval

Use `getwiki` when plan or review needs wiki-grounded context, prior decisions, workflow patterns, or repeated failure knowledge.

Required contract:

1. Treat `getwiki` as read-only.
2. After Brain v0, inherit getwiki's retrieval authority mode: broad `qmd://wiki` is discovery; Brain/canonical/control pages carry current-answer authority; raw/imported/hidden/index/log/redirect alias hits are evidence-only unless canonical/distilled.
3. Search enough to answer the current issue/PR question, but do not turn broad wiki research into scope expansion.
4. Cite the source path for every wiki-derived claim in the plan, review, issue comment, or PR note.
5. If retrieval fails or no relevant page exists, record an evidence gap instead of inventing wiki facts.
6. Keep live GitHub, local repo, PR diff, checks, and issue comments higher priority than stale wiki notes.

Plan/review artifacts must use the canonical Wiki Context Manifest defined in
`references/wiki-context-preflight.md`. This bridge owns the read/write
boundary; it does not define a competing manifest field set.

## setwiki bridge — approval-gated write

Use `setwiki` only when ddalggak has identified a reusable lesson worth preserving beyond the current issue.

Required contract:

1. Default to review-only: propose whether and where knowledge should be saved, but do not write wiki files.
2. Require explicit user approval before any wiki write.
3. After Brain v0, inherit setwiki's write/routing policy: no accidental raw promotion, canonical Brain/current writes, redirect gates, hidden support distillation, and default+split QMD/index hygiene verification.
4. After approval, delegate source guard, write plan, index.md update, log.md append, qmd update, and verification to the canonical `pjw-icloud-llm-wiki` workflow.
5. Do not write the iCloud wiki directly from `plan`, `start`, `review`, `ship`, `status`, `check`, or `prompt`.
6. `retro` may propose or invoke the setwiki bridge, but wiki write failure does not invalidate a completed code PR.

Write-approved setwiki evidence belongs in the setwiki output, not in ddalggak's hot path. ddalggak only needs to record the approved source, the target workflow, and any blocking evidence gap.

## Forbidden surfaces

- Do not modify source skill files for the `getwiki` wrapper.
- Do not modify source skill files for the `setwiki` wrapper.
- Do not mutate the user's iCloud wiki tree from ddalggak subcommands before the setwiki approval gate.
- Do not mutate wiki `raw/` sources.
- Do not promote raw/imported/hidden/index/log/redirect alias hits into current-answer authority from ddalggak.
- Do not inline iCloud/QMD/setwiki implementation details into `SKILL.md`.
- Do not change CLI routing (`bin/**`) merely to add wiki bridge behavior.

## Wiki growth triage handoff

When new knowledge may affect ddalggak itself, first classify it with `wiki-growth-triage.md`:

- `Immediate guardrail`: small SKILL invariant only if repeated High/Critical workflow failure evidence exists.
- `Reference/template only`: preferred for useful but bulky context.
- `Verifier/script candidate`: only when a stable contract can be checked mechanically without pre-enforcing future work.
- `GitHub issue candidate`: when the change needs product/design discussion or a broader rollout.
- `Defer/reject`: when evidence is weak, speculative, or outside ddalggak's execution path.

The smallest durable surface wins. Rich procedures belong in references, templates, scripts, or the canonical wiki workflow rather than in the always-loaded skill body.

## Verification expectations

For PRs that change this bridge:

- Verify both packaged payload roots contain `references/wiki-bridge.md`.
- Verify `SKILL.md` keeps only a short wiki bridge invariant and points to this reference.
- Verify `getwiki` remains read-only and `setwiki` remains approval-gated.
- Verify `index.md`, `log.md`, and `qmd update` are described only as delegated setwiki responsibilities, not ddalggak inline steps.
- Run the package verifier, smoke tests, readiness eval, package dry-run, and `--show-doc` surface checks when applicable.

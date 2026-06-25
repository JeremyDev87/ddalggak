# Core Invariants Reference
Use when: `plan`, `start`, or `review` needs the long-form rationale behind the global guardrails indexed as hot-path anchors in SKILL.md.
Required by: `plan`, `review`, `start`; progressive-disclosure backing for the always-loaded invariant pointers.
Side effects: none
Do not use when: the run needs subcommand procedure; workflow steps live in the per-subcommand references, not in this invariant index.

Use this reference when `ddalggak plan`, `start`, or `review` needs the long-form rationale behind global guardrails that are indexed in `SKILL.md`. The always-loaded SKILL files keep only compact invariants and pointers; this file preserves the detailed anchors so guardrails are not lost during progressive disclosure.

## Hot-path invariant index

Keep these as short pointers in `SKILL.md`, then load the named references when the routed subcommand needs the details:

- URL beats cwd: parse GitHub URL handling criteria before mutation and stop when the cwd remote does not match the parsed owner/repo/number.
- Issue comments matter: issue body and comments are both source-of-truth candidates; the latest explicit comment wins over stale body text.
- No implicit dependencies: prove a dependency already exists before importing it.
- Manual merge only: never merge or enable auto-merge without an explicit current-turn request; ready means ready for manual merge only.
- Issue-PRs by default: one issue PR per independent issue; hard conflict is the only reason to use a single PR with separate commits.
- Runtime contract language: `references/agent-runtime-contract.md` owns Task Scope Contract, Context Assembly Manifest, Resume Snapshot, and Control-flow ownership.
- Quality Lens Router: `references/quality-lens-router.md` owns Applicable gate families, Skipped gates, Required references, Lightweight or limited gates, backend-only skip, and Repo/product conventions.
- Gate Verdict Vocabulary Index: `references/gate-verdict-vocabulary.md` maps gate terms to common axes.
- Evidence Contract: `references/evidence-contract.md` owns Blocking evidence gaps and the rule No evidence, no readiness or approval.
- Simplicity / Deletability Gate: `references/simplicity-deletability-gate.md` owns small direct change first and why any proposed abstraction is necessary.

## Scope and source-of-truth invariants

- tool capability boundary is not the task scope contract. Workers may technically be able to edit, delete, push, call APIs, or touch credentials, but only the issue/brief-authorized surface is allowed.
- Unauthorized out-of-scope diff, unrelated cleanup, config/credential/migration changes, destructive actions, external API writes, production data touch, force-push, or branch mutation are scope-expansion failure candidates.
- Diff Footprint / Scope Expansion Review compares changed files, side effects, config/credential/migration/destructive action, external API write, and production data touch against the Task Scope Contract.
- Small focused workers, explicit orchestration: workers execute small tactical changes; conductor/reviewer-owned gates decide branch, PR, review, fix, and readiness transitions.
- Resume/compression recovery starts from live git/GitHub state plus a Resume Snapshot, not stale conversation memory.

## Evidence and readiness invariants

- rendered evidence is a first-class proof surface for UI/design/frontend work.
- Counterargument Pass must name weak assumptions, repo convention conflicts, evidence that would disprove readiness, and the smaller or more direct change before readiness claims.
- Treat unmerged prerequisite PRs/issues, overlapping verifier surfaces, and open automation PRs that change the same contract as missing readiness / ordering input, not as Dobby rejection.
- Rendered evidence includes route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence. Use not-applicable with a specific reason when skipped.
- Transitive rendered fallback audit looks through list/detail surface, shared card/media primitive, missing media, empty DB/data, nullable field, and mapper default.
- Continuous Regression Library belongs in `references/regression-library.md`; use Regression Library Candidate only for repeated Medium/High pattern or class-level failure, not for one-off incidents.

## Simplicity and deletability invariants

- Self-created complexity is a defect. forced modularization, Client-side patches that bypass real boundaries, mock-only tests, and unnecessary helper/provider/wrapper layers are review risks.
- one-off abstraction defaults to suspicious unless it proves real reuse or boundary clarification.
- human readability/deletability outranks SOLID and named patterns when they conflict.
- Preserve semantic predicate helpers such as `isNull`, `isUndefined`, `isNil`, or domain guards when they communicate value-category intent and prevent truthy/falsy mistakes.

## Privacy and knowledge-growth invariants

- knowledge extraction must only promote durable reusable lessons.
- Analytics privacy defaults to deny: raw search terms, prompt titles, prompt bodies, full query strings, arbitrary text, email/name/profile identifiers, and personal identifiers require an explicit allowlist before collection.
- Knowledge extraction is durable only when it belongs in reusable categories such as harness-engineering/*, principles/*, frontend/*, or llm-wiki/*.
- PR numbers, commit SHAs, single-session completion logs, and incident records are not durable reusable knowledge unless generalized into a reusable principle, reference, script, template, or eval.
- Wiki-derived guardrails use `references/wiki-growth-triage.md` and are classified as immediate guardrail, reference/template only, verifier/script candidate, GitHub issue candidate, or defer/reject before entering canonical workflow text.

## Component and frontend-adjacent invariants

- Component methodology gate: main component only assembles.
- Use ComponentName.parts.tsx for substantial conditional UI only when it improves readability; do not create empty companion files.
- Use ComponentName.utils.ts for calc/format/parse only when the extracted behavior is reused or independently testable.
- Prefer satisfies Record<...> maps where supported for variant/size/style contracts.
- Tests should cover behavior and public visual-contract classes; no silent fallback for missing data/media/auth states.

## Raw UTF-8 GitHub metadata invariant

GitHub issue/PR title/body must be sent and verified as raw UTF-8. Literal Unicode escapes such as `\uXXXX`, `\uD558`, or `\ud558` must be rejected or decoded before persistence; Python/JSON payloads should use `json.dumps(..., ensure_ascii=False)` with `gh api --input`, then re-read the live title/body.

## Non-goals

- Do not re-expand this entire file into always-loaded `SKILL.md`.
- Do not replace the specialized references for agent runtime, evidence, simplicity, quality routing, frontend, Vercel, or regression library details.
- Do not add CLI behavior, release automation, or new runtime framework code merely to satisfy these terms.

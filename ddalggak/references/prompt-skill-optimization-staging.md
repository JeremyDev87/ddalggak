# Prompt / Skill Optimization Staging
Use when: a prompt/skill optimizer, eval harness, or agent proposal suggests changes to canonical ddalggak skill, reference, template, verifier, or CLI-dispatched documentation surfaces.
Required by: prompt/skill optimization review; packaged-skill change planning/review.
Side effects: none
Do not use when: the change is a normal issue implementation with no optimizer-generated candidate or canonical skill-surface proposal.


Use this reference when a GEPA, DSPy, prompt optimizer, evaluation harness, or agent-generated proposal suggests changes to a ddalggak prompt, `SKILL.md`, reference file, template, CLI-dispatched documentation, or packaged skill payload.

Optimizer output is a **candidate artifact**, not a canonical skill change. The optimizer may produce evidence and a proposed patch, but the canonical repository changes still move through the normal issue, branch, review, and PR workflow.

## Non-negotiable boundary

Do not let an optimizer directly mutate canonical skill surfaces:

- `ddalggak/SKILL.md`
- `.codex/skills/ddalggak/SKILL.md`
- `ddalggak/references/`, `.codex/skills/ddalggak/references/`
- `ddalggak/templates/`, `.codex/skills/ddalggak/templates/`
- CLI dispatch docs exposed by `--show-doc`
- verifier anchors and package payload boundaries

The only safe default output from an optimizer is a staged packet stored outside the canonical skill surface, for example under an ignored `.ddalggak/optimizer-candidates/` directory, a temporary artifact path, or a GitHub issue/PR body prepared for human review.

## Candidate packet contract

A candidate packet must include enough information for an independent reviewer to reproduce and reject it safely:

- **Source prompt / skill surface**: exact file, section heading, command output, or reference being optimized.
- **Objective**: the measurable behavior the candidate is meant to improve.
- **Lineage / trace**: optimizer name, input corpus, evaluation set, scoring rubric, and run identifier if available.
- **Proposed diff**: patch or before/after text, scoped to the minimal affected surfaces.
- **Regression replay**: commands or cases run against the old and proposed prompt.
- **Failure cases**: examples that got worse, not only examples that improved.
- **Risk / rollback note**: what can be reverted and how to detect harm after merge.
- **Promotion target**: issue number, intended branch/PR, and whether the candidate affects Claude, Codex, or both payloads.

If any required field is missing, treat the candidate as discovery evidence only. Do not promote it directly to a source edit.

## Promotion gates

Before a staged candidate can become a repository change:

1. **Scope gate**: confirm the candidate edits only the surfaces authorized by the issue or review brief.
2. **Diff gate**: inspect the exact canonical diff that would be committed. Never rely on optimizer prose alone.
3. **Lineage gate**: preserve enough trace context in the issue, PR body, or candidate packet for future maintainers to understand why the change exists.
4. **Regression gate**: replay the relevant prompt, skill, CLI `--show-doc`, verifier, or smoke cases before claiming improvement.
5. **Mirror parity gate**: when packaged skill surfaces are mirrored, update and verify both Claude and Codex payloads or explain why only one side is in scope.
6. **Independent review gate**: a reviewer that did not generate the candidate must check scope, safety, prompt drift, stale wording, and rollback clarity.
7. **Normal PR gate**: commit, push, PR body, checks, review conclusion, and manual merge policy remain unchanged.

A candidate that changes scheduler prompts, workflow state machines, label semantics, review criteria, or code modification permissions must be treated as high risk even when the diff is small.

## Direct-write anti-patterns

Reject or restage candidates that do any of the following:

- rewrite canonical `SKILL.md` from optimizer output without a reviewed diff;
- remove routing, code-modification, manual-merge, evidence, or reviewer-isolation invariants;
- introduce new pseudo-states or labels not declared by the workflow contract;
- update only one mirrored payload when both are user-visible;
- change verifier anchors to make a failing candidate pass instead of preserving the intended contract;
- hide worse regression cases or omit the evaluation set;
- require secrets, private transcripts, or unredacted user data to justify the change;
- bypass GitHub issue/PR review because the optimizer score improved.

## Safe staging pattern

1. Save optimizer output as an ignored or external candidate packet.
2. Create or update a GitHub issue with the packet summary and promotion target.
3. Use `ddalggak plan` to convert the packet into a minimal, reviewable implementation unit.
4. Use `ddalggak start` to apply only the approved canonical diff.
5. Run verifier and smoke checks that cover the exposed skill surface.
6. Use `ddalggak review` or an independent review comment to approve or request changes.

The final PR should state that the optimizer output was staged evidence and name the validation that proved the canonical diff, without pasting secrets or large private traces.

## Validation checklist

For prompt/skill optimization PRs, include the applicable checks in the PR body:

- `npm run verify:codex-skill`
- `npm test`
- `npm pack --dry-run --ignore-scripts --loglevel=silent`
- targeted `node bin/ddalggak.js <subcommand> --show-doc` checks when CLI-dispatched documentation changes
- `git diff --check`
- regression replay or explicit `not-applicable: <reason>` when there is no executable replay

Do not mark the PR ready, post an `APPROVE` conclusion, or call the candidate "promoted" until the current head has the required validation evidence and independent review has no Critical/High blockers.

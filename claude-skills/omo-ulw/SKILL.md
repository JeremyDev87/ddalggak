---
name: omo-ulw
description: Use when the user asks for OMO-style ulw, ulw-loop, ulw-plan, ulw-research, ultraresearch, evidence-led execution, or exhaustive research inside Claude Code.
argument-hint: "[plan|loop|research] <goal>"
user-invocable: true
---

# OMO ULW for Claude Code

Use this skill when the user wants the OMO ULW working style inside Claude Code. This is a Claude-native port of the workflow method, not a Codex tool bridge.

## Route

Parse the first argument:

- `research` or `ulw-research`: run exhaustive research.
- `plan` or `ulw-plan`: produce a decision-complete plan only.
- `loop`, `start`, or `ulw-loop`: execute evidence-led work.
- No explicit mode: infer the smallest matching mode from the request.

## Shared Rules

- Start from the user's requested outcome, then identify success criteria that can be observed.
- Prefer the smallest faithful process. Do not create `.omo` state, Codex threads, or custom files unless the user explicitly asks for durable artifacts.
- Use Claude Code native subagents, plan mode, task tools, or MCP tools when available. Do not mention or call Codex-only tools such as `multi_agent_v1`, `codex_app`, or `tool_search`.
- Treat tests as supporting evidence. A claim is done only when the requested behavior is exercised through its real surface: CLI output, HTTP response, browser/GUI action, data diff, or a cited source trail for research.
- Keep a short evidence ledger in the reply or in a user-requested artifact: command/source, observed result, and any cleanup.
- Never run merge, release, publish, tag, or protected-branch actions without explicit user approval.

## Research Mode

Use when the user asks for `ulw-research`, `ultraresearch`, deep research, exhaustive investigation, or a cited answer.

1. Decompose the question into at least three independent axes.
2. Search each axis separately. Use official docs and primary sources first; use web, GitHub, local files, and executable checks as applicable.
3. Track every lead that appears under an `EXPAND` list. Investigate new leads until they are answered, duplicate, dead, or the user asks to stop.
4. Verify contested or code-shaped claims by running the smallest faithful command or script.
5. Synthesize with citations for every material claim, plus a short gaps section for unresolved items.

## Plan Mode

Use when the user asks for a plan before coding or when the requested outcome is broad.

1. Read the relevant repo/docs first.
2. Ask only for owner decisions that cannot be inferred safely.
3. Produce a plan with explicit files/surfaces, success criteria, validation commands, manual QA surface, and non-goals.
4. Stop after the plan unless the user explicitly asks to execute it.

## Loop Mode

Use when the user wants delivery, implementation, or a goal-like execution loop.

1. Define one or more observable success criteria.
2. For code changes, capture a failing-first proof before production edits when feasible.
3. Make the smallest correct change.
4. Run targeted automated checks.
5. Exercise the real surface and capture the observable result.
6. Fix any Critical or High issue found in self-review before declaring completion.
7. Report what changed, what passed, what could not be verified, and any remaining risk.

## Output

Keep the final answer concise:

- Outcome.
- Evidence: exact commands, source URLs, file paths, or artifacts.
- Gaps or blockers, if any.

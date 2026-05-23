# Prompt Optimizer Reference

Audit BRIEF/REVIEW/FIX prompts for single goal, why, concrete validation, restatement, and question path. Do not edit skill definition files from this subcommand.

## Prompt Safety / Brief Compiler

`prompt` also acts as a **Prompt Safety / Brief Compiler**: it turns a draft instruction into a safer execution brief before work starts. It may improve brief/review/fix artifacts, but it must not edit source files, skill definitions, or canonical references directly. Canonical changes require the normal issue/branch/PR/review path.

A compiled prompt separates:

- goal and non-goals
- source of truth and evidence gaps
- scope boundary and tool authority boundary
- validation path and stop conditions
- missing questions versus safe next action
- risk signals and fail-closed judgement

The output ends with a judgement label and `PROMPT_DONE`.

## Prompt Audit

Evaluate the draft before compiling it:

| Field           | Check                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Goal clarity    | Is there one clear goal, or should multiple goals be split?                                           |
| Source of truth | Which issue, comment, wiki page, file, or user statement is authoritative?                            |
| Scope boundary  | Are allowed, forbidden, inspect-only, and must-not-touch surfaces explicit?                           |
| Validation path | Is there a command, review, manual check, or evidence artifact for completion?                        |
| Question need   | Is missing information handled by questions instead of guesses?                                       |
| Risk level      | Are GitHub mutation, secrets, auth, release, deploy, data mutation, and source-edit risks called out? |

Use one of these judgement labels:

- `READY_FOR_BRIEF`: safe to compile into an execution brief.
- `NEEDS_CLARIFICATION`: ask before compiling or executing.
- `BLOCKED_UNSAFE`: refuse to produce an executable brief for the current instruction.
- `DISCOVERY_ONLY`: downgrade to read-only discovery instead of implementation/mutation.

## `prompt grill-me`

`prompt grill-me` is question-first mode. When the draft has large execution gaps, ask 3-7 questions instead of producing an executable brief.

Question rules:

1. Do not ask for information already provided.
2. Each answer should map directly into a brief field.
3. Prioritize scope, source of truth, validation, authority, rollback, and stop conditions.
4. Split mandatory questions from optional hardening questions when needed.
5. Do not return `READY_FOR_BRIEF` before the required answers exist.

Example shape:

```markdown
## Prompt Audit

- Goal clarity: ...
- Source of truth: ...
- Scope boundary: ...
- Validation path: ...
- Question need: ...
- Risk level: ...

## Grill-me questions

1. ...
2. ...
3. ...

Judgement: NEEDS_CLARIFICATION
PROMPT_DONE
```

## Unsafe Prompt Gate

Fail closed instead of compiling a prompt when any of these signals appear:

- Unbounded scope such as “fix everything”, “handle all related work”, or “do whatever is needed”.
- Requests to invent issue, PR, CI, package, repo, or external facts without live verification.
- Secrets, tokens, private sessions/logs, or credentials would be printed or stored.
- GitHub mutation, push, release, deploy, DB mutation, or other side effects lack a clear approval boundary.
- The `prompt` subcommand is asked to directly edit source files, skill files, or canonical references.
- There is no validation path but the prompt asks for completion, success, approval, or ready-to-merge claims.
- A user correction is being reused as if the wrong prior claim were still valid.

Gate outcome:

- Use `DISCOVERY_ONLY` when the safe path is read-only investigation.
- Use `NEEDS_CLARIFICATION` when questions can close the gap.
- Use `BLOCKED_UNSAFE` when the instruction is outside authority or unsafe.
- Use `READY_FOR_BRIEF` only when scope and validation are closed.

## Integrated flow

1. Run Prompt Audit on the draft.
2. Name the source of truth and scope boundary.
3. Use `prompt grill-me` when required information is missing.
4. Apply the Unsafe Prompt Gate and fail closed when needed.
5. Compile only safe instructions into brief/review/fix artifacts.
6. End with the judgement label and `PROMPT_DONE`.

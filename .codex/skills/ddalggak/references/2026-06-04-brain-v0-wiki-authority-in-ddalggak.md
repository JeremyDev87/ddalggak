# Brain v0 Wiki Authority in ddalggak
Use when: ddalggak plan/review/start, scheduled issue ticks, or getwiki/setwiki bridge subcommands use 박정욱's iCloud wiki after the Brain v0 migration/hardening batches.
Required by: `start`, `review`, `plan`, `getwiki`, `setwiki`; Brain v0 wiki authority routing and bridge inheritance.
Side effects: read-only for retrieval; approval-gated-write only through delegated `/setwiki`.
Do not use when: the task has no wiki context surface, or the user explicitly asks only for non-wiki repository evidence.

## Core rule

Ddalggak must not flatten wiki evidence into a single undifferentiated context blob. Broad `qmd://wiki` search results are discovery only. Current-answer authority must route through Brain v0 control surfaces.

## Retrieval routing for plan/review/start

1. Run the normal `references/wiki-context-preflight.md`.
2. When a wiki claim affects a plan/review verdict or start brief, prefer Brain v0 authority sources:
   - `brain/P0_*`, `brain/P1_*`, domain registries, SSOT/current canon, answer-compiler/router docs.
   - split `wiki-brain-v0` / `wiki-control` when available for authority-sensitive queries.
3. Treat these as source/evidence/discovery only unless an authority page says otherwise:
   - `raw/`, `harin/raw/`, `ai-assets/`, hidden paths, root `index.md`, `log.md`, and `status: redirected` legacy aliases.
4. If a result has `status: redirected`, follow `canonical_path` and cite/use the canonical target; `do_not_answer_as_current: true` is a hard gate.
5. Hidden/imported `ai-assets` hits require explicit distillation into non-hidden Brain/wiki pages before they can support a current-answer plan/review claim.
6. If raw/source evidence conflicts with Brain/canon routing, report the conflict. Do not let raw/source pages override active authority unless the user explicitly asked for historical/source provenance.
7. Preserve the Harin access gate from `getwiki`: do not read/use Harin pages unless the current prompt contains `하린` or the thread has verified standing Harin instruction.

## Bridge subcommands

- `ddalggak getwiki ...` delegates to the dedicated `/getwiki ...`; it must inherit Brain v0 retrieval authority rules from the getwiki skill.
- `ddalggak setwiki ...` delegates to the dedicated `/setwiki ...`; it must inherit Brain v0 write/routing policy from the setwiki skill.
- Ddalggak bridge code should not implement direct iCloud wiki mutation.

## Output / evidence manifest additions

In the Wiki Context Manifest, add or preserve:

- Brain v0 authority sources read:
- Raw/imported/alias sources seen but not used as authority:
- Redirect aliases followed:
- Split index used / unavailable:
- Authority conflicts or evidence gaps:

## DoD for ddalggak changes touching wiki behavior

- Hot path points to this reference without inlining long policy.
- `wiki-context-preflight.md` mentions Brain v0 authority routing.
- `wiki-bridge.md` mentions inheritance from getwiki/setwiki Brain v0 policy.
- show-doc/package/verifier surfaces include this reference when the ddalggak repo/package is changed.

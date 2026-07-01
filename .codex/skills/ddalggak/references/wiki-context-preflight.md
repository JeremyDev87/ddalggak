# Wiki Context Preflight
Use when: any ddalggak subcommand run must combine live GitHub/repo evidence with prior LLM Wiki knowledge before acting.
Required by: all ddalggak subcommands; every Wiki Context Manifest those runs emit.
Side effects: none
Do not use when: the task needs wiki writes (the approval-gated `setwiki` bridge owns those), or wiki facts would substitute for live diff/issue/PR/check evidence.

Use this reference before every subcommand to retrieve relevant knowledge from 박정욱's LLM Wiki. When no relevant wiki exists or search fails, record `Wiki: none-found` and proceed with normal behavior — wiki strengthens the run but never blocks it.

## Purpose

Combine live GitHub/repo evidence with reusable prior knowledge, repo/product conventions, past failure modes, and known decisions from the LLM Wiki. Wiki context strengthens planning and review, but it does not replace live diff, issue, PR, checks, or repository evidence.

## Query Seed Extraction

Extract 3-8 search queries from the available live context:

- issue title/body/comments or PR title/body
- linked issue and acceptance criteria
- repo name, product name, touched paths, public routes, API surfaces, or workflow names
- domain nouns, architecture nouns, failure symptoms, or recurring pattern names
- changed files and validation/evidence gaps for reviews

## Retrieval

Load `getwiki` / `pjw-icloud-llm-wiki` workflow when available. Search in this order:

1. exact product/repo/domain terms
2. architecture/convention terms
3. regression/failure-mode terms
4. reusable principle terms

Read only the relevant wiki sources needed for the current judgment, normally 1-5 pages. If retrieval fails or no relevant source exists, record the gap and continue from live evidence.

## Brain v0 authority routing

After the Brain v0 migration/hardening batches, ddalggak wiki preflight must apply `2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` in addition to generic retrieval:

- Treat broad `qmd://wiki` search results as discovery, not direct current-answer authority.
- Prefer Brain P0/P1/domain/SSOT/control pages and split `wiki-brain-v0` / `wiki-control` where available for authority-sensitive claims.
- Treat `raw/`, `harin/raw/`, `ai-assets/`, hidden paths, `index.md`, `log.md`, and redirected legacy aliases as evidence-only unless a canonical/distilled Brain page authorizes the claim.
- Follow `status: redirected` aliases via `canonical_path`; do not cite `do_not_answer_as_current: true` pages as current authority.
- Record raw/imported/alias evidence seen-but-not-used in the Wiki Context Manifest when relevant.

## Manifest

Every subcommand output must include a wiki context manifest before its completion signal (record `Wiki: none-found` when retrieval returns nothing relevant):

```markdown
### Wiki Context Manifest
- Queries attempted:
- Wiki sources read:
- Relevant wiki facts:
- Constraints / prior decisions:
- Unknowns not found in wiki:
- Non-wiki inference:
- Brain v0 authority sources read:
- Raw/imported/alias sources seen but not used as authority:
- Redirect aliases followed:
- Split index used / unavailable:
- Authority conflicts or evidence gaps:
```

For review output, also distinguish findings backed by live PR/repo evidence from findings strengthened by wiki sources.

## Guardrails

- Do not invent wiki facts.
- Cite wiki paths when claiming wiki-derived knowledge.
- A wiki search failure is an evidence gap, not permission to hallucinate.
- Review blocking findings still require live PR/repo evidence; wiki context can strengthen rationale but cannot be the only proof.
- Do not write to the wiki from `plan` or `review` unless the user separately asks for a wiki update.
- Do not persist PR numbers, commit SHAs, or single-session facts to memory; use wiki/setwiki for rich reusable procedures and memory only for compact durable preferences.

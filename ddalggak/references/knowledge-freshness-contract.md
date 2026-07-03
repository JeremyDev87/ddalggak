# Knowledge Freshness Contract
Use when: creating or editing a durable knowledge document (reference, template, wiki proposal), or judging whether an existing one is still current before citing it.
Required by: knowledge audit mode in `wiki-growth-triage.md`; freshness judgment before citing a durable document as current.
Side effects: none
Do not use when: the document is transient session output (a plan, research report, or review comment) that is not meant to stay durable.

Durable documents rot silently. This contract makes staleness observable instead of discovered-in-failure.

## Last-verified, not created

A freshness timestamp records when the document's claims were last verified against live state, not when the text was written. Record it as a `Last-verified: YYYY-MM-DD (<evidence>)` line directly under the admission header; a surface declares thresholds or stricter overrides the same way (e.g. `Freshness-threshold: 90d`). Editing prose without re-verifying claims does not refresh it.

## Staleness thresholds by document kind

Reference defaults; a surface may declare stricter ones. Past-threshold is not auto-deletion — it is an audit finding that demands re-verification, update, or deprecation.

| Kind | Threshold | Rationale |
|---|---|---|
| Operational scope/config statements | 30 days | Tracks fast-moving work state. |
| Lessons from recent incidents | 60 days | Should be promoted or retired, not hoarded. |
| Rules and gates | 90 days | Stable, but must track workflow evolution. |
| External-source distillations | 180 days | Bounded by upstream drift, tracked explicitly below. |

## Upstream identity for distillations

A document distilled from an external source records the upstream identity it was distilled from (commit SHA, release version, or dated URL) so upstream drift is detectable by comparison rather than by memory.

## Co-change check

When changing a workflow surface, command, or file that durable documents describe, grep the durable surfaces for the changed names. Statements the change makes stale get an update in the same change or an explicit follow-up proposal. Silent rot is the failure mode this contract exists to prevent.

## Application scope

Applies to durable documents created or modified after this contract landed. Retroactive stamping of the existing corpus is a separate mechanical rollout, sized and approved on its own.

Pattern provenance: distilled from field observation of an OKF-style repo-local agent knowledge-bundle workflow (Open Knowledge Format v0.1 governance).

# Plan to Issues Reference
Use when: `issue` converts an accepted plan into GitHub issue bodies with owned files, non-goals, validation, dependency, and UTF-8 metadata guarantees.
Required by: `issue`; parent/child issue generation.
Side effects: github-write
Do not use when: the user asked only for a plan/review, or the plan lacks enough detail to create automatable issues.


Convert an issue-ready plan into GitHub issues. Use raw UTF-8 for non-ASCII titles and bodies, prefer body files or UTF-8 JSON payloads, and re-read created issues to verify no literal Unicode escapes were persisted.

Each implementation issue must include Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by.

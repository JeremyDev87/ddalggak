# Ship Reference
Use when: `ship` needs to publish already-existing validated changes as a draft PR with Korean metadata and manual-merge boundaries.
Required by: `ship`; combined `start` → `ship` runs after implementation evidence exists.
Side effects: github-write
Do not use when: there is no meaningful diff against the intended base or validation/scope evidence is missing.


Use this after changes already exist. Verify base freshness, dirty scope, meaningful diff against base, validation evidence, commit message What/Why, push, and draft PR creation. Never merge or enable auto-merge.

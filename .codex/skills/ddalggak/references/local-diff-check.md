# Local Diff Check Reference
Use when: `check` needs a read-only local diff review without GitHub comments, branch creation, source edits, or PR state changes.
Required by: `check`; local pre-commit/pre-ship inspection.
Side effects: none
Do not use when: the task requires GitHub PR review comments, implementation fixes, or shipping changes.


One-shot read-only review of local diff. Do not edit files or post GitHub comments. Report severity counts and concrete suggestions.

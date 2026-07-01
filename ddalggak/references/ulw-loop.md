# ULW Loop
Use when: a user asks ddalggak to implement a bounded goal through an evidence-led loop.
Required by: `ulw-loop`
Side effects: source edits inside the stated goal scope only; no GitHub writes.
Do not use when: the user only wants a plan or research; use `ulw-plan` or `ulw-research`.

`ulw-loop` executes the smallest faithful implementation loop on top of ddalggak's existing evidence and simplicity gates.

## Procedure

1. Define observable success criteria and non-goals.
2. Confirm the failing-first proof or cite why the provided RED evidence already covers it.
3. Make the smallest source edit that satisfies the criteria.
4. Run targeted checks and one real-surface proof for the changed behavior.
5. Self-review for Critical or High issues, fix accepted blockers, and rerun the affected checks.
6. Report evidence, cleanup, unresolved blockers, and `ULW_LOOP_DONE`.

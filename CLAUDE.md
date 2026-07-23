# Claude workflow notes

## Merging

Auto-merge your own pull requests once pushed. Don't wait for the user to click
merge, and don't ask. Use `merge_pull_request` right after `create_pull_request`,
default merge method (merge commit is fine — matches PR #1 and #2's history).

Only pause for the user when:
- CI is red on the PR (fix first, then merge)
- The change is genuinely risky (irreversible data change, secrets, prod
  migration) — not just "large refactor"

Rationale: this is a solo project on a design branch; the user grants blanket
merge authority to keep the loop tight.

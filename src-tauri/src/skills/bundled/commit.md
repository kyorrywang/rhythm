# commit

Create a well-formed git commit.

## When to use

When the user asks you to commit changes or create a commit message.

## Workflow

1. Run `git status` and `git diff` to understand all changes.
2. Categorise changes: feature, fix, refactor, docs, test, chore, etc.
3. Draft a commit message:
   - First line: imperative mood, max 72 chars, describes *why* (not what).
   - Body (if needed): explain context, trade-offs, or breaking changes.
4. Stage only relevant files: prefer `git add <file>` over `git add -A`.
5. Create the commit.

## Rules

- Never stage `.env` files, credentials, or large binaries.
- Do not use `--no-verify` unless explicitly requested.
- Do not amend already-pushed commits.
- If a pre-commit hook fails, fix the issue and create a new commit.

# review

Perform a thorough code review and report findings.

## When to use

When the user wants feedback on changed code, a pull request diff, or a specific file.

## Workflow

1. Read all changed files or the diff thoroughly.
2. Check for: bugs (logic errors, off-by-one, null dereferences), security issues (injection, hardcoded secrets), performance problems, missing tests, and style inconsistencies.
3. Provide specific, actionable feedback with file:line references.
4. Prioritise findings: critical > major > minor > nit.
5. Also acknowledge good patterns.

## Rules

- Be specific: "Line 42 panics if user is null" not "check for nulls".
- Suggest fixes, not just problems.
- Don't flag formatting issues if a linter is configured.

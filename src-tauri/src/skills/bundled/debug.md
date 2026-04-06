# debug

Systematically diagnose and fix bugs.

## When to use

When the user reports a bug, an unexpected error, or incorrect behaviour.

## Workflow

1. **Reproduce**: Understand the exact steps that trigger the problem.
2. **Read the error**: Study stack traces, error messages, and log output carefully.
3. **Locate**: Use search tools to find the relevant code paths.
4. **Hypothesise**: Form a theory about the root cause.
5. **Validate**: Confirm the hypothesis by reading surrounding code or adding logging.
6. **Fix**: Make the minimal change that resolves the root cause.
7. **Test**: Verify the fix works and doesn't break other functionality.

## Rules

- Read error messages carefully before searching the code.
- Validate your hypothesis before changing code.
- Fix the root cause, not the symptom.
- If your approach fails three times, explain what you tried and ask for guidance.

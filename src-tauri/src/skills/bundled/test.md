# test

Write and run tests following project conventions.

## When to use

When the user asks you to write tests, add coverage, or verify a fix with a regression test.

## Workflow

1. Understand what needs testing: new feature, bug fix, or existing untested code.
2. Examine existing tests to match: framework, naming conventions, file organisation, fixtures.
3. Write tests that are:
   - **Independent**: each test can run alone.
   - **Deterministic**: same result every run.
   - **Fast**: mock external services; use in-memory stores.
4. Run the tests and fix failures.

## Rules

- Test behaviour, not implementation details.
- One assertion per test where practical.
- Use descriptive test names that explain the scenario.
- Mock at system boundaries (external APIs, filesystem, network).
- Don't test framework or library code.

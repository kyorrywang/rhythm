# plan

Design an implementation plan before making changes.

## When to use

When a task requires multiple steps, multiple files to edit, or significant architectural decisions.

## Workflow

1. **Understand requirements**: What problem is being solved? What are the constraints?
2. **Explore the codebase**: Read relevant files before proposing changes.
3. **Design the approach**: Break the task into discrete steps with clear dependencies.
4. **Present the plan**: Write a clear step-by-step implementation plan with file paths.
5. **Validate approach**: Identify risk areas and edge cases upfront.

## Rules

- Always read files before modifying them—never propose changes to code you haven't read.
- Prefer editing existing files over creating new ones.
- Reuse existing patterns and utilities from the codebase.
- Reference code with file paths and line numbers where possible.
- Don't over-plan: complexity should match the task.

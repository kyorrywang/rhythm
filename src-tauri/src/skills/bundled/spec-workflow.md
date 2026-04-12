# spec-workflow

Guide for operating the Spec document-driven change workflow.

## What is a Spec

A Spec is a file-based change unit stored under `.spec/changes/<slug>/` in the workspace:

```
.spec/changes/<slug>/
  proposal.md   ← change definition: title, goal, scope, constraints, success criteria
  tasks.md      ← executable task list consumed by the Spec Agent
  state.json    ← machine-readable status (draft | active | done) and progress counters
  artifacts/    ← any files produced during execution
```

## Lifecycle

```
[user idea] → draft → (user confirms) → active (agent executes) → done
```

1. **draft** — Spec exists on disk but has not been started. The Agent may still revise `proposal.md`.
2. **active** — Spec Agent is executing tasks. `tasks.md` is updated in-place as tasks complete.
3. **done** — All checkboxes in `tasks.md` are checked.

## When to create a Spec

Create a Spec whenever the user wants to:
- Implement a non-trivial feature (multiple files, multiple steps)
- Refactor a module or system
- Execute a planned migration
- Carry out any multi-step change that benefits from a written plan and task list

Do **not** create a Spec for simple one-liner fixes or pure chat questions.

## Workflow (Spec chat agent)

1. **Understand the request** — clarify intent if needed using follow-up questions.
2. **Read context** — use `list_dir` and `read` to understand relevant code. Do not write code.
3. **Call `create_spec`** — pass `title`, `goal`, and optionally `overview`.
   - The backend creates `proposal.md` and `tasks.md` on disk.
   - The frontend opens the Spec workbench so the user can review and edit the documents.
4. **Wait for user confirmation** — do not call `start_spec` until the user says something like
   "start", "run", "ok 启动", "开始执行", or equivalent.
5. **Call `start_spec`** — pass the `slug` returned by `create_spec`.
   - This transitions the spec state from `draft` to `active` in the frontend.
   - The frontend launches the `spec-agent` subagent with the spec content as its prompt.

## Hard rules (Spec chat agent)

- Only use: `list_dir`, `read`, `skill`, `create_spec`, `start_spec`.
- Never write or edit files directly in the spec chat session.
- Never call `start_spec` without explicit user confirmation.
- Do not fill in `tasks.md` yourself — the Spec Agent does that during execution.
- If the user asks to change the plan, explain what they should edit in `proposal.md` directly,
  or call `create_spec` again with revised inputs to replace the draft.

## Workflow (Spec agent — execution)

The Spec Agent receives `proposal.md` and `tasks.md` as its task prompt.

1. Read `proposal.md` to understand the full scope and constraints.
2. Read `tasks.md` to find unchecked tasks (`- [ ]`).
3. Execute each task in order:
   - Make the code change.
   - Immediately update `tasks.md`: replace `- [ ] Task N` with `- [x] Task N`.
4. If a task requires human input, insert a note in `tasks.md`:
   ```
   > ⚠️ Blocked: <reason>
   ```
   Then stop and report to the user.
5. After all tasks are done, write a short summary and stop.

Artifacts (generated files) go in `.spec/changes/<slug>/artifacts/`.

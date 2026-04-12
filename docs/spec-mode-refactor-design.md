# Spec Mode Refactor Design

## Status

- Draft
- Last updated: 2026-04-12
- Scope: Promote orchestrator into a core `spec` mode alongside `chat` and `coordinate`

## Purpose

This document defines the end-to-end refactor that turns the current orchestrator implementation into a first-class core product capability named `spec`.

It is not a brainstorming note. It is the working design that should guide the entire refactor, including:

- product boundaries
- architecture
- storage model
- filesystem contract
- agent roles
- runtime behavior
- migration plan
- cleanup plan
- acceptance criteria

The goal is to replace the current plugin-shaped orchestrator with a spec-centered system that is easier to understand, easier to recover, and easier for users to trust.

## Product Positioning

The product will have three core modes:

- `chat`
  - user-led, freeform, conversational, exploratory
- `coordinate`
  - coordination-led, short-horizon, constrained delegation and synthesis
- `spec`
  - plan-led, change-centered, stateful execution with durable artifacts and review

These three modes must not collapse into each other.

### Chat

`chat` is the most flexible mode. The user leads. The system helps think, inspect, edit, run commands, and iterate. It is optimized for freedom and responsiveness.

### Coordinate

`coordinate` is a narrow orchestration mode. It coordinates bounded work, but it is intentionally restricted. It should not become a long-running plan management system.

### Spec

`spec` is the mode for work that should be treated as a durable change. It is optimized for:

- defining a change clearly
- planning before execution
- decomposing work into explicit tasks
- running tasks with visible progress
- reviewing outputs
- recovering after interruption
- preserving a human-readable record of what happened

`spec` is the mode users choose for:

- new features
- bug fixes
- refactors
- larger content creation efforts
- any work that benefits from explicit planning and a persistent audit trail

## Why This Refactor Exists

The current orchestrator shape has several structural problems:

- it lives as a plugin even though it behaves like a core workflow engine
- its product identity is blurry
- too much behavior is encoded inside runtime logic and prompt builders
- the coordinator has historically drifted toward acting like an executor
- runs are harder to inspect than they should be
- the user-facing representation is weaker than plain markdown artifacts

The refactor solves these by making `spec` the canonical abstraction.

## Core Product Principles

### 1. The Primary Object Is a Change

The user should think in terms of a change, not a session.

Examples:

- "add login rate limiting"
- "fix intermittent sync bug"
- "refactor plugin loading"
- "write chapter outline"

Each change becomes a durable `spec` item with its own plan, tasks, artifacts, timeline, and runs.

### 2. Markdown Is a First-Class Interface

The human-friendly source of trust is markdown, not an opaque activity feed.

Every spec change should always have markdown documents that answer:

- what is this change
- why are we doing it
- what is the plan
- what are the tasks
- what is currently running
- what is blocked
- what has been reviewed
- what is complete

Markdown is not an optional export. It is part of the product.

### 3. Machine Truth Comes From Structured State

Markdown is for humans. Structured state is for the system.

The system source of truth must be a machine-readable state file, with markdown derived from it or synchronized with it under explicit rules.

We will use:

- `state.json` as machine truth
- markdown files as human presentation and editable planning surfaces
- `timeline.jsonl` as append-only event history

### 4. The Coordinator Never Executes Deliverables

The coordinator in `spec` exists only to choose the next legal action and return a structured decision.

It must never:

- write output artifacts
- open task dock
- create dynamic subagents ad hoc
- perform shell/write/edit work
- bypass the task graph

Its job is strictly:

- inspect state
- evaluate legal next actions
- choose one
- return a structured orchestration decision

### 5. Recovery Must Be Strong

`spec` is a long-lived workflow system. Recovery is part of the core design, not a later add-on.

Recovery must work across:

- app restart
- process crash
- interrupted sessions
- paused review gates
- human intervention points
- partially completed execution

## User Experience Goals

The user experience for `spec` should feel like this:

1. User describes a change.
2. System creates a spec directory and a readable `change.md`.
3. System derives a plan and a task list.
4. The user can inspect and edit these files directly.
5. Execution proceeds task by task.
6. Progress is visible in `tasks.md` and timeline artifacts.
7. Review outcomes and rework remain visible and durable.
8. The entire change can be resumed later without losing context.

This should feel closer to a living design-and-execution record than to a hidden orchestration loop.

## Filesystem Contract

Each spec change lives in a dedicated directory.

Proposed root:

```text
.spec/
  changes/
    <change-slug>/
      change.md
      plan.md
      tasks.md
      state.json
      timeline.jsonl
      reviews/
      artifacts/
      runs/
```

### Required Files

#### `change.md`

Purpose:

- define the change at a human-readable level

Suggested sections:

- title
- status
- goal
- background
- scope
- non-goals
- constraints
- risks
- success criteria
- affected areas

#### `plan.md`

Purpose:

- explain the intended approach and stage breakdown

Suggested sections:

- summary
- chosen approach
- alternatives considered
- stage plan
- checkpoints
- review strategy
- open questions

#### `tasks.md`

Purpose:

- provide the most direct, readable progress view

Suggested sections:

- task checklist
- current task
- blocked items
- review findings
- recent updates

This file should always answer "where are we now?" at a glance.

#### `state.json`

Purpose:

- act as the machine-readable source of truth

It must include:

- change metadata
- plan metadata
- task graph
- run state
- current task
- review state
- artifact metadata
- recovery metadata
- lease metadata

#### `timeline.jsonl`

Purpose:

- preserve an append-only event stream for recovery, debugging, and auditability

Examples:

- change created
- plan generated
- task dispatched
- task started
- artifact produced
- review accepted
- review requested changes
- run paused
- run resumed

### Optional Directories

#### `artifacts/`

Stores durable outputs generated during the change lifecycle.

Examples:

- implementation summaries
- design notes
- review snapshots
- generated drafts
- diff summaries

#### `reviews/`

Stores review outputs and review snapshots.

Examples:

- `review-001.md`
- `review-002.md`
- structured review payloads

#### `runs/`

Stores per-run persisted data when a single change has multiple execution attempts.

## Data Model

The current orchestrator model should be replaced or evolved into the following core entities.

### `SpecChange`

Represents the durable change.

Suggested fields:

- `id`
- `slug`
- `title`
- `status`
- `goal`
- `background`
- `scope`
- `nonGoals`
- `constraints`
- `risks`
- `successCriteria`
- `createdAt`
- `updatedAt`

### `SpecPlan`

Represents the current plan for the change.

Suggested fields:

- `changeId`
- `version`
- `summary`
- `approach`
- `stages`
- `checkpoints`
- `reviewPolicy`
- `openQuestions`
- `createdAt`
- `updatedAt`

### `SpecTask`

Represents an actionable unit in the change.

Suggested fields:

- `id`
- `changeId`
- `planStageId`
- `title`
- `kind`
- `status`
- `dependsOn`
- `assignedAgent`
- `attemptCount`
- `acceptanceCriteria`
- `targetPaths`
- `reviewRequired`
- `createdAt`
- `updatedAt`

### `SpecArtifact`

Represents a durable work product.

Suggested fields:

- `id`
- `changeId`
- `taskId`
- `kind`
- `status`
- `filePaths`
- `summary`
- `version`
- `createdAt`
- `updatedAt`

### `SpecReview`

Represents a review decision and its reasoning.

Suggested fields:

- `id`
- `changeId`
- `taskId`
- `status`
- `summary`
- `findings`
- `decision`
- `requiresRework`
- `createdAt`

### `SpecRun`

Represents one execution instance of a change.

Suggested fields:

- `id`
- `changeId`
- `status`
- `currentTaskId`
- `activeTaskCount`
- `failureState`
- `maintenanceLease`
- `lastWakeAt`
- `lastWakeReason`
- `createdAt`
- `updatedAt`

## State Model

`spec` should explicitly model long-running state.

Suggested top-level change states:

- `draft`
- `planned`
- `ready`
- `running`
- `waiting_review`
- `waiting_human`
- `paused`
- `completed`
- `cancelled`
- `failed`
- `archived`

Suggested task states:

- `ready`
- `running`
- `waiting_review`
- `waiting_human`
- `blocked`
- `paused`
- `completed`
- `failed`
- `cancelled`

### Required Invariants

- only one active coordinator decision loop per run
- the coordinator may choose actions but may not execute deliverables
- all task execution must occur through task-bound execution agents
- all review decisions must be persisted before they affect task graph state
- all human gates must be represented in state, not only in prompt text
- recovery must be able to reconstruct the next legal action from persisted state alone

## Agent Model

`spec` requires clearly separated agent roles.

### `spec-orchestrator`

Purpose:

- select the next legal task-graph action

Allowed behavior:

- inspect run snapshot
- inspect task graph summary
- inspect review state summary
- choose one legal decision
- return one structured decision payload

Forbidden behavior:

- writing deliverables
- editing repository files
- shell execution
- dynamic subagent spawning
- ad hoc workflow construction outside the task graph

Required output:

- exactly one structured orchestration decision

### `spec-planner`

Purpose:

- create and revise `change.md`, `plan.md`, and `tasks.md`

Allowed behavior:

- analyze requested change
- propose plan structure
- revise plan after user edits or new findings
- update planning documents

Forbidden behavior:

- directly declaring implementation complete
- bypassing execution and review workflow

### `spec-executor`

Purpose:

- complete one assigned task

Allowed behavior:

- inspect relevant files
- modify allowed target files
- run approved commands
- generate assigned artifacts

Forbidden behavior:

- mutating the task graph
- self-approving completion
- overriding review outcomes

### `spec-reviewer`

Purpose:

- evaluate a task result and return a review decision

Allowed behavior:

- inspect produced artifacts
- inspect repository changes
- return structured findings and decision

Forbidden behavior:

- editing implementation files as part of review
- silently converting review into execution

## Prompt Contract

Prompts in `spec` should be short, imperative, and role-specific.

They must not read like long manuals.

Each agent prompt should follow this shape:

1. identity
2. single job
3. forbidden actions
4. required output
5. minimal valid example

### Coordinator Prompt Rule

The `spec-orchestrator` prompt must make the contract impossible to miss:

- you are a coordinator
- do not do the work
- do not use execution tools
- return one decision object only

### Planner Prompt Rule

The `spec-planner` prompt must focus on clarity, scope, sequencing, and explicit tasks.

### Executor Prompt Rule

The `spec-executor` prompt must focus on one assignment at a time, real repository changes, and concise completion summaries.

### Reviewer Prompt Rule

The `spec-reviewer` prompt must focus on acceptance, rework, and structured findings.

## Configuration Model

All `spec` agents must be configured through the unified agent configuration system.

They must not depend on ad hoc prompt and tool definitions assembled inside runtime code.

Suggested profile ids:

- `spec-orchestrator`
- `spec-planner`
- `spec-executor`
- `spec-reviewer`

Suggested config location:

```text
~/.rhythm/agents/spec/
```

Each profile should define:

- identity
- model
- prompt refs
- permission mode
- allowed tools
- disallowed tools
- max turns
- relevant policies

## Runtime Responsibilities

The `spec` runtime should be narrow.

It should:

- load spec state
- compute legal next actions
- launch the correct agent profile
- validate returned payloads
- apply task-graph mutations
- update markdown files
- persist events
- handle recovery and watchdog behavior

It should not:

- invent agent behavior outside config
- embed large instruction manuals inside runtime code
- let the coordinator act as a worker
- treat session transcripts as source of truth

## Markdown Synchronization Model

Markdown and structured state must stay aligned.

Rules:

- `state.json` is machine truth
- markdown is regenerated or patched from state transitions
- user edits to markdown should be supported only where explicitly allowed
- allowed user edits must be parsed back into structured changes intentionally

### Editable vs Derived

Suggested editable files:

- `change.md`
- `plan.md`
- parts of `tasks.md`

Suggested derived files:

- status sections in `tasks.md`
- current execution snapshot
- recent updates
- timeline summaries

We should define clear markers or sections that are system-managed versus human-managed.

## Review and Rework Model

Review is a core part of `spec`, not a side feature.

Rules:

- every review decision must be persisted
- accepted artifacts become part of the durable record
- rejected work creates explicit rework tasks
- rework stays attached to the same change
- markdown must reflect review outcomes and remaining tasks

## Recovery and Serialization

The runtime must enforce durable serialization for maintenance work.

Requirements:

- persisted maintenance lease
- one active maintenance owner per run
- recovery, watchdog, wake, resume, and retry paths all honor the same lease
- same-process reentrancy is explicitly supported where needed
- no run may have overlapping maintenance loops from multiple instances

This is mandatory for `spec` because it is a long-lived workflow engine.

## Visibility Model

The system must make execution visible without requiring the user to inspect internal session logs.

The primary visibility surfaces should be:

- `tasks.md`
- `change.md`
- `plan.md`
- review markdown
- timeline

The user should be able to answer these questions quickly:

- what is this change
- what is being worked on now
- what is done
- what is blocked
- what needs review
- what happened recently

## Integration Into Core

`spec` must move out of plugin status.

It should become a core mode with:

- first-class mode registration
- first-class UI navigation
- first-class storage root
- first-class agent profile resolution
- first-class recovery lifecycle

This means we will migrate code from plugin paths into core paths.

## Proposed Code Reorganization

Suggested destination layout:

```text
src/spec/
  types.ts
  runtime.ts
  storage.ts
  contracts.ts
  markdown.ts
  stateSync.ts
  changeFs.ts
  agents.ts
```

### Responsibilities

#### `types.ts`

- core `spec` entities and state types

#### `runtime.ts`

- orchestration runtime
- recovery
- watchdog
- dispatch

#### `storage.ts`

- persisted state load/save helpers

#### `contracts.ts`

- structured inputs and outputs for agents

#### `markdown.ts`

- generation and patching of markdown files

#### `stateSync.ts`

- synchronization between state and markdown

#### `changeFs.ts`

- filesystem layout and path helpers

#### `agents.ts`

- profile id mapping
- launch helpers

## Migration Strategy

This refactor should happen in phases.

### Phase 1: Establish Core `spec` Mode

Goals:

- create `spec` as a first-class mode
- define core types
- define filesystem contract
- mirror current orchestrator behavior under the new domain model

Deliverables:

- `src/spec/*`
- mode registration
- basic change directory creation
- migrated runtime skeleton

### Phase 2: Move Runtime and Storage

Goals:

- migrate orchestrator runtime logic into `spec`
- migrate persisted state handling
- remove plugin-only ownership of orchestration state

Deliverables:

- migrated runtime
- migrated storage
- migrated leases
- maintained recovery behavior

### Phase 3: Markdown-Driven Visibility

Goals:

- generate `change.md`, `plan.md`, and `tasks.md`
- update these files continuously during execution
- make markdown the default status surface

Deliverables:

- markdown generators
- state-to-markdown sync
- review/rework markdown output

### Phase 4: Agent Contract Cleanup

Goals:

- rename orchestrator roles to `spec-*`
- move all prompts and permissions into config
- remove runtime-owned role behavior

Deliverables:

- `~/.rhythm/agents/spec/*`
- short imperative prompts
- strict role boundaries

### Phase 5: Remove Legacy Plugin Paths

Goals:

- remove obsolete orchestrator plugin code
- remove compatibility shims that hide old state or prompt behavior
- clean imports, tests, and UI references

Deliverables:

- no critical runtime dependence on `plugins/orchestrator`
- legacy compatibility code removed
- tests updated to core `spec`

## Cleanup Policy

This refactor is an opportunity to simplify, not preserve every old shape forever.

Rules:

- do not carry forward compatibility code unless it is required for active user data migration
- do not preserve plugin-specific abstractions once `spec` replaces them
- do not leave duplicate runtime truths in both plugin and core paths
- do not keep old prompt builders after config-driven prompts exist

If migration support is necessary, it should be:

- explicit
- time-bounded
- isolated
- removable

## Testing Strategy

The refactor must be protected by tests across four layers.

### 1. Unit Tests

Cover:

- state transitions
- legal action computation
- markdown generation
- contract parsing
- lease behavior

### 2. Runtime Tests

Cover:

- change creation
- plan generation
- task dispatch
- review and rework
- pause and resume
- recovery after interruption
- nested maintenance paths

### 3. Integration Tests

Cover:

- core mode registration
- profile resolution
- filesystem outputs
- state and markdown synchronization

### 4. Regression Tests

Cover:

- coordinator never executing work
- review gates
- human gates
- recovery serialization
- stale prompt or stale bundle detection where applicable

## Acceptance Criteria

The refactor is complete only when all of the following are true:

- `spec` exists as a core mode
- a user can create a change and receive `change.md`, `plan.md`, and `tasks.md`
- `tasks.md` clearly shows real execution progress
- the coordinator can only return orchestration decisions
- execution is performed only by execution agents
- review is explicit and durable
- recovery works from persisted state after restart
- maintenance serialization is durable and complete
- agent behavior is driven by config, not hidden runtime prompt assembly
- old orchestrator plugin paths are no longer required for normal operation

## Non-Goals

This refactor does not aim to:

- make `chat` and `coordinate` disappear
- convert every workflow into `spec`
- support unrestricted agent improvisation inside `spec`
- prioritize backward compatibility over architectural clarity

## Open Decisions

These decisions must be settled during implementation, but they do not block the overall direction:

- exact location and naming of spec change directories
- exact markdown sync mechanism for human-editable sections
- whether planner updates are fully automatic or partially user-triggered
- whether each task gets its own run directory or whether run grouping stays flatter
- how much of the timeline is shown directly in markdown vs dedicated UI

## Final Guiding Statement

This refactor is not about embedding the orchestrator deeper into the app.

It is about changing the core unit of work from an opaque agent session into a durable, reviewable, recoverable spec change.

The finished system should feel like:

- a change has a home
- the plan is readable
- the tasks are visible
- progress is obvious
- review is durable
- recovery is reliable
- the coordinator is narrow and trustworthy

That is the bar for `spec`.

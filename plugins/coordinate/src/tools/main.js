import fs from 'node:fs/promises';
import path from 'node:path';

const handlers = {
  plan_tasks,
  complete_task,
  get_plan_status,
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const handlerName = process.argv[2];
  const handler = handlers[handlerName];
  if (!handler) {
    throw new Error(`Unknown coordinate handler '${handlerName || ''}'`);
  }
  const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
  const result = await handler(call.input || {}, call);
  process.stdout.write(JSON.stringify({ ok: true, data: result }));
}

function workspaceCwd(call) {
  const cwd = call?.context?.cwd;
  if (!cwd) throw new Error('Missing workspace cwd.');
  return path.resolve(cwd);
}

async function plan_tasks(input, call) {
  const { workspace, tasks } = input;

  if (!workspace || workspace.includes('..') || workspace.includes('/') || workspace.includes('\\')) {
    throw new Error('Workspace name must be a non-empty simple name with no path separators.');
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('Task list must not be empty.');
  }

  const cwd = workspaceCwd(call);
  const tasksDir = path.join(cwd, '.rhythm', 'tasks');
  const workspacePath = path.join(tasksDir, workspace);

  try {
    await fs.mkdir(workspacePath, { recursive: true });
  } catch (e) {
    if (e.code === 'EEXIST') {
      throw new Error(`Workspace '${workspace}' already exists at '${workspacePath}'. Use a unique workspace name or remove the existing directory first.`);
    }
    throw e;
  }

  const seenIds = new Set();
  for (const task of tasks) {
    if (!task.id) throw new Error("Every task must have a non-empty id.");
    if (seenIds.has(task.id)) throw new Error(`Duplicate task id: '${task.id}'.`);
    seenIds.add(task.id);

    if (!task.output_file || task.output_file.includes('..') || task.output_file.includes('/') || task.output_file.includes('\\')) {
      throw new Error(`Task '${task.id}': output_file must be a simple filename with no path separators.`);
    }
  }

  for (const task of tasks) {
    if (task.depends_on) {
      for (const dep of task.depends_on) {
        if (dep === task.id) throw new Error(`Task '${task.id}' cannot depend on itself.`);
        if (!seenIds.has(dep)) throw new Error(`Task '${task.id}' depends on '${dep}', which is not declared in this plan.`);
      }
    }
  }

  const cycle = detectCycle(tasks);
  if (cycle) {
    throw new Error(`Circular dependency detected: ${cycle.join(' → ')}`);
  }

  const createdAt = new Date().toISOString();
  const manifestTasks = [];

  for (const task of tasks) {
    const outputPath = path.join(workspacePath, task.output_file);
    await fs.writeFile(outputPath, '');
    manifestTasks.push({
      id: task.id,
      description: task.description,
      status: 'pending',
      output_file: task.output_file,
      output_path: outputPath,
      depends_on: task.depends_on || [],
    });
  }

  const manifest = {
    workspace,
    workspace_path: workspacePath,
    created_at: createdAt,
    tasks: manifestTasks,
  };

  await fs.writeFile(path.join(workspacePath, 'plan.json'), JSON.stringify(manifest, null, 2));

  const readyTasks = manifestTasks
    .filter(t => t.status === 'pending' && (t.depends_on.length === 0 || t.depends_on.every(dep => manifestTasks.find(t2 => t2.id === dep)?.status === 'done')))
    .map(t => ({ id: t.id, description: t.description, output_path: t.output_path }));

  return {
    workspace_path: workspacePath,
    plan_file: path.join(workspacePath, 'plan.json'),
    total_tasks: manifestTasks.length,
    ready_tasks: readyTasks,
    message: "Plan accepted and persisted to plan.json. Spawn subagents for each ready task, providing the exact output_path. After each subagent completes, call coordinate.complete_task to advance the plan and receive the next wave.",
  };
}

function detectCycle(tasks) {
  const index = new Map(tasks.map(t => [t.id, t]));
  const state = new Map();
  const path = [];

  function dfs(id) {
    const s = state.get(id);
    if (s === 2) return false;
    if (s === 1) return true;
    state.set(id, 1);
    path.push(id);
    const task = index.get(id);
    if (task?.depends_on) {
      for (const dep of task.depends_on) {
        if (dfs(dep)) return true;
      }
    }
    state.set(id, 2);
    path.pop();
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) {
      path.push(path[0]);
      return path;
    }
  }
  return null;
}

async function complete_task(input, call) {
  const { workspace_path, task_id, status = 'done' } = input;

  if (!workspace_path) throw new Error("'workspace_path' is required.");
  if (!task_id) throw new Error("'task_id' is required.");

  const newStatus = status.toLowerCase();
  if (newStatus !== 'done' && newStatus !== 'failed') {
    throw new Error(`Invalid status '${status}'. Must be 'done' or 'failed'.`);
  }

  const manifestPath = path.join(workspace_path, 'plan.json');
  let manifest;
  try {
    const content = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (e) {
    throw new Error(`Cannot read plan.json at '${manifestPath}': ${e.message}`);
  }

  const taskEntry = manifest.tasks.find(t => t.id === task_id);
  if (!taskEntry) {
    throw new Error(`Task '${task_id}' not found in plan at '${workspace_path}'.`);
  }

  if (taskEntry.status !== 'pending') {
    throw new Error(`Task '${task_id}' is already '${taskEntry.status}' and cannot be updated again.`);
  }

  taskEntry.status = newStatus;

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const pending = manifest.tasks.filter(t => t.status === 'pending').length;
  const done = manifest.tasks.filter(t => t.status === 'done').length;
  const failed = manifest.tasks.filter(t => t.status === 'failed').length;
  const total = manifest.tasks.length;
  const allDone = done === total;

  const readyTasks = manifest.tasks
    .filter(t => t.status === 'pending' && (t.depends_on.length === 0 || t.depends_on.every(dep => manifest.tasks.find(t2 => t2.id === dep)?.status === 'done')))
    .map(t => ({ id: t.id, description: t.description, output_path: t.output_path }));

  const isBlocked = failed > 0 && pending > 0 && readyTasks.length === 0;

  let message;
  if (allDone) {
    message = "All tasks complete. Proceed to synthesis.";
  } else if (isBlocked) {
    message = `Plan is blocked: ${failed} task(s) failed and ${pending} pending task(s) cannot proceed. Review failed tasks and decide whether to retry or synthesise partial results.`;
  } else {
    message = `Task '${task_id}' marked ${newStatus}. ${readyTasks.length} ready, ${done} done, ${failed} failed of ${total} total.`;
  }

  return {
    task_id,
    updated_status: newStatus,
    ready_tasks: readyTasks,
    progress: { total, done, failed, pending },
    all_complete: allDone,
    is_blocked: isBlocked,
    message,
  };
}

async function get_plan_status(input, call) {
  const { workspace_path } = input;

  if (!workspace_path) throw new Error("'workspace_path' is required.");

  const manifestPath = path.join(workspace_path, 'plan.json');
  let manifest;
  try {
    const content = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (e) {
    throw new Error(`Cannot read plan.json at '${manifestPath}': ${e.message}`);
  }

  const pending = manifest.tasks.filter(t => t.status === 'pending').length;
  const done = manifest.tasks.filter(t => t.status === 'done').length;
  const failed = manifest.tasks.filter(t => t.status === 'failed').length;
  const total = manifest.tasks.length;

  const readyTasks = manifest.tasks
    .filter(t => t.status === 'pending' && (t.depends_on.length === 0 || t.depends_on.every(dep => manifest.tasks.find(t2 => t2.id === dep)?.status === 'done')))
    .map(t => ({ id: t.id, description: t.description, output_path: t.output_path }));

  const allTasks = manifest.tasks.map(t => ({
    id: t.id,
    description: t.description,
    status: t.status,
    output_path: t.output_path,
    depends_on: t.depends_on,
  }));

  const isBlocked = failed > 0 && pending > 0 && readyTasks.length === 0;

  return {
    workspace: manifest.workspace,
    workspace_path: manifest.workspace_path,
    created_at: manifest.created_at,
    progress: { total, done, failed, pending },
    all_complete: done === total,
    is_blocked: isBlocked,
    ready_tasks: readyTasks,
    all_tasks: allTasks,
  };
}

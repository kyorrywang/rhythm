const fs = require('node:fs/promises');
const path = require('node:path');

const handlers = {
  createTemplate,
  createSampleNovelTemplate,
  createSampleSoftwareTemplate,
  updateTemplate,
  duplicateTemplate,
  deleteTemplate,
  matchTemplates,
  createRun,
  pauseRun,
  resumeRun,
  cancelRun,
  getRun,
  listTemplates,
  listRuns,
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const handlerName = process.argv[2];
  const handler = handlers[handlerName];
  if (!handler) {
    throw new Error(`Unknown orchestrator handler '${handlerName || ''}'`);
  }
  const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
  const result = await handler(call.input || {}, call);
  process.stdout.write(JSON.stringify({ ok: true, data: result }));
}

async function createTemplate(input, call) {
  const template = createDefaultTemplate(input.name || 'Untitled Template');
  const templates = await readJson(call, 'templates.json', []);
  await writeJson(call, 'templates.json', [template, ...templates]);
  return template;
}

async function createSampleNovelTemplate(input, call) {
  const template = createNovelTemplate(input.name || 'Novel Writing Basic');
  const templates = await readJson(call, 'templates.json', []);
  await writeJson(call, 'templates.json', [template, ...templates]);
  return template;
}

async function createSampleSoftwareTemplate(input, call) {
  const template = createSoftwareTemplate(input.name || 'Software Delivery Basic');
  const templates = await readJson(call, 'templates.json', []);
  await writeJson(call, 'templates.json', [template, ...templates]);
  return template;
}

async function updateTemplate(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  if (!input.patch || typeof input.patch !== 'object') throw new Error("'patch' is required");
  const templates = await readJson(call, 'templates.json', []);
  const index = templates.findIndex((item) => item.id === input.templateId);
  if (index < 0) throw new Error(`Template not found: ${input.templateId}`);
  const current = templates[index];
  const nextTemplate = {
    ...current,
    ...input.patch,
    updatedAt: Date.now(),
  };
  const next = templates.slice();
  next[index] = nextTemplate;
  await writeJson(call, 'templates.json', next);
  return nextTemplate;
}

async function duplicateTemplate(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  const templates = await readJson(call, 'templates.json', []);
  const template = templates.find((item) => item.id === input.templateId);
  if (!template) throw new Error(`Template not found: ${input.templateId}`);
  const duplicated = cloneTemplate(template, input.name);
  await writeJson(call, 'templates.json', [duplicated, ...templates]);
  return duplicated;
}

async function deleteTemplate(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  const templates = await readJson(call, 'templates.json', []);
  const next = templates.filter((item) => item.id !== input.templateId);
  await writeJson(call, 'templates.json', next);
  return true;
}

async function matchTemplates(input, call) {
  if (!input.goal) throw new Error("'goal' is required");
  const templates = await readJson(call, 'templates.json', []);
  return matchTemplatesByGoal(templates, input);
}

async function createRun(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  if (!input.goal) throw new Error("'goal' is required");

  const templates = await readJson(call, 'templates.json', []);
  const template = templates.find((item) => item.id === input.templateId);
  if (!template) throw new Error(`Template not found: ${input.templateId}`);

  const now = Date.now();
  const firstStage = template.stageRows?.[0]?.stages?.[0];
  const firstAgent = firstStage?.agentRows?.[0]?.agents?.[0];

  const run = {
    id: createId('run'),
    templateId: template.id,
    templateName: template.name,
    goal: input.goal,
    status: 'running',
    source: input.source || 'chat',
    activeTaskCount: firstAgent ? 1 : 0,
    currentStageId: firstStage?.id,
    currentStageName: firstStage?.name,
    currentAgentId: firstAgent?.id,
    currentAgentName: firstAgent?.name,
    lastWakeAt: now,
    lastDecisionAt: now,
    lastDecisionSummary: firstAgent
      ? `Dispatch ${firstAgent.name} in ${firstStage?.name || 'the first stage'}`
      : 'No executable stage found. Run completed.',
    createdAt: now,
    updatedAt: now,
  };

  const events = await readJson(call, 'events.json', []);
  const tasks = await readJson(call, 'tasks.json', []);
  const runs = await readJson(call, 'runs.json', []);

  const nextEvents = [
    {
      id: createId('evt'),
      runId: run.id,
      type: 'task.created',
      title: 'Agent task created',
      detail: firstAgent ? `${firstAgent.name} is ready to execute.` : 'No agent found.',
      createdAt: now,
    },
    {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent made a decision',
      detail: run.lastDecisionSummary,
      createdAt: now,
    },
    {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.wake',
      title: 'Main agent woke up',
      detail: 'Reason: start',
      createdAt: now,
    },
    {
      id: createId('evt'),
      runId: run.id,
      type: 'run.started',
      title: 'Run started',
      detail: `Main agent entered ${run.currentStageName || 'the first stage'}.`,
      createdAt: now,
    },
    {
      id: createId('evt'),
      runId: run.id,
      type: 'run.created',
      title: 'Run created',
      detail: `Template: ${run.templateName}`,
      createdAt: now,
    },
    ...events,
  ];

  const nextTasks = firstAgent ? [
    {
      id: createId('task'),
      runId: run.id,
      stageId: firstStage?.id,
      stageName: firstStage?.name,
      agentId: firstAgent?.id,
      agentName: firstAgent?.name,
      title: `${firstAgent.name} task`,
      status: 'pending',
      summary: firstAgent?.goal,
      createdAt: now,
      updatedAt: now,
    },
    ...tasks,
  ] : tasks;

  const nextRuns = [run, ...runs];

  await writeJson(call, 'runs.json', nextRuns);
  await writeJson(call, 'events.json', nextEvents);
  await writeJson(call, 'tasks.json', nextTasks);
  return run;
}

async function getRun(input, call) {
  if (!input.runId) throw new Error("'runId' is required");
  const runs = await readJson(call, 'runs.json', []);
  return runs.find((item) => item.id === input.runId) || null;
}

async function pauseRun(input, call) {
  if (!input.runId) throw new Error("'runId' is required");
  const runs = await readJson(call, 'runs.json', []);
  const run = runs.find((item) => item.id === input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status === 'paused' || run.status === 'completed' || run.status === 'cancelled') {
    return run;
  }

  const now = Date.now();
  const nextRun = {
    ...run,
    status: run.activeTaskCount > 0 ? 'pause_requested' : 'paused',
    pauseRequestedAt: now,
    pausedAt: run.activeTaskCount > 0 ? run.pausedAt : now,
    updatedAt: now,
  };
  const nextRuns = runs.map((item) => (item.id === run.id ? nextRun : item));
  const events = await readJson(call, 'events.json', []);
  const nextEvents = [
    {
      id: createId('evt'),
      runId: run.id,
      type: run.activeTaskCount > 0 ? 'run.pause_requested' : 'run.paused',
      title: run.activeTaskCount > 0 ? 'Pause requested' : 'Run paused',
      detail: run.activeTaskCount > 0
        ? `Waiting for ${run.activeTaskCount} active task(s) to finish.`
        : 'No active tasks. Run paused immediately.',
      createdAt: now,
    },
    ...events,
  ];
  await writeJson(call, 'runs.json', nextRuns);
  await writeJson(call, 'events.json', nextEvents);
  return nextRun;
}

async function resumeRun(input, call) {
  if (!input.runId) throw new Error("'runId' is required");
  const runs = await readJson(call, 'runs.json', []);
  const run = runs.find((item) => item.id === input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status !== 'paused') throw new Error(`Run is not paused: ${input.runId}`);

  const now = Date.now();
  const nextRun = {
    ...run,
    status: 'running',
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    lastWakeAt: now,
    lastDecisionAt: now,
    updatedAt: now,
  };
  const nextRuns = runs.map((item) => (item.id === run.id ? nextRun : item));
  const events = await readJson(call, 'events.json', []);
  const nextEvents = [
    {
      id: createId('evt'),
      runId: run.id,
      type: 'run.resumed',
      title: 'Run resumed',
      detail: 'Main agent will be awakened again.',
      createdAt: now,
    },
    {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.wake',
      title: 'Main agent woke up',
      detail: 'Reason: resume',
      createdAt: now,
    },
    ...events,
  ];
  await writeJson(call, 'runs.json', nextRuns);
  await writeJson(call, 'events.json', nextEvents);
  return nextRun;
}

async function cancelRun(input, call) {
  if (!input.runId) throw new Error("'runId' is required");
  const runs = await readJson(call, 'runs.json', []);
  const run = runs.find((item) => item.id === input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status === 'completed' || run.status === 'cancelled') return run;

  const now = Date.now();
  const nextRun = {
    ...run,
    status: 'cancelled',
    activeTaskCount: 0,
    updatedAt: now,
  };
  const nextRuns = runs.map((item) => (item.id === run.id ? nextRun : item));
  const events = await readJson(call, 'events.json', []);
  const nextEvents = [
    {
      id: createId('evt'),
      runId: run.id,
      type: 'run.updated',
      title: 'Run cancelled',
      detail: 'Further orchestration has been stopped.',
      createdAt: now,
    },
    ...events,
  ];
  await writeJson(call, 'runs.json', nextRuns);
  await writeJson(call, 'events.json', nextEvents);
  return nextRun;
}

async function listTemplates(_input, call) {
  return readJson(call, 'templates.json', []);
}

async function listRuns(_input, call) {
  return readJson(call, 'runs.json', []);
}

async function readJson(call, file, fallback) {
  try {
    const text = await fs.readFile(storageFile(call, file), 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(call, file, value) {
  const target = storageFile(call, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2), 'utf8');
}

function storageFile(call, file) {
  const pluginDataDir = call?.context?.pluginDataDir;
  if (!pluginDataDir) throw new Error('Missing pluginDataDir in plugin call context.');
  return path.join(pluginDataDir, file);
}

function createDefaultTemplate(name) {
  const now = Date.now();
  const draft = createAgent('Draft Agent', 'executor', 'Execute the concrete task for this stage.');
  const review = createAgent('Review Agent', 'reviewer', 'Review the result before the next stage.');
  return {
    id: createId('tpl'),
    name,
    domain: 'general',
    version: '0.1.0',
    description: 'New orchestrator template.',
    stageRows: [
      createStageRow([
        createStage('Stage 1', 'Define the first stage goal.', [createAgentRow([draft])]),
      ]),
      createStageRow([
        createStage('Stage 2', 'Review and continue the run.', [createAgentRow([review])]),
      ]),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function createNovelTemplate(name) {
  const now = Date.now();
  return {
    id: createId('tpl'),
    name,
    domain: 'novel',
    version: '1.0.0',
    description: 'A sample long-form novel orchestration template.',
    stageRows: [
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Concept Refinement',
            goal: 'Clarify the theme, audience and story hook.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('Concept Agent', 'planner', 'Refine the novel premise and core hook.')] }],
          },
        ],
      },
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Worldbuilding',
            goal: 'Build the world rules and background.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('World Agent', 'worldbuilder', 'Create world rules and setting details.')] }],
          },
          {
            id: createId('stage'),
            name: 'Character Design',
            goal: 'Design protagonist, allies and rivals.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('Character Agent', 'character_designer', 'Design the cast and motivations.')] }],
          },
        ],
      },
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Outline',
            goal: 'Create the long arc outline and chapter plan.',
            agentRows: [
              { id: createId('agent_row'), agents: [createAgent('Outline Agent', 'planner', 'Create the long arc and chapter outline.')] },
              { id: createId('agent_row'), agents: [createAgent('Review Agent', 'reviewer', 'Review outline coherence and pacing.')] },
            ],
          },
        ],
      },
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Drafting',
            goal: 'Draft the novel chapters.',
            agentRows: [
              { id: createId('agent_row'), agents: [createAgent('Writer Agent', 'writer', 'Draft the target chapters.')] },
              { id: createId('agent_row'), agents: [createAgent('Consistency Agent', 'reviewer', 'Check continuity and voice consistency.')] },
            ],
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function createSoftwareTemplate(name) {
  const now = Date.now();
  return {
    id: createId('tpl'),
    name,
    domain: 'software',
    version: '1.0.0',
    description: 'A sample software delivery orchestration template.',
    stageRows: [
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Discovery',
            goal: 'Clarify requirements, scope and assumptions.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('Discovery Agent', 'analyst', 'Clarify requirements and open questions.')] }],
          },
        ],
      },
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Architecture',
            goal: 'Design modules, data boundaries and key flows.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('Architecture Agent', 'architect', 'Design system architecture and module boundaries.')] }],
          },
          {
            id: createId('stage'),
            name: 'Planning',
            goal: 'Break the work into implementation tasks.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('Planning Agent', 'planner', 'Create the backlog and delivery batches.')] }],
          },
        ],
      },
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Implementation',
            goal: 'Implement features and code changes.',
            agentRows: [
              { id: createId('agent_row'), agents: [createAgent('Builder Agent', 'builder', 'Implement the required code changes.'), createAgent('Tooling Agent', 'support', 'Prepare helper scripts and local validation.')] },
              { id: createId('agent_row'), agents: [createAgent('Review Agent', 'reviewer', 'Review code quality and integration risks.')] },
            ],
          },
        ],
      },
      {
        id: createId('stage_row'),
        stages: [
          {
            id: createId('stage'),
            name: 'Verification',
            goal: 'Validate output against requirements.',
            agentRows: [{ id: createId('agent_row'), agents: [createAgent('QA Agent', 'tester', 'Validate implementation and report issues.')] }],
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function cloneTemplate(template, name) {
  const now = Date.now();
  const cloned = JSON.parse(JSON.stringify(template));
  return {
    ...cloned,
    id: createId('tpl'),
    name: name || `${template.name} Copy`,
    createdAt: now,
    updatedAt: now,
  };
}

function matchTemplatesByGoal(templates, input) {
  const tokens = tokenize(input.goal);
  const limit = Math.max(1, input.limit || 5);
  return templates
    .map((template) => {
      const haystack = tokenize([
        template.name,
        template.domain,
        template.description || '',
        ...(template.stageRows || []).flatMap((row) => (row.stages || []).map((stage) => `${stage.name} ${stage.goal}`)),
      ].join(' '));
      const matches = tokens.filter((token) => haystack.includes(token));
      return { template, score: matches.length, matches };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))
    .slice(0, limit);
}

function createStageRow(stages) {
  return { id: createId('stage_row'), stages };
}

function createStage(name, goal, agentRows) {
  return { id: createId('stage'), name, goal, agentRows };
}

function createAgentRow(agents) {
  return { id: createId('agent_row'), agents };
}

function createAgent(name, role, goal) {
  return {
    id: createId('agent'),
    name,
    role,
    goal,
    executionMode: 'direct',
    allowSubAgents: false,
    tools: [],
    skills: [],
    inputSources: [],
    outputArtifacts: [],
    failurePolicy: 'pause',
  };
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter(Boolean);
}

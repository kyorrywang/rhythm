import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const handlers = {
  createPlanDraft,
  createPlanDraftFromSession,
  updatePlanDraft,
  confirmPlanDraft,
  getPlanDraft,
  listPlanDrafts,
  createTemplate,
  createSampleNovelTemplate,
  createSampleSoftwareTemplate,
  updateTemplate,
  renameTemplate,
  updateStage,
  updateAgent,
  localizeNovelTemplate,
  duplicateTemplate,
  deleteTemplate,
  matchTemplates,
  wakeRun,
  pauseRun,
  resumeRun,
  cancelRun,
  completeTask,
  overrideReview,
  updateTask,
  retryTask,
  skipTask,
  getRun,
  listTemplates,
  listRuns,
  listTasks,
};

const commandResponseReader = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let rpcSequence = 0;

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
  return executePluginCommand('orchestrator.createTemplate', input);
}

async function createPlanDraft(input) {
  return executePluginCommand('orchestrator.createPlanDraft', input);
}

async function createPlanDraftFromSession(input) {
  return executePluginCommand('orchestrator.createPlanDraftFromSession', input);
}

async function updatePlanDraft(input) {
  return executePluginCommand('orchestrator.updatePlanDraft', input);
}

async function confirmPlanDraft(input) {
  return executePluginCommand('orchestrator.confirmPlanDraft', input);
}

async function getPlanDraft(input) {
  return executePluginCommand('orchestrator.getPlanDraft', input);
}

async function listPlanDrafts() {
  return executePluginCommand('orchestrator.listPlanDrafts', {});
}

async function createSampleNovelTemplate(input, call) {
  return executePluginCommand('orchestrator.createSampleNovelTemplate', input);
}

async function createSampleSoftwareTemplate(input, call) {
  return executePluginCommand('orchestrator.createSampleSoftwareTemplate', input);
}

async function updateTemplate(input, call) {
  return executePluginCommand('orchestrator.updateTemplate', input);
}

async function renameTemplate(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  const templates = await readJson(call, 'templates.json', []);
  const index = templates.findIndex((item) => item.id === input.templateId);
  if (index < 0) throw new Error(`Template not found: ${input.templateId}`);
  const current = templates[index];
  const nextTemplate = {
    ...current,
    ...(typeof input.name === 'string' ? { name: input.name } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(typeof input.domain === 'string' ? { domain: input.domain } : {}),
    ...(typeof input.version === 'string' ? { version: input.version } : {}),
    updatedAt: Date.now(),
  };
  const next = templates.slice();
  next[index] = nextTemplate;
  await writeJson(call, 'templates.json', next);
  return nextTemplate;
}

async function updateStage(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  if (!input.stageId) throw new Error("'stageId' is required");
  if (!input.patch || typeof input.patch !== 'object') throw new Error("'patch' is required");
  const templates = await readJson(call, 'templates.json', []);
  const index = templates.findIndex((item) => item.id === input.templateId);
  if (index < 0) throw new Error(`Template not found: ${input.templateId}`);
  const current = templates[index];
  let found = false;
  const nextStageRows = (current.stageRows || []).map((row) => ({
    ...row,
    stages: (row.stages || []).map((stage) => {
      if (stage.id !== input.stageId) return stage;
      found = true;
      return {
        ...stage,
        ...pickDefined(input.patch, ['name', 'goal', 'description']),
      };
    }),
  }));
  if (!found) throw new Error(`Stage not found: ${input.stageId}`);
  const nextTemplate = {
    ...current,
    stageRows: nextStageRows,
    updatedAt: Date.now(),
  };
  const next = templates.slice();
  next[index] = nextTemplate;
  await writeJson(call, 'templates.json', next);
  return nextTemplate;
}

async function updateAgent(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  if (!input.agentId) throw new Error("'agentId' is required");
  if (!input.patch || typeof input.patch !== 'object') throw new Error("'patch' is required");
  const templates = await readJson(call, 'templates.json', []);
  const index = templates.findIndex((item) => item.id === input.templateId);
  if (index < 0) throw new Error(`Template not found: ${input.templateId}`);
  const current = templates[index];
  let found = false;
  const nextStageRows = (current.stageRows || []).map((row) => ({
    ...row,
    stages: (row.stages || []).map((stage) => ({
      ...stage,
      agentRows: (stage.agentRows || []).map((agentRow) => ({
        ...agentRow,
        agents: (agentRow.agents || []).map((agent) => {
          if (agent.id !== input.agentId) return agent;
          found = true;
          return {
            ...agent,
            ...pickDefined(input.patch, [
              'name',
              'role',
              'goal',
              'description',
              'executionMode',
              'workflowId',
              'allowSubAgents',
              'tools',
              'skills',
              'inputSources',
              'outputArtifacts',
              'completionCondition',
              'failurePolicy',
            ]),
          };
        }),
      })),
    })),
  }));
  if (!found) throw new Error(`Agent not found: ${input.agentId}`);
  const nextTemplate = {
    ...current,
    stageRows: nextStageRows,
    updatedAt: Date.now(),
  };
  const next = templates.slice();
  next[index] = nextTemplate;
  await writeJson(call, 'templates.json', next);
  return nextTemplate;
}

async function localizeNovelTemplate(input, call) {
  if (!input.templateId) throw new Error("'templateId' is required");
  const templates = await readJson(call, 'templates.json', []);
  const index = templates.findIndex((item) => item.id === input.templateId);
  if (index < 0) throw new Error(`Template not found: ${input.templateId}`);
  const current = templates[index];
  const style = typeof input.style === 'string' ? input.style : '';
  const platform = typeof input.platform === 'string' ? input.platform : '';
  const nextTemplate = {
    ...current,
    name: input.name || current.name,
    domain: 'novel',
    description:
      input.description ||
      [platform, style].filter(Boolean).join(' ') ||
      '用于长篇小说创作的编排模板。',
    stageRows: buildLocalizedNovelStageRows(current),
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
  return executePluginCommand('orchestrator.matchTemplates', input);
}

async function wakeRun(input) {
  return executePluginCommand('orchestrator.wakeRun', input);
}

async function getRun(input, call) {
  return executePluginCommand('orchestrator.getRun', input);
}

async function pauseRun(input, call) {
  return executePluginCommand('orchestrator.pauseRun', input);
}

async function resumeRun(input, call) {
  return executePluginCommand('orchestrator.resumeRun', input);
}

async function cancelRun(input, call) {
  return executePluginCommand('orchestrator.cancelRun', input);
}

async function completeTask(input) {
  return executePluginCommand('orchestrator.completeTask', input);
}

async function overrideReview(input) {
  return executePluginCommand('orchestrator.overrideReview', input);
}

async function updateTask(input) {
  return executePluginCommand('orchestrator.updateTask', input);
}

async function retryTask(input) {
  return executePluginCommand('orchestrator.retryTask', input);
}

async function skipTask(input) {
  return executePluginCommand('orchestrator.skipTask', input);
}

async function listTemplates(_input, call) {
  return executePluginCommand('orchestrator.listTemplates', {});
}

async function listRuns(_input, call) {
  return executePluginCommand('orchestrator.listRuns', {});
}

async function listTasks() {
  return executePluginCommand('orchestrator.listTasks', {});
}

async function executePluginCommand(commandId, input) {
  const rpcId = `rpc_${Date.now().toString(36)}_${rpcSequence++}`;
  process.stdout.write(`${JSON.stringify({
    id: rpcId,
    method: 'command.execute',
    params: {
      commandId,
      input,
    },
  })}\n`);

  const responseLine = await new Promise((resolve, reject) => {
    const onLine = (line) => {
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        reject(new Error(`Invalid RPC response from host: ${line}`));
        return;
      }
      if (payload?.id !== rpcId) {
        commandResponseReader.off('line', onLine);
        reject(new Error(`Mismatched RPC response id for ${commandId}`));
        return;
      }
      commandResponseReader.off('line', onLine);
      resolve(payload);
    };
    commandResponseReader.on('line', onLine);
  });

  if (!responseLine?.ok) {
    throw new Error(responseLine?.error?.message || `Command failed: ${commandId}`);
  }

  return responseLine.data ?? null;
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
  const storagePath = call?.context?.plugin_storage_path;
  if (!storagePath) throw new Error('Missing plugin storage path.');
  const base = path.resolve(storagePath);
  const target = path.resolve(base, file);
  const relative = path.relative(base, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error(`Path escapes plugin storage: ${file}`);
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

function pickDefined(source, keys) {
  const target = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  return target;
}

function buildLocalizedNovelStageRows(template) {
  const stageRows = JSON.parse(JSON.stringify(template.stageRows || []));
  const stageNameMap = [
    ['灵感定位', '明确题材、读者和故事钩子。'],
    ['世界观设定', '建立世界规则、背景与约束。'],
    ['人物设定', '设计主角、配角、反派与动机。'],
    ['长线大纲', '形成长线故事与章节规划。'],
    ['正文写作', '按规划推进章节草稿写作。'],
  ];
  const agentMap = {
    'Concept Agent': ['题材代理', 'planner', '提炼小说 premise、卖点和核心钩子。'],
    'World Agent': ['世界观代理', 'worldbuilder', '补全世界设定、规则与背景细节。'],
    'Character Agent': ['角色代理', 'character_designer', '设计人物阵容、关系和动机。'],
    'Outline Agent': ['大纲代理', 'planner', '生成长线剧情和章节大纲。'],
    'Review Agent': ['审查代理', 'reviewer', '审查结构、节奏与逻辑一致性。'],
    'Writer Agent': ['写作代理', 'writer', '输出目标章节草稿。'],
    'Consistency Agent': ['一致性代理', 'reviewer', '检查人物、设定和文风的一致性。'],
  };

  stageRows.forEach((row, rowIndex) => {
    row.stages = (row.stages || []).map((stage, stageIndex) => {
      const mapped =
        rowIndex === 1 && stageIndex === 1
          ? stageNameMap[2]
          : rowIndex === 1 && stageIndex === 0
            ? stageNameMap[1]
            : stageNameMap[Math.min(rowIndex + (rowIndex > 1 ? 1 : 0), stageNameMap.length - 1)];

      const nextStage = {
        ...stage,
        name: mapped?.[0] || stage.name,
        goal: mapped?.[1] || stage.goal,
      };
      nextStage.agentRows = (nextStage.agentRows || []).map((agentRow) => ({
        ...agentRow,
        agents: (agentRow.agents || []).map((agent) => {
          const localized = agentMap[agent.name];
          if (!localized) return agent;
          return {
            ...agent,
            name: localized[0],
            role: localized[1],
            goal: localized[2],
          };
        }),
      }));
      return nextStage;
    });
  });

  return stageRows;
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

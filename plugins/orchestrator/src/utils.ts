import type {
  OrchestratorAgent,
  OrchestratorAgentRow,
  OrchestratorRun,
  OrchestratorRunEvent,
  OrchestratorMatchTemplatesInput,
  OrchestratorStage,
  OrchestratorStageRow,
  OrchestratorTemplate,
} from './types';

export function createDefaultTemplate(name: string): OrchestratorTemplate {
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

export function createSampleNovelTemplate(name = 'Novel Writing Basic'): OrchestratorTemplate {
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
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Concept Agent', 'planner', 'Refine the novel premise and core hook.'),
                ],
              },
            ],
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
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('World Agent', 'worldbuilder', 'Create world rules and setting details.'),
                ],
              },
            ],
          },
          {
            id: createId('stage'),
            name: 'Character Design',
            goal: 'Design protagonist, allies and rivals.',
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Character Agent', 'character_designer', 'Design the cast and motivations.'),
                ],
              },
            ],
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
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Outline Agent', 'planner', 'Create the long arc and chapter outline.'),
                ],
              },
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Review Agent', 'reviewer', 'Review outline coherence and pacing.'),
                ],
              },
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
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Writer Agent', 'writer', 'Draft the target chapters.'),
                ],
              },
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Consistency Agent', 'reviewer', 'Check continuity and voice consistency.'),
                ],
              },
            ],
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSampleSoftwareTemplate(name = 'Software Delivery Basic'): OrchestratorTemplate {
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
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Discovery Agent', 'analyst', 'Clarify requirements and open questions.'),
                ],
              },
            ],
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
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Architecture Agent', 'architect', 'Design system architecture and module boundaries.'),
                ],
              },
            ],
          },
          {
            id: createId('stage'),
            name: 'Planning',
            goal: 'Break the work into implementation tasks.',
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Planning Agent', 'planner', 'Create the backlog and delivery batches.'),
                ],
              },
            ],
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
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Builder Agent', 'builder', 'Implement the required code changes.'),
                  createAgent('Tooling Agent', 'support', 'Prepare helper scripts and local validation.'),
                ],
              },
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('Review Agent', 'reviewer', 'Review code quality and integration risks.'),
                ],
              },
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
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createAgent('QA Agent', 'tester', 'Validate implementation and report issues.'),
                ],
              },
            ],
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneTemplate(template: OrchestratorTemplate, name?: string): OrchestratorTemplate {
  const now = Date.now();
  const cloned = JSON.parse(JSON.stringify(template)) as OrchestratorTemplate;
  return {
    ...cloned,
    id: createId('tpl'),
    name: name || `${template.name} Copy`,
    createdAt: now,
    updatedAt: now,
  };
}

export function matchTemplatesByGoal(
  templates: OrchestratorTemplate[],
  input: OrchestratorMatchTemplatesInput,
) {
  const tokens = tokenize(input.goal);
  const limit = Math.max(1, input.limit || 5);
  return templates
    .map((template) => {
      const haystack = tokenize([
        template.name,
        template.domain,
        template.description || '',
        ...template.stageRows.flatMap((row) => row.stages.map((stage) => `${stage.name} ${stage.goal}`)),
      ].join(' '));
      const matches = tokens.filter((token) => haystack.includes(token));
      return {
        template,
        score: matches.length,
        matches,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))
    .slice(0, limit);
}

export function createRunFromTemplate(
  template: OrchestratorTemplate,
  goal: string,
  source: OrchestratorRun['source'],
): OrchestratorRun {
  const now = Date.now();
  const firstStage = template.stageRows[0]?.stages[0];
  const firstAgent = firstStage?.agentRows[0]?.agents[0];
  return {
    id: createId('run'),
    templateId: template.id,
    templateName: template.name,
    goal,
    status: 'pending',
    source,
    activeTaskCount: 0,
    currentStageId: firstStage?.id,
    currentStageName: firstStage?.name,
    currentAgentId: firstAgent?.id,
    currentAgentName: firstAgent?.name,
    createdAt: now,
    updatedAt: now,
  };
}

export function createRunCreatedEvent(run: OrchestratorRun): OrchestratorRunEvent {
  return {
    id: createId('evt'),
    runId: run.id,
    type: 'run.created',
    title: 'Run created',
    detail: `Template: ${run.templateName}`,
    createdAt: Date.now(),
  };
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDateTime(timestamp?: number) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
}

function tokenize(value: string) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter(Boolean);
}

function createStageRow(stages: OrchestratorStage[]): OrchestratorStageRow {
  return {
    id: createId('stage_row'),
    stages,
  };
}

function createStage(name: string, goal: string, agentRows: OrchestratorAgentRow[]): OrchestratorStage {
  return {
    id: createId('stage'),
    name,
    goal,
    agentRows,
  };
}

function createAgentRow(agents: OrchestratorAgent[]): OrchestratorAgentRow {
  return {
    id: createId('agent_row'),
    agents,
  };
}

function createAgent(name: string, role: string, goal: string): OrchestratorAgent {
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

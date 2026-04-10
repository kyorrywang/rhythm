import type {
  OrchestratorAgent,
  OrchestratorAgentRow,
  OrchestratorConfirmedPlan,
  OrchestratorPlanDraft,
  OrchestratorPlanStage,
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
    parameters: [],
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

export function createPlanDraft(input: {
  title?: string;
  goal: string;
  overview?: string;
  constraints?: string[];
  successCriteria?: string[];
  decompositionPrinciples?: string[];
  humanCheckpoints?: string[];
  reviewCheckpoints?: string[];
  reviewPolicy?: string;
  stages?: Array<{ name: string; goal: string; deliverables?: string[]; targetFolder?: string; outputFiles?: string[]; executorName?: string; reviewerName?: string; executorTools?: string[]; reviewerTools?: string[]; executorSkills?: string[]; reviewerSkills?: string[]; failurePolicy?: OrchestratorAgent['failurePolicy'] }>;
  sourceSessionId?: string;
  sourceMessageId?: string;
}): OrchestratorPlanDraft {
  const now = Date.now();
  return {
    id: createId('plan'),
    title: input.title || input.goal,
    goal: input.goal,
    sourceSessionId: input.sourceSessionId,
    sourceMessageId: input.sourceMessageId,
    status: 'draft',
    overview: input.overview || `围绕“${input.goal}”推进项目，并逐步拆解执行任务。`,
    constraints: input.constraints || [],
    successCriteria: input.successCriteria || ['产出满足用户目标的高质量结果。'],
    decompositionPrinciples: input.decompositionPrinciples || ['先保持高层阶段清晰，再在运行中逐步细化为可执行任务。'],
    humanCheckpoints: input.humanCheckpoints || ['计划确认后再启动 run。'],
    reviewCheckpoints: input.reviewCheckpoints || ['每个主要阶段完成后进入审核。'],
    reviewPolicy: input.reviewPolicy || '每个主要阶段完成后进入审核；不通过则返工。',
    stages: (input.stages && input.stages.length > 0
      ? input.stages.map((stage) => ({
        id: createId('plan_stage'),
        name: stage.name,
        goal: stage.goal,
        deliverables: stage.deliverables || [],
        targetFolder: stage.targetFolder || buildDefaultStageTargetFolder(stage.name),
        outputFiles: stage.outputFiles || buildDefaultStageOutputFiles(stage.name),
        executorName: stage.executorName,
        reviewerName: stage.reviewerName,
        executorTools: stage.executorTools || [],
        reviewerTools: stage.reviewerTools || [],
        executorSkills: stage.executorSkills || [],
        reviewerSkills: stage.reviewerSkills || [],
        failurePolicy: stage.failurePolicy || 'pause',
      }))
      : createDefaultPlanStages(input.goal)),
    createdAt: now,
    updatedAt: now,
  };
}

export function createConfirmedPlanFromDraft(planDraft: OrchestratorPlanDraft): OrchestratorConfirmedPlan {
  return {
    id: planDraft.id,
    title: planDraft.title,
    goal: planDraft.goal,
    overview: planDraft.overview,
    constraints: [...planDraft.constraints],
    successCriteria: [...planDraft.successCriteria],
    decompositionPrinciples: [...planDraft.decompositionPrinciples],
    humanCheckpoints: [...planDraft.humanCheckpoints],
    reviewCheckpoints: [...planDraft.reviewCheckpoints],
    reviewPolicy: planDraft.reviewPolicy,
    stages: planDraft.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      goal: stage.goal,
      deliverables: [...stage.deliverables],
      targetFolder: stage.targetFolder,
      outputFiles: [...stage.outputFiles],
      executorName: stage.executorName,
      reviewerName: stage.reviewerName,
      executorTools: [...(stage.executorTools || [])],
      reviewerTools: [...(stage.reviewerTools || [])],
      executorSkills: [...(stage.executorSkills || [])],
      reviewerSkills: [...(stage.reviewerSkills || [])],
      failurePolicy: stage.failurePolicy,
    })),
    confirmedAt: planDraft.confirmedAt || Date.now(),
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
    parameters: [
      {
        id: createId('param'),
        name: 'genre',
        label: 'Genre',
        description: 'Novel genre or core category.',
        required: true,
        defaultValue: 'fantasy',
      },
      {
        id: createId('param'),
        name: 'tone',
        label: 'Tone',
        description: 'Target emotional tone and voice.',
        required: false,
        defaultValue: 'dramatic',
      },
    ],
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
    parameters: [
      {
        id: createId('param'),
        name: 'platform',
        label: 'Platform',
        description: 'Target platform or runtime.',
        required: false,
        defaultValue: 'web',
      },
      {
        id: createId('param'),
        name: 'quality_bar',
        label: 'Quality Bar',
        description: 'Desired quality threshold.',
        required: false,
        defaultValue: 'production-ready',
      },
    ],
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

export function createRunFromPlan(
  plan: OrchestratorConfirmedPlan,
  source: OrchestratorRun['source'],
): OrchestratorRun {
  const now = Date.now();
  const firstStage = plan.stages[0];
  return {
    id: createId('run'),
    planId: plan.id,
    planTitle: plan.title,
    confirmedPlan: plan,
    goal: plan.goal,
    status: 'pending',
    source,
    activeTaskCount: 0,
    maxConcurrentTasks: 2,
    watchdogStatus: 'healthy',
    currentStageId: firstStage?.id,
    currentStageName: firstStage?.name,
    currentAgentId: undefined,
    currentAgentName: firstStage ? `${firstStage.name} Work Agent` : undefined,
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
    detail: `Plan: ${run.planTitle}`,
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

function createDefaultPlanStages(goal: string): OrchestratorPlanStage[] {
  return [
    {
      id: createId('plan_stage'),
      name: 'Clarify Scope',
      goal: `Extract the key constraints and execution shape for ${goal}.`,
      deliverables: ['Scope notes', 'Execution assumptions'],
      targetFolder: 'orchestrator-output/clarify-scope',
      outputFiles: ['clarify-scope.md'],
    },
    {
      id: createId('plan_stage'),
      name: 'Produce Core Output',
      goal: `Create the main deliverable for ${goal}.`,
      deliverables: ['Primary draft or implementation'],
      targetFolder: 'orchestrator-output/produce-core-output',
      outputFiles: ['produce-core-output.md'],
    },
    {
      id: createId('plan_stage'),
      name: 'Review And Refine',
      goal: `Review the result for quality and prepare the next refinement pass for ${goal}.`,
      deliverables: ['Review notes', 'Refined result'],
      targetFolder: 'orchestrator-output/review-and-refine',
      outputFiles: ['review-and-refine.md'],
    },
  ];
}

function buildDefaultStageTargetFolder(stageName: string) {
  return `orchestrator-output/${slugify(stageName)}`;
}

function buildDefaultStageOutputFiles(stageName: string) {
  return [`${slugify(stageName)}.md`];
}

function slugify(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stage';
}

import type { LeftPanelProps } from '../../../src/plugin/sdk';
import { useSessionStore } from '../../../src/shared/state/useSessionStore';
import type { MessageSegment } from '../../../src/shared/types/schema';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_VIEWS } from './constants';
import type { OrchestratorPlanDraft, OrchestratorRun } from './types';

export function registerOrchestratorMessageActions(ctx: LeftPanelProps['ctx']) {
  ctx.ui.messageActions.register({
    id: 'orchestrator.createPlanDraftFromMessage',
    title: 'Create Plan Draft',
    description: 'Turn this conversation state into a confirmable plan draft.',
    order: 30,
    when: ({ message }) => message.role === 'assistant',
    run: async ({ ctx, message, sessionId }) => {
      const planDraft = await ctx.commands.execute<unknown, OrchestratorPlanDraft>(ORCHESTRATOR_COMMANDS.createPlanDraftFromSession, {
        sessionId,
        messageId: message.id,
      });
      ctx.ui.workbench.open({
        id: `orchestrator.plan-draft:${planDraft.id}`,
        viewId: ORCHESTRATOR_VIEWS.planDraft,
        title: planDraft.title,
        description: 'Plan Draft',
        payload: { planDraft },
        layoutMode: 'replace',
      });
    },
  });

  ctx.ui.messageActions.register({
    id: 'orchestrator.openLatestRunFromConversation',
    title: 'Open Latest Run',
    description: 'Open the latest orchestrator run created from this conversation.',
    order: 40,
    when: ({ sessionId }) => {
      const session = useSessionStore.getState().sessions.get(sessionId);
      return Boolean(session?.messages.some((message) =>
        message.segments?.some((segment) => segment.type === 'tool' && segment.tool.name === ORCHESTRATOR_COMMANDS.confirmPlanDraft),
      ));
    },
    run: async ({ sessionId, ctx }) => {
      const session = useSessionStore.getState().sessions.get(sessionId);
      const toolSegments = session?.messages
        .flatMap((message) => message.segments || [])
        .filter((segment): segment is Extract<MessageSegment, { type: 'tool' }> => segment.type === 'tool')
        .filter((segment) => segment.tool.name === ORCHESTRATOR_COMMANDS.confirmPlanDraft)
        || [];
      const latest = toolSegments[toolSegments.length - 1];
      if (!latest?.tool.result) return;
      const parsed = JSON.parse(latest.tool.result) as { data?: OrchestratorRun };
      const run = parsed?.data;
      if (!run?.id) return;
      ctx.ui.workbench.open({
        id: `orchestrator.run:${run.id}`,
        viewId: ORCHESTRATOR_VIEWS.run,
        title: run.goal,
        description: run.planTitle,
        payload: { run },
        layoutMode: 'replace',
      });
    },
  });
}

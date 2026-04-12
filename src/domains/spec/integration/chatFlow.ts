// 简化的 chatFlow - 处理 create_spec 和 start_spec 工具结果
import { createSpecInWorkspace, prepareSpecRun, loadSpecWorkbench } from './workbench';

export type SpecToolPayload =
  | {
      kind: 'spec_tool_result';
      action: 'create_spec';
      title: string;
      goal: string;
      overview?: string;
    }
  | {
      kind: 'spec_tool_result';
      action: 'start_spec';
      slug: string;
    };

interface ApplySpecToolResultInput {
  workspacePath: string;
  rawResult: string;
}

interface ApplySpecToolResultOutput {
  handled: boolean;
  toolMessage?: string;
  // create_spec
  specSlug?: string;
  specTitle?: string;
  // start_spec
  startedSlug?: string;
  specAgentPrompt?: string;
}

/**
 * Called by useLLMStream whenever the LLM calls a spec tool.
 * Returns structured output so the caller can update UI state or launch
 * the spec-agent session.
 */
export async function applySpecToolResult(
  input: ApplySpecToolResultInput,
): Promise<ApplySpecToolResultOutput> {
  try {
    const parsed = JSON.parse(input.rawResult) as SpecToolPayload;

    if (parsed.kind !== 'spec_tool_result') {
      return { handled: false };
    }

    // ── create_spec ──────────────────────────────────────────────────────────
    if (parsed.action === 'create_spec') {
      const state = await createSpecInWorkspace(input.workspacePath, {
        title: parsed.title,
        goal: parsed.goal,
        overview: parsed.overview,
      });

      return {
        handled: true,
        specSlug: state.slug,
        specTitle: state.title,
        toolMessage:
          `Spec created: **${state.title}**\n` +
          `Slug: \`${state.slug}\`\n\n` +
          `Review \`proposal.md\` and \`tasks.md\` in the Spec workbench, ` +
          `then confirm when you're ready to start execution.`,
      };
    }

    // ── start_spec ───────────────────────────────────────────────────────────
    if (parsed.action === 'start_spec') {
      const { slug } = parsed;
      const { state, documents } = await loadSpecWorkbench(input.workspacePath, slug);
      const { nextState, prompt } = await prepareSpecRun(
        input.workspacePath,
        state,
        documents,
      );

      return {
        handled: true,
        startedSlug: nextState.slug,
        specAgentPrompt: prompt,
        toolMessage:
          `Starting spec execution: **${nextState.title}**\n` +
          `The spec-agent will now execute the tasks in \`tasks.md\`.`,
      };
    }

    return { handled: false };
  } catch {
    return { handled: false };
  }
}

// 简化的 chatFlow - 只处理 create_spec 工具
import { createSpecInWorkspace } from './workbench';

export interface SpecToolPayload {
  kind: 'spec_tool_result';
  action: 'create_spec';
  title: string;
  goal: string;
  overview?: string;
}

interface ApplySpecToolResultInput {
  workspacePath: string;
  rawResult: string;
}

interface ApplySpecToolResultOutput {
  handled: boolean;
  toolMessage?: string;
  specSlug?: string;
  specTitle?: string;
}

/**
 * 当 LLM 调用 create_spec 工具时，由 useLLMStream 调用此函数。
 */
export async function applySpecToolResult(
  input: ApplySpecToolResultInput,
): Promise<ApplySpecToolResultOutput> {
  try {
    const parsed = JSON.parse(input.rawResult) as SpecToolPayload;
    
    if (parsed.kind !== 'spec_tool_result' || parsed.action !== 'create_spec') {
      return { handled: false };
    }

    const state = await createSpecInWorkspace(input.workspacePath, {
      title: parsed.title,
      goal: parsed.goal,
      overview: parsed.overview,
    });

    return {
      handled: true,
      specSlug: state.slug,
      specTitle: state.title,
      toolMessage: `Spec created: ${state.title}\nOpen: spec://${state.slug}`,
    };
  } catch {
    return { handled: false };
  }
}

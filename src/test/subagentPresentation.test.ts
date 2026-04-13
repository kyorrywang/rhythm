import { describe, expect, it } from 'vitest';
import { getSubagentDisplayTitle, getToolPresentation } from '@/domains/chat/session/toolPresentation';
import type { ToolCall } from '@/shared/types/schema';

function buildTool(argumentsValue: ToolCall['arguments']): ToolCall {
  return {
    id: 'tool-1',
    name: 'spawn_subagent',
    arguments: argumentsValue,
    status: 'running',
  };
}

describe('subagent presentation', () => {
  it('shows coordinate subagent titles from agent type', () => {
    const tool = buildTool({ agent_type: 'coordinate', title: '协调任务' });

    expect(getSubagentDisplayTitle(tool)).toBe('Coordinate 智能体');
    expect(getToolPresentation(tool).title).toBe('Coordinate 智能体');
  });

  it('shows explorer subagent titles from type aliases', () => {
    const tool = buildTool({ type: 'explorer', title: '检索代码' });

    expect(getSubagentDisplayTitle(tool)).toBe('Explorer 智能体');
  });

  it('falls back to dynamic when no type is present', () => {
    const tool = buildTool({ title: '默认任务' });

    expect(getSubagentDisplayTitle(tool)).toBe('Dynamic 智能体');
  });
});

// 简化的 commands - 只保留基本功能
import { createSpecInWorkspace, loadSpecWorkbench, listSpecWorkbenches } from './workbench';
import type { SpecState } from '../domain/types';

export interface SpecRuntimeContext {
  workspacePath: string;
}

export async function createSpecChangeCommand(ctx: SpecRuntimeContext, input: { title: string; goal: string; overview?: string }) {
  return createSpecInWorkspace(ctx.workspacePath, input);
}

export async function listSpecChangesCommand(ctx: SpecRuntimeContext): Promise<SpecState[]> {
  return listSpecWorkbenches(ctx.workspacePath);
}

export async function loadSpecChangeCommand(ctx: SpecRuntimeContext, slug: string) {
  return loadSpecWorkbench(ctx.workspacePath, slug);
}

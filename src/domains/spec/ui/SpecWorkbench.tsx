// 重写后的 SpecWorkbench - 简化版本
import { useEffect, useState, startTransition } from 'react';
import { LoaderCircle, Square } from 'lucide-react';
import type { WorkbenchProps } from '@/core/plugin/sdk';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import {
  EmptyState,
  WorkbenchPage,
  WorkbenchSection,
} from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { loadSpecWorkbench, persistSpecWorkbench, prepareSpecRun, finalizeSpecRun } from '../integration/workbench';
import type { SpecState, SpecDocuments } from '../domain/types';
import { SpecStatusHeader } from './SpecStatusHeader';
import { hasHumanCheckpoint } from '../domain/stateMachine';

export function SpecWorkbench({ payload }: WorkbenchProps<{ slug: string }>) {
  const workspace = useActiveWorkspace();
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SpecState | null>(null);
  const [documents, setDocuments] = useState<SpecDocuments>({ proposal: '', tasks: '' });

  const slug = payload?.slug;

  useEffect(() => {
    if (!slug) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    startTransition(() => {
      loadSpecWorkbench(workspace.path, slug)
        .then((loaded) => {
          if (cancelled) return;
          setState(loaded.state);
          setDocuments(loaded.documents);
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [workspace.path, slug]);

  const handleRun = async () => {
    if (!state) return;
    setIsRunning(true);
    setError(null);

    try {
      // 1. 持久化状态变为 active，获取 prompt
      const { nextState, prompt } = await prepareSpecRun(workspace.path, state, documents);
      setState(nextState);

      // 2. 创建事件通道，用于接收 Agent 的流式输出
      const channel = new Channel();
      const specSessionId = `spec-${state.slug}-${Date.now()}`;

      // 3. 监听 Agent 完成事件
      channel.onmessage = (event: unknown) => {
        const evt = event as Record<string, unknown>;
        if (evt?.state === 'completed' || evt?.state === 'failed') {
          // Agent 执行完毕，重新读取 tasks.md，同步进度
          finalizeSpecRun(workspace.path, nextState).then((finalState) => {
            setState(finalState);
            // 重新加载 documents（tasks.md 已被 Agent 更新）
            loadSpecWorkbench(workspace.path, state.slug).then((data) => {
              setDocuments(data.documents);
            });
            setIsRunning(false);
          }).catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
            setIsRunning(false);
          });
        }
      };

      // 4. 发起 chat_stream，使用 spec profile
      await invoke('chat_stream', {
        sessionId: specSessionId,
        prompt,
        cwd: workspace.path,
        profileId: 'spec',
        permissionMode: 'full_auto',
        onEvent: channel,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRunning(false);
    }
  };

  const handleInterrupt = async () => {
    if (!state) return;
    // 中断：将状态从 active 退回 draft
    const nextState = { ...state, status: 'draft' as const, updatedAt: Date.now() };
    await persistSpecWorkbench(workspace.path, nextState, documents);
    setState(nextState);
    setIsRunning(false);
  };

  if (isLoading) {
    return (
      <WorkbenchPage icon={<LoaderCircle size={18} className="animate-spin" />} eyebrow="Spec" title="Loading Spec">
        <EmptyState title="Loading spec" description="Reading markdown documents and state from the workspace." />
      </WorkbenchPage>
    );
  }

  if (error && !state) {
    return (
      <WorkbenchPage icon={<Square size={18} />} eyebrow="Spec" title="Spec Unavailable">
        <EmptyState title="Could not open this spec" description={error} />
      </WorkbenchPage>
    );
  }

  if (!state) {
    return null;
  }

  const showHumanWarning = state.status === 'active' && hasHumanCheckpoint(documents.tasks);

  return (
    <WorkbenchPage
      icon={<Square size={18} />}
      eyebrow="Spec"
      title={state.title}
      description={state.goal}
      actions={null}
    >
      <SpecStatusHeader
        state={state}
        showHumanWarning={showHumanWarning}
        isRunning={isRunning}
        onRun={handleRun}
        onInterrupt={handleInterrupt}
      />

      {/* proposal.md 编辑器 */}
      {state.status === 'draft' && (
        <WorkbenchSection
          title="变更提案"
          description="编辑 proposal.md 来定义目标、范围和约束"
        >
          <textarea
            className="w-full min-h-[30vh] font-mono text-sm p-4 bg-transparent border rounded"
            value={documents.proposal}
            onChange={(e) => setDocuments({ ...documents, proposal: e.target.value })}
            onBlur={() => persistSpecWorkbench(workspace.path, state, documents)}
          />
        </WorkbenchSection>
      )}

      {/* tasks.md 显示 */}
      <WorkbenchSection
        title="任务列表"
        description={state.status === 'draft' ? 'Agent 将在此生成具体任务' : 'Agent 正在执行任务'}
      >
        <div className="font-mono text-sm whitespace-pre-wrap p-4">
          {documents.tasks}
        </div>
      </WorkbenchSection>

      {error && (
        <WorkbenchSection title="错误" description="执行过程中出现错误">
          <div className={`rounded border px-4 py-3 text-sm ${themeRecipes.description()}`}>
            {error}
          </div>
        </WorkbenchSection>
      )}

      {state.status === 'done' && (
        <WorkbenchSection title="完成" description="所有任务已完成">
          <div className="flex items-center gap-2 text-sm">
            ✓ 此 Spec 已完成，tasks.md 保留了执行记录。
          </div>
        </WorkbenchSection>
      )}
    </WorkbenchPage>
  );
}

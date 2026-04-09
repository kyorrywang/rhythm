import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { Button } from '../../../../src/shared/ui/Button';
import { WORKFLOW_EVENTS, WORKFLOW_VIEWS } from '../constants';
import { listWorkflowNodeTypes } from '../nodeRegistry';
import { saveWorkflow } from '../storage';
import type { WorkflowDefinition, WorkflowEditorPayload, WorkflowNode, WorkflowNodeType } from '../types';
import {
  createId,
  createNode,
  downloadJson,
  exportWorkflow,
  importWorkflow,
  isStarterWorkflow,
  normalizeWorkflowNodeType,
  readJsonFile,
} from '../utils';
import { WorkflowGraphCanvas } from './WorkflowGraphCanvas';

export function WorkflowEditorView({ ctx, payload }: WorkbenchProps<WorkflowEditorPayload>) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(payload.workflow);
  const [selectedNodeId, setSelectedNodeId] = useState(payload.workflow.nodes[0]?.id || '');
  const [edgeStartNodeId, setEdgeStartNodeId] = useState('');
  const [nodeTypes, setNodeTypes] = useState(listWorkflowNodeTypes());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedNode = useMemo(
    () => workflow.nodes.find((node) => node.id === selectedNodeId) || workflow.nodes[0],
    [selectedNodeId, workflow.nodes],
  );
  const showStarterGuide = useMemo(() => isStarterWorkflow(workflow), [workflow]);

  useEffect(() => {
    setWorkflow(payload.workflow);
    setSelectedNodeId(payload.workflow.nodes[0]?.id || '');
    setEdgeStartNodeId('');
    setError(null);
    setSaved(false);
  }, [payload.workflow]);

  useEffect(() => {
    const disposable = ctx.events.on(WORKFLOW_EVENTS.nodeTypesChanged, () => {
      setNodeTypes(listWorkflowNodeTypes());
    });
    return () => disposable.dispose();
  }, [ctx.events]);

  const updateNode = (nodeId: string, patch: Partial<WorkflowNode>) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    }));
    setSaved(false);
  };

  const updateNodeConfig = (nodeId: string, key: keyof WorkflowNode['config'], value: string) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (
        node.id === nodeId
          ? { ...node, config: { ...node.config, [key]: value } }
          : node
      )),
    }));
    setSaved(false);
  };

  const moveNode = (nodeId: string, dx: number, dy: number) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (
        node.id === nodeId
          ? { ...node, position: { x: Math.max(0, node.position.x + dx), y: Math.max(0, node.position.y + dy) } }
          : node
      )),
    }));
    setSaved(false);
  };

  const setNodePosition = (nodeId: string, position: { x: number; y: number }) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
    }));
    setSaved(false);
  };

  const addNode = (type: WorkflowNodeType) => {
    setWorkflow((current) => {
      const node = {
        ...createNode(type),
        position: { x: current.nodes.length * 190, y: current.nodes.length % 2 === 0 ? 40 : 160 },
      };
      const nodes = [...current.nodes, node];
      setSelectedNodeId(node.id);
      const previous = nodes[nodes.length - 2];
      return {
        ...current,
        nodes,
        edges: previous ? [...current.edges, { id: createId('edge'), from: previous.id, to: node.id }] : current.edges,
      };
    });
    setSaved(false);
  };

  const removeNode = (nodeId: string) => {
    setWorkflow((current) => {
      const nodes = current.nodes.filter((node) => node.id !== nodeId);
      setSelectedNodeId(nodes[0]?.id || '');
      return {
        ...current,
        nodes,
        edges: current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
      };
    });
    setSaved(false);
  };

  const startEdge = (nodeId: string) => {
    setEdgeStartNodeId(nodeId);
    setSelectedNodeId(nodeId);
  };

  const completeEdge = (nodeId: string) => {
    if (!edgeStartNodeId || edgeStartNodeId === nodeId) return;
    setWorkflow((current) => {
      const exists = current.edges.some((edge) => edge.from === edgeStartNodeId && edge.to === nodeId);
      if (exists) return current;
      const sourceNode = current.nodes.find((node) => node.id === edgeStartNodeId);
      const sourceType = normalizeWorkflowNodeType(sourceNode?.type || '');
      const branch = sourceType === 'if'
        ? suggestIfBranch(current, edgeStartNodeId)
        : sourceType === 'loop'
          ? suggestLoopBranch(current, edgeStartNodeId)
        : undefined;
      return {
        ...current,
        edges: [...current.edges, { id: createId('edge'), from: edgeStartNodeId, to: nodeId, branch }],
      };
    });
    setEdgeStartNodeId('');
    setSaved(false);
  };

  const removeEdge = (edgeId: string) => {
    setWorkflow((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    }));
    setSaved(false);
  };

  const updateEdgeBranch = (edgeId: string, branch: string) => {
    setWorkflow((current) => ({
      ...current,
      edges: current.edges.map((edge) => edge.id === edgeId ? { ...edge, branch: branch || undefined } : edge),
    }));
    setSaved(false);
  };

  const save = async (nextWorkflow = workflow) => {
    setError(null);
    try {
      const next = {
        ...nextWorkflow,
        updatedAt: Date.now(),
        version: nextWorkflow.version + 1,
      };
      await saveWorkflow(ctx, next);
      ctx.events.emit(WORKFLOW_EVENTS.changed, { workflowId: next.id });
      setWorkflow(next);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '保存失败'));
    }
  };

  const exportCurrent = async () => {
    downloadJson(`${workflow.name.replace(/[<>:"/\\|?*]/g, '_') || 'workflow'}.workflow.json`, exportWorkflow(workflow));
  };

  const importFromFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      const value = await readJsonFile(file);
      const imported = importWorkflow(value);
      setWorkflow(imported);
      setSelectedNodeId(imported.nodes[0]?.id || '');
      await save(imported);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '导入失败'));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#fbfaf7] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Workflow Editor</div>
          <input
            value={workflow.name}
            onChange={(event) => {
              setWorkflow((current) => ({ ...current, name: event.target.value }));
              setSaved(false);
            }}
            className="mt-2 w-full bg-transparent text-2xl font-semibold text-slate-900 outline-none"
          />
          <textarea
            value={workflow.description || ''}
            onChange={(event) => {
              setWorkflow((current) => ({ ...current, description: event.target.value }));
              setSaved(false);
            }}
            placeholder="Description"
            rows={2}
            className="mt-2 w-full resize-none rounded-[var(--theme-radius-control)] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-amber-300"
          />
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          {saved && <p className="mt-2 text-sm text-emerald-600">已保存</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void importFromFile(event.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={15} className="mr-1.5" />
            导入
          </Button>
          <Button variant="secondary" onClick={() => void exportCurrent()}>
            <Download size={15} className="mr-1.5" />
            导出
          </Button>
          <Button onClick={() => void save()}>
            <Save size={15} className="mr-1.5" />
            保存
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {nodeTypes.map((nodeType) => (
          <Button key={nodeType.id} variant="secondary" size="sm" onClick={() => addNode(nodeType.id)}>
            <Plus size={14} className="mr-1.5" />
            {nodeType.title}
          </Button>
        ))}
      </div>

      {showStarterGuide && (
        <div className="mt-4 rounded-[var(--theme-radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <div className="font-medium">Getting Started</div>
          <div className="mt-1">
            This starter workflow already includes a trigger and a command node. Rename the flow, edit the command, or add more nodes to continue.
          </div>
        </div>
      )}

      <div className="mt-5 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkflowGraphCanvas
          workflow={workflow}
          selectedNodeId={selectedNode?.id}
          onSelectNode={setSelectedNodeId}
          onMoveNode={setNodePosition}
          onStartEdge={startEdge}
          onCompleteEdge={completeEdge}
          edgeStartNodeId={edgeStartNodeId}
        />
        <aside className="overflow-y-auto rounded-[var(--theme-radius-shell)] border border-slate-200 bg-white p-4 shadow-sm">
          {selectedNode ? (
            <NodeEditor
              ctx={ctx}
              workflow={workflow}
              node={selectedNode}
              updateNode={updateNode}
              updateNodeConfig={updateNodeConfig}
              moveNode={moveNode}
              removeNode={removeNode}
              removeEdge={removeEdge}
              updateEdgeBranch={updateEdgeBranch}
              edgeStartNodeId={edgeStartNodeId}
            />
          ) : (
            <div className="text-sm text-slate-500">选择一个节点进行编辑</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeEditor({
  ctx,
  workflow,
  node,
  updateNode,
  updateNodeConfig,
  moveNode,
  removeNode,
  removeEdge,
  updateEdgeBranch,
  edgeStartNodeId,
}: {
  ctx: WorkbenchProps<WorkflowEditorPayload>['ctx'];
  workflow: WorkflowDefinition;
  node: WorkflowNode;
  updateNode: (nodeId: string, patch: Partial<WorkflowNode>) => void;
  updateNodeConfig: (nodeId: string, key: keyof WorkflowNode['config'], value: string) => void;
  moveNode: (nodeId: string, dx: number, dy: number) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateEdgeBranch: (edgeId: string, branch: string) => void;
  edgeStartNodeId: string;
}) {
  const connectedEdges = workflow.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  const nodeTitle = (nodeId: string) => workflow.nodes.find((item) => item.id === nodeId)?.title || nodeId;
  const openInspector = () => {
    ctx.ui.overlay.open({
      viewId: WORKFLOW_VIEWS.nodeInspector,
      title: node.title,
      description: `Node type: ${node.type}`,
      payload: { workflow, node },
      kind: 'drawer',
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{node.type}</div>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{node.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openInspector}>
            查看抽屉
          </Button>
          <Button variant="ghost" size="sm" onClick={() => removeNode(node.id)} disabled={workflow.nodes.length <= 1}>
            <Trash2 size={14} className="mr-1.5" />
            删除
          </Button>
        </div>
      </div>
      <label className="mt-4 block text-xs font-medium text-slate-500">
        标题
        <input
          value={node.title}
          onChange={(event) => updateNode(node.id, { title: event.target.value })}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-300"
        />
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => moveNode(node.id, -40, 0)}>左移</Button>
        <Button variant="secondary" size="sm" onClick={() => moveNode(node.id, 40, 0)}>右移</Button>
        <Button variant="secondary" size="sm" onClick={() => moveNode(node.id, 0, -40)}>上移</Button>
        <Button variant="secondary" size="sm" onClick={() => moveNode(node.id, 0, 40)}>下移</Button>
      </div>
      {edgeStartNodeId && (
        <div className="mt-4 rounded-[var(--theme-radius-control)] bg-sky-50 px-3 py-2 text-xs text-sky-700">
          正在从 {nodeTitle(edgeStartNodeId)} 连线。点击目标节点的“连入”完成。
        </div>
      )}
      <section className="mt-4">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Edges</div>
        <div className="mt-2 space-y-2">
          {connectedEdges.map((edge) => (
            <div key={edge.id} className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-xs text-slate-600">
              <div className="min-w-0 flex-1">
                <div>{nodeTitle(edge.from)} → {nodeTitle(edge.to)}</div>
                {normalizeWorkflowNodeType(node.type) === 'if' && edge.from === node.id && (
                  <input
                    value={edge.branch || ''}
                    onChange={(event) => updateEdgeBranch(edge.id, event.target.value)}
                    placeholder="branch: true / false / default"
                    className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-amber-300"
                  />
                )}
                {normalizeWorkflowNodeType(node.type) === 'loop' && edge.from === node.id && (
                  <input
                    value={edge.branch || ''}
                    onChange={(event) => updateEdgeBranch(edge.id, event.target.value)}
                    placeholder="branch: body / done / default"
                    className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-amber-300"
                  />
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeEdge(edge.id)}>删除</Button>
            </div>
          ))}
          {connectedEdges.length === 0 && <div className="text-xs text-slate-500">该节点暂无连线</div>}
        </div>
      </section>
      {normalizeWorkflowNodeType(node.type) === 'shell' && (
        <label className="mt-4 block text-xs font-medium text-slate-500">
          Shell Command
          <textarea
            value={node.config.command || ''}
            onChange={(event) => updateNodeConfig(node.id, 'command', event.target.value)}
            rows={5}
            className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-amber-300"
          />
        </label>
      )}
      {normalizeWorkflowNodeType(node.type) === 'command' && (
        <CommandConfigEditor node={node} updateNodeConfig={updateNodeConfig} />
      )}
      {normalizeWorkflowNodeType(node.type) === 'llm' && (
        <LlmConfigEditor node={node} updateNodeConfig={updateNodeConfig} />
      )}
      {normalizeWorkflowNodeType(node.type) === 'if' && (
        <IfConfigEditor node={node} updateNodeConfig={updateNodeConfig} />
      )}
      {normalizeWorkflowNodeType(node.type) === 'loop' && (
        <LoopConfigEditor node={node} updateNodeConfig={updateNodeConfig} />
      )}
      {!['start', 'shell', 'command', 'llm', 'if', 'loop'].includes(normalizeWorkflowNodeType(node.type)) && (
        <CommandConfigEditor node={node} updateNodeConfig={updateNodeConfig} />
      )}
    </div>
  );
}

function CommandConfigEditor({
  node,
  updateNodeConfig,
}: {
  node: WorkflowNode;
  updateNodeConfig: (nodeId: string, key: keyof WorkflowNode['config'], value: string) => void;
}) {
  return (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-500">
            Command ID
            <input
              value={node.config.commandId || ''}
              onChange={(event) => updateNodeConfig(node.id, 'commandId', event.target.value)}
              placeholder="command id, e.g. tool.shell"
              className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Input JSON
            <textarea
              value={node.config.inputJson || '{}'}
              onChange={(event) => updateNodeConfig(node.id, 'inputJson', event.target.value)}
              rows={8}
              className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-amber-300"
            />
          </label>
        </div>
  );
}

function LlmConfigEditor({
  node,
  updateNodeConfig,
}: {
  node: WorkflowNode;
  updateNodeConfig: (nodeId: string, key: keyof WorkflowNode['config'], value: string) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-[var(--theme-radius-control)] bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        可用模板：{'{{previous.output}}'}、{'{{previous.logs}}'}、{'{{node.<id>.output}}'}、{'{{node.<id>.logs}}'}、{'{{vars.<key>}}'}
      </div>
      <label className="block text-xs font-medium text-slate-500">
        System Prompt
        <textarea
          value={node.config.systemPrompt || ''}
          onChange={(event) => updateNodeConfig(node.id, 'systemPrompt', event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        />
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Prompt
        <textarea
          value={node.config.prompt || ''}
          onChange={(event) => updateNodeConfig(node.id, 'prompt', event.target.value)}
          rows={8}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-amber-300"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-500">
          Model
          <input
            value={node.config.model || ''}
            onChange={(event) => updateNodeConfig(node.id, 'model', event.target.value)}
            placeholder="默认模型"
            className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Timeout(s)
          <input
            value={node.config.timeoutSecs || ''}
            onChange={(event) => updateNodeConfig(node.id, 'timeoutSecs', event.target.value)}
            placeholder="30"
            className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-500">
        Output Mode
        <select
          value={String(node.config.outputMode || 'text')}
          onChange={(event) => updateNodeConfig(node.id, 'outputMode', event.target.value)}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        >
          <option value="text">text</option>
          <option value="json">json</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Output Schema (Optional JSON)
        <textarea
          value={String(node.config.outputSchema || '')}
          onChange={(event) => updateNodeConfig(node.id, 'outputSchema', event.target.value)}
          rows={4}
          placeholder='{"type":"object","required":["decision"]}'
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-amber-300"
        />
      </label>
    </div>
  );
}

function IfConfigEditor({
  node,
  updateNodeConfig,
}: {
  node: WorkflowNode;
  updateNodeConfig: (nodeId: string, key: keyof WorkflowNode['config'], value: string) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-[var(--theme-radius-control)] bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        用模板取左值，例如 {'{{previous.output}}'}、{'{{node.someNode.output}}'}、{'{{vars.flag}}'}
      </div>
      <label className="block text-xs font-medium text-slate-500">
        Left Value
        <input
          value={String(node.config.leftValue || '{{previous.output}}')}
          onChange={(event) => updateNodeConfig(node.id, 'leftValue', event.target.value)}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        />
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Operator
        <select
          value={String(node.config.operator || 'equals')}
          onChange={(event) => updateNodeConfig(node.id, 'operator', event.target.value)}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        >
          <option value="equals">equals</option>
          <option value="not_equals">not_equals</option>
          <option value="contains">contains</option>
          <option value="exists">exists</option>
          <option value="greater_than">greater_than</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Right Value
        <input
          value={String(node.config.rightValue || '')}
          onChange={(event) => updateNodeConfig(node.id, 'rightValue', event.target.value)}
          placeholder="compare against"
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        />
      </label>
    </div>
  );
}

function LoopConfigEditor({
  node,
  updateNodeConfig,
}: {
  node: WorkflowNode;
  updateNodeConfig: (nodeId: string, key: keyof WorkflowNode['config'], value: string) => void;
}) {
  const mode = String(node.config.mode || 'for_each');
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-[var(--theme-radius-control)] bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        `for_each` 建议配合 body 分支回到当前 loop 节点；`repeat_until` 建议用 true/false 条件控制退出。
      </div>
      <label className="block text-xs font-medium text-slate-500">
        Mode
        <select
          value={mode}
          onChange={(event) => updateNodeConfig(node.id, 'mode', event.target.value)}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        >
          <option value="for_each">for_each</option>
          <option value="repeat_until">repeat_until</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-500">
        Max Iterations
        <input
          value={String(node.config.maxIterations || '25')}
          onChange={(event) => updateNodeConfig(node.id, 'maxIterations', event.target.value)}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
        />
      </label>
      {mode === 'for_each' ? (
        <label className="block text-xs font-medium text-slate-500">
          Items Template
          <textarea
            value={String(node.config.itemsTemplate || '[]')}
            onChange={(event) => updateNodeConfig(node.id, 'itemsTemplate', event.target.value)}
            rows={5}
            placeholder='{{node.someNode.output}} or ["a","b"]'
            className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-amber-300"
          />
        </label>
      ) : (
        <>
          <label className="block text-xs font-medium text-slate-500">
            Left Value
            <input
              value={String(node.config.leftValue || '{{previous.output}}')}
              onChange={(event) => updateNodeConfig(node.id, 'leftValue', event.target.value)}
              className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Operator
            <select
              value={String(node.config.operator || 'equals')}
              onChange={(event) => updateNodeConfig(node.id, 'operator', event.target.value)}
              className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
            >
              <option value="equals">equals</option>
              <option value="not_equals">not_equals</option>
              <option value="contains">contains</option>
              <option value="exists">exists</option>
              <option value="greater_than">greater_than</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Right Value
            <input
              value={String(node.config.rightValue || '')}
              onChange={(event) => updateNodeConfig(node.id, 'rightValue', event.target.value)}
              className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-300"
            />
          </label>
        </>
      )}
    </div>
  );
}

function suggestIfBranch(workflow: WorkflowDefinition, sourceNodeId: string) {
  const existing = workflow.edges.filter((edge) => edge.from === sourceNodeId).map((edge) => edge.branch);
  if (!existing.includes('true')) return 'true';
  if (!existing.includes('false')) return 'false';
  return 'default';
}

function suggestLoopBranch(workflow: WorkflowDefinition, sourceNodeId: string) {
  const existing = workflow.edges.filter((edge) => edge.from === sourceNodeId).map((edge) => edge.branch);
  if (!existing.includes('body')) return 'body';
  if (!existing.includes('done')) return 'done';
  return 'default';
}

import type { WorkflowDefinition, WorkflowNode } from '../types';

interface WorkflowGraphCanvasProps {
  workflow: WorkflowDefinition;
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onStartEdge: (nodeId: string) => void;
  onCompleteEdge: (nodeId: string) => void;
  edgeStartNodeId?: string;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 72;

export function WorkflowGraphCanvas({
  workflow,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onStartEdge,
  onCompleteEdge,
  edgeStartNodeId,
}: WorkflowGraphCanvasProps) {
  const nodes = workflow.nodes.map((node, index) => ({
    ...node,
    position: node.position || { x: index * 190, y: index % 2 === 0 ? 20 : 140 },
  }));
  const maxX = Math.max(...nodes.map((node) => node.position.x), 0) + NODE_WIDTH + 80;
  const maxY = Math.max(...nodes.map((node) => node.position.y), 0) + NODE_HEIGHT + 80;

  return (
    <div className="relative min-h-[360px] overflow-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <svg width={maxX} height={maxY} className="absolute left-0 top-0">
        <defs>
          <marker id="workflow-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
          </marker>
        </defs>
        {workflow.edges.map((edge) => {
          const from = nodes.find((node) => node.id === edge.from);
          const to = nodes.find((node) => node.id === edge.to);
          if (!from || !to) return null;
          const startX = from.position.x + NODE_WIDTH;
          const startY = from.position.y + NODE_HEIGHT / 2;
          const endX = to.position.x;
          const endY = to.position.y + NODE_HEIGHT / 2;
          const midX = startX + Math.max(40, (endX - startX) / 2);
          return (
            <path
              key={edge.id}
              d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              markerEnd="url(#workflow-arrow)"
            />
          );
        })}
      </svg>
      <div className="relative" style={{ width: maxX, height: maxY }}>
        {nodes.map((node) => (
          <GraphNodeCard
            key={node.id}
            node={node}
            selected={node.id === selectedNodeId}
            edgeStart={node.id === edgeStartNodeId}
            onSelect={() => onSelectNode(node.id)}
            onMove={(position) => onMoveNode(node.id, position)}
            onStartEdge={() => onStartEdge(node.id)}
            onCompleteEdge={() => onCompleteEdge(node.id)}
          />
        ))}
      </div>
    </div>
  );
}

function GraphNodeCard({
  node,
  selected,
  edgeStart,
  onSelect,
  onMove,
  onStartEdge,
  onCompleteEdge,
}: {
  node: WorkflowNode;
  selected: boolean;
  edgeStart: boolean;
  onSelect: () => void;
  onMove: (position: { x: number; y: number }) => void;
  onStartEdge: () => void;
  onCompleteEdge: () => void;
}) {
  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const originX = event.clientX;
    const originY = event.clientY;
    const startX = node.position.x;
    const startY = node.position.y;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      onMove({
        x: Math.max(0, startX + moveEvent.clientX - originX),
        y: Math.max(0, startY + moveEvent.clientY - originY),
      });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`absolute rounded-3xl border bg-white px-4 py-3 text-left shadow-sm transition-all ${
        selected ? 'border-amber-400 ring-4 ring-amber-100' : edgeStart ? 'border-sky-400 ring-4 ring-sky-100' : 'border-slate-200 hover:border-slate-300'
      }`}
      style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      <button type="button" onClick={onSelect} onPointerDown={startDrag} className="block w-full cursor-grab text-left active:cursor-grabbing">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{node.type}</div>
        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{node.title}</div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {node.type === 'shell' ? node.config.command : node.type === 'command' ? node.config.commandId : 'manual'}
        </div>
      </button>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onStartEdge}
          className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600 hover:bg-sky-100 hover:text-sky-700"
        >
          连出
        </button>
        <button
          type="button"
          onClick={onCompleteEdge}
          className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600 hover:bg-amber-100 hover:text-amber-700"
        >
          连入
        </button>
      </div>
    </div>
  );
}

import type { OrchestratorAgent, OrchestratorStage } from '../types';

interface AgentBoardProps {
  stage: OrchestratorStage | null;
  selectedAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  onAddAgentRow: (stageId: string) => void;
  onAddAgent: (stageId: string, rowId: string) => void;
  onMoveAgentRow: (stageId: string, rowId: string, direction: 'up' | 'down') => void;
  onMoveAgent: (stageId: string, rowId: string, agentId: string, direction: 'left' | 'right') => void;
  onDeleteAgent: (stageId: string, rowId: string, agentId: string) => void;
}

export function AgentBoard({
  stage,
  selectedAgentId,
  onSelectAgent,
  onAddAgentRow,
  onAddAgent,
  onMoveAgentRow,
  onMoveAgent,
  onDeleteAgent,
}: AgentBoardProps) {
  if (!stage) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        Select a stage to edit its agents.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{stage.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{stage.goal}</p>
        </div>
        <button
          className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
          onClick={() => onAddAgentRow(stage.id)}
        >
          Add Agent Row
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {stage.agentRows.map((row, index) => (
          <div key={row.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Agent Row {index + 1}</div>
              <div className="flex gap-2">
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => onMoveAgentRow(stage.id, row.id, 'up')}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => onMoveAgentRow(stage.id, row.id, 'down')}
                  disabled={index === stage.agentRows.length - 1}
                >
                  Down
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => onAddAgent(stage.id, row.id)}
                >
                  Add Agent
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {row.agents.map((agent, agentIndex) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={agent.id === selectedAgentId}
                  onClick={() => onSelectAgent(agent.id)}
                  onMoveLeft={() => onMoveAgent(stage.id, row.id, agent.id, 'left')}
                  onMoveRight={() => onMoveAgent(stage.id, row.id, agent.id, 'right')}
                  onDelete={() => onDeleteAgent(stage.id, row.id, agent.id)}
                  disableMoveLeft={agentIndex === 0}
                  disableMoveRight={agentIndex === row.agents.length - 1}
                />
              ))}
              {row.agents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-xs text-slate-500">
                  Empty row.
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentCard({
  agent,
  selected,
  onClick,
  onMoveLeft,
  onMoveRight,
  onDelete,
  disableMoveLeft,
  disableMoveRight,
}: {
  agent: OrchestratorAgent;
  selected: boolean;
  onClick: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDelete: () => void;
  disableMoveLeft: boolean;
  disableMoveRight: boolean;
}) {
  return (
    <article
      className={[
        'min-w-[220px] flex-1 rounded-2xl border p-4 text-left transition',
        selected ? 'border-slate-900 bg-slate-100' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
      ].join(' ')}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="mb-3 flex justify-end gap-2">
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
          onClick={(event) => {
            event.stopPropagation();
            onMoveLeft();
          }}
          disabled={disableMoveLeft}
        >
          Left
        </button>
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
          onClick={(event) => {
            event.stopPropagation();
            onMoveRight();
          }}
          disabled={disableMoveRight}
        >
          Right
        </button>
        <button
          className="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] text-rose-600"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
      <div className="font-medium text-slate-900">{agent.name}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{agent.role}</div>
      <p className="mt-2 text-sm text-slate-600">{agent.goal}</p>
      <div className="mt-3 text-xs text-slate-500">
        {agent.executionMode} · {agent.allowSubAgents ? 'subagent enabled' : 'single agent'}
      </div>
    </article>
  );
}

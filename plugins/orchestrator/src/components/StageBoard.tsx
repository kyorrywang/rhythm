import type { OrchestratorStage, OrchestratorTemplate } from '../types';

interface StageBoardProps {
  template: OrchestratorTemplate;
  selectedStageId?: string;
  onSelectStage: (stageId: string) => void;
  onAddRow: () => void;
  onAddStage: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
  onMoveStage: (rowId: string, stageId: string, direction: 'left' | 'right') => void;
  onDeleteStage: (rowId: string, stageId: string) => void;
}

export function StageBoard({
  template,
  selectedStageId,
  onSelectStage,
  onAddRow,
  onAddStage,
  onMoveRow,
  onMoveStage,
  onDeleteStage,
}: StageBoardProps) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-900">Stage Board</h2>
        <button
          className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
          onClick={onAddRow}
        >
          Add Stage Row
        </button>
      </div>

      <div className="mt-3 space-y-4">
        {template.stageRows.map((row, index) => (
          <div key={row.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Row {index + 1}</div>
              <div className="flex gap-2">
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => onMoveRow(row.id, 'up')}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => onMoveRow(row.id, 'down')}
                  disabled={index === template.stageRows.length - 1}
                >
                  Down
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => onAddStage(row.id)}
                >
                  Add Stage
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {row.stages.map((stage, stageIndex) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  selected={stage.id === selectedStageId}
                  onClick={() => onSelectStage(stage.id)}
                  onMoveLeft={() => onMoveStage(row.id, stage.id, 'left')}
                  onMoveRight={() => onMoveStage(row.id, stage.id, 'right')}
                  onDelete={() => onDeleteStage(row.id, stage.id)}
                  disableMoveLeft={stageIndex === 0}
                  disableMoveRight={stageIndex === row.stages.length - 1}
                />
              ))}
              {row.stages.length === 0 ? (
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

function StageCard({
  stage,
  selected,
  onClick,
  onMoveLeft,
  onMoveRight,
  onDelete,
  disableMoveLeft,
  disableMoveRight,
}: {
  stage: OrchestratorStage;
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
        'min-w-[240px] flex-1 rounded-2xl border p-4 text-left transition',
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
      <div className="font-medium text-slate-900">{stage.name}</div>
      <p className="mt-1 text-sm text-slate-600">{stage.goal}</p>
      <div className="mt-3 text-xs text-slate-500">
        {stage.agentRows.length} agent row{stage.agentRows.length === 1 ? '' : 's'}
      </div>
    </article>
  );
}

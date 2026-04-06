import { Plus, ArrowUp, Shield, ChevronDown, Square, Sparkles, Bot, BrainCircuit } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MainComposerProps, DockType } from '../types';

const PLACEHOLDER_MAP: Record<DockType, string> = {
  none: '随便问点什么...',
  append: '发送引导消息，插队到当前对话中...',
  ask: '请输入...',
};

const SUBMIT_ICON_MAP: Record<DockType, React.ReactNode> = {
  none: <ArrowUp size={16} strokeWidth={2.5} />,
  append: <Square size={13} fill="currentColor" strokeWidth={0} />,
  ask: <ArrowUp size={16} strokeWidth={2.5} />,
};

export const MainComposer = ({
  text,
  onTextChange,
  onSend,
  dockType,
  headerContent,
  controls,
  sessionPhase,
  onCycleMode,
  onCycleModel,
  onCycleReasoning,
  onToggleFullAuto,
}: MainComposerProps) => {
  const hasContent = text.trim().length > 0;
  const phaseLabel = sessionPhase === 'streaming'
    ? '运行中'
    : sessionPhase === 'streaming_with_queue'
      ? '队列中'
      : sessionPhase === 'processing_queue'
        ? '处理队列'
        : sessionPhase === 'waiting_for_permission'
          ? '等待权限'
          : sessionPhase === 'interrupting'
            ? '中断中'
            : '就绪';

  return (
    <div className="w-full max-w-[760px] mx-auto pb-6 relative z-20">
      <div className="bg-white border text-left border-slate-200 rounded-[28px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] focus-within:ring-4 focus-within:ring-amber-100/70 focus-within:border-amber-300 transition-all flex flex-col pointer-events-auto relative overflow-hidden">
        {headerContent}

        <div className="min-h-[104px] px-4 pt-4 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <Sparkles size={12} />
              <span>Composer</span>
            </div>
            <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
              {phaseLabel}
            </div>
          </div>
          <textarea
            value={text}
            className="w-full flex-1 resize-none bg-transparent outline-none text-[14px] leading-7 text-slate-800 placeholder:text-slate-400 min-h-[56px] px-1"
            placeholder={PLACEHOLDER_MAP[dockType]}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between px-4 pb-4">
          <button className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-2xl transition-colors">
            <Plus size={18} />
          </button>
          
          <button 
            onClick={onSend}
            disabled={!hasContent}
            className={cn(
              "h-10 min-w-10 px-3 flex items-center justify-center rounded-2xl transition-colors",
              hasContent
                ? "bg-slate-950 text-white hover:bg-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
                : "bg-slate-200 text-white cursor-not-allowed"
            )}
          >
            {SUBMIT_ICON_MAP[dockType]}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-[linear-gradient(180deg,#fbfaf8_0%,#f6f3ee_100%)] px-4 py-3 rounded-b-[28px] text-[12px] text-slate-500">
          <ControlChip icon={<Sparkles size={13} />} label={controls.mode} onClick={onCycleMode} />
          <ControlChip icon={<Bot size={13} />} label={controls.model} onClick={onCycleModel} />
          <ControlChip icon={<BrainCircuit size={13} />} label={controls.reasoning} onClick={onCycleReasoning} />
          <div className="flex-1" />
          <button
            onClick={onToggleFullAuto}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors',
              controls.fullAuto
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-white text-slate-500 hover:bg-slate-50',
            )}
            title="切换权限模式"
          >
            <Shield size={13} />
            <span>{controls.fullAuto ? '全部允许' : '逐次确认'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const ControlChip = ({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
  >
    {icon}
    <span>{label}</span>
    <ChevronDown size={12} />
  </button>
);

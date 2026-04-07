import * as Popover from '@radix-ui/react-popover';
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

const MODE_OPTIONS: Array<{ value: MainComposerProps['controls']['mode']; label: string; description: string }> = [
  { value: 'Chat', label: 'Chat', description: '快速问答与轻量协作' },
  { value: 'Plan', label: 'Plan', description: '先规划，再进入执行' },
  { value: 'Coordinate', label: 'Coordinate', description: '协调多步骤或子任务' },
];

const MODEL_OPTIONS = [
  { value: 'GPT-5.4', label: 'GPT-5.4', description: '默认高质量模型' },
  { value: 'GPT-5.4 Mini', label: 'GPT-5.4 Mini', description: '更快、更轻量' },
  { value: 'Claude Sonnet', label: 'Claude Sonnet', description: '备用推理模型' },
];

const REASONING_OPTIONS: Array<{ value: MainComposerProps['controls']['reasoning']; label: string; description: string }> = [
  { value: 'low', label: 'Low', description: '更快响应' },
  { value: 'medium', label: 'Medium', description: '平衡速度与思考' },
  { value: 'high', label: 'High', description: '更深入推理' },
];

export const MainComposer = ({
  text,
  onTextChange,
  onSend,
  dockType,
  headerContent,
  controls,
  sessionPhase,
  onSetMode,
  onSetModel,
  onSetReasoning,
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
    <div className="relative z-20 mx-auto w-full max-w-[808px] px-6 pb-6">
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
          <ControlPopover
            icon={<Sparkles size={13} />}
            label={controls.mode}
            title="选择模式"
            options={MODE_OPTIONS}
            value={controls.mode}
            onSelect={onSetMode}
          />
          <ControlPopover
            icon={<Bot size={13} />}
            label={controls.model}
            title="选择模型"
            options={MODEL_OPTIONS}
            value={controls.model}
            onSelect={onSetModel}
          />
          <ControlPopover
            icon={<BrainCircuit size={13} />}
            label={controls.reasoning}
            title="思考强度"
            options={REASONING_OPTIONS}
            value={controls.reasoning}
            onSelect={onSetReasoning}
          />
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

const ControlPopover = <T extends string>({
  icon,
  label,
  title,
  options,
  value,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  options: Array<{ value: T; label: string; description: string }>;
  value: T;
  onSelect: (value: T) => void;
}) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:bg-slate-50 hover:text-slate-800 data-[state=open]:bg-slate-950 data-[state=open]:text-white"
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={16}
        className="z-50 w-[260px] origin-[--radix-popover-content-transform-origin] rounded-3xl border border-slate-200 bg-white/95 p-2 text-slate-800 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl outline-none data-[state=closed]:animate-[composer-popover-out_120ms_ease-in_forwards] data-[state=open]:animate-[composer-popover-in_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
      >
        <div className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {title}
        </div>
        <div className="space-y-1">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Popover.Close asChild key={option.value}>
                <button
                  onClick={() => onSelect(option.value)}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
                    selected ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  <span>
                    <span className="block text-[13px] font-semibold">{option.label}</span>
                    <span className={cn('mt-0.5 block text-[11px] leading-5', selected ? 'text-slate-300' : 'text-slate-400')}>
                      {option.description}
                    </span>
                  </span>
                  {selected && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
                </button>
              </Popover.Close>
            );
          })}
        </div>
        <Popover.Arrow className="fill-white" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

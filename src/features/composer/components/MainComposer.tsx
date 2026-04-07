import * as Popover from '@radix-ui/react-popover';
import { useEffect, useRef } from 'react';
import { Plus, ArrowUp, Shield, ChevronDown, Square, Sparkles, Bot, BrainCircuit, FileText, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import type { ComposerModelSelection, MainComposerProps, DockType } from '../types';
import type { Attachment } from '@/shared/types/schema';

const MAX_TEXT_ATTACHMENT_SIZE = 256 * 1024;

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
  { value: 'Chat', label: 'Chat', description: '单 agent 普通对话' },
  { value: 'Coordinate', label: 'Coordinate', description: '多 agent 协同处理' },
];

const REASONING_OPTIONS: Array<{ value: MainComposerProps['controls']['reasoning']; label: string; description: string }> = [
  { value: 'low', label: 'Low', description: '更快响应' },
  { value: 'medium', label: 'Medium', description: '平衡速度与思考' },
  { value: 'high', label: 'High', description: '更深入推理' },
];

const TEXT_FILE_ACCEPT = [
  'text/*',
  '.txt',
  '.md',
  '.mdx',
  '.json',
  '.csv',
  '.log',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.rs',
  '.py',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.rb',
  '.swift',
  '.kt',
  '.kts',
  '.toml',
  '.yaml',
  '.yml',
  '.ini',
  '.env',
  '.sql',
  '.sh',
  '.ps1',
].join(',');

const TEXT_FILE_PATTERN = /\.(txt|md|mdx|json|csv|log|xml|html|css|js|jsx|ts|tsx|rs|py|go|java|c|cpp|h|hpp|cs|php|rb|swift|kt|kts|toml|yaml|yml|ini|env|sql|sh|ps1)$/i;

const isTextFile = (file: File) =>
  file.type.startsWith('text/') || file.type === 'application/json' || TEXT_FILE_PATTERN.test(file.name);

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const createAttachment = async (file: File): Promise<Attachment | null> => {
  const base = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
  };

  if (file.type.startsWith('image/')) {
    const dataUrl = await readAsDataUrl(file);
    return { ...base, kind: 'image', dataUrl, previewUrl: dataUrl };
  }

  if (file.size <= MAX_TEXT_ATTACHMENT_SIZE && isTextFile(file)) {
    return { ...base, kind: 'file', text: await readAsText(file) };
  }

  return null;
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export const MainComposer = ({
  text,
  onTextChange,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
  dockType,
  headerContent,
  controls,
  modelGroups,
  sessionPhase,
  onSetMode,
  onSetModel,
  onSetReasoning,
  onToggleFullAuto,
  onInterrupt,
}: MainComposerProps) => {
  const hasContent = text.trim().length > 0;
  const canSubmit = hasContent || attachments.length > 0;
  const isBusy = sessionPhase !== 'idle';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [text]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const nextAttachments = (await Promise.all(files.map(createAttachment))).filter(
      (attachment): attachment is Attachment => attachment !== null,
    );
    onAddAttachments(nextAttachments);
  };

  return (
    <div className="relative z-20 mx-auto w-full max-w-[868px] px-6 pb-3">
      <div className="bg-white border text-left border-slate-200 rounded-[28px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] focus-within:ring-4 focus-within:ring-amber-100/70 focus-within:border-amber-300 transition-all flex flex-col pointer-events-auto relative overflow-hidden">
        {headerContent}

        <div
          className="cursor-text px-4 pb-2 pt-3"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button,input,[role="button"]')) return;
            textareaRef.current?.focus();
          }}
        >
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="group relative flex max-w-[220px] items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                  {attachment.kind === 'image' && attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt={attachment.name} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400">
                      <FileText size={15} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">{attachment.name}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">{formatFileSize(attachment.size)}</span>
                  </span>
                  <Button
                    variant="unstyled"
                    size="none"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                    title="移除附件"
                  >
                    <X size={11} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            className="max-h-[180px] min-h-7 w-full resize-none overflow-y-auto bg-transparent px-1 text-[14px] leading-7 text-slate-800 outline-none placeholder:text-slate-400"
            placeholder={PLACEHOLDER_MAP[dockType]}
            onChange={(e) => onTextChange(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length === 0) return;
              e.preventDefault();
              void handleFiles(files);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isBusy) {
                  onSend();
                }
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="unstyled"
                size="none"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                title="上传文本文件"
              >
                <Plus size={18} />
              </Button>
              <Button
                variant="unstyled"
                size="none"
                onClick={() => imageInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                title="上传图片"
              >
                <ImageIcon size={17} />
              </Button>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                void handleFiles(files);
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={TEXT_FILE_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                void handleFiles(files);
              }}
            />

            <Button
              variant="unstyled"
              size="none"
              onClick={isBusy ? onInterrupt : onSend}
              disabled={!isBusy && !canSubmit}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                canSubmit || isBusy
                  ? "bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] hover:bg-slate-800"
                  : "cursor-not-allowed bg-slate-200 text-white",
                isBusy ? 'ring-2 ring-amber-100' : '',
              )}
            >
              {isBusy ? <Square size={13} fill="currentColor" strokeWidth={0} /> : SUBMIT_ICON_MAP[dockType]}
            </Button>
          </div>
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
          <ModelPopover
            icon={<Bot size={13} />}
            label={controls.modelName || '无可用模型'}
            title="选择模型"
            groups={modelGroups}
            value={{ providerId: controls.providerId, modelId: controls.modelId, modelName: controls.modelName }}
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
          <Button
            variant="unstyled"
            size="none"
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
          </Button>
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
      <Button
        variant="unstyled"
        size="none"
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:bg-slate-50 hover:text-slate-800 data-[state=open]:bg-slate-950 data-[state=open]:text-white"
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
      </Button>
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
                <Button
                  variant="unstyled"
                  size="none"
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
                </Button>
              </Popover.Close>
            );
          })}
        </div>
        <Popover.Arrow className="fill-white" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

const ModelPopover = ({
  icon,
  label,
  title,
  groups,
  value,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  groups: MainComposerProps['modelGroups'];
  value: ComposerModelSelection;
  onSelect: (value: ComposerModelSelection) => void;
}) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <Button
        variant="unstyled"
        size="none"
        disabled={groups.length === 0}
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:bg-slate-950 data-[state=open]:text-white"
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
      </Button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={16}
        className="z-50 w-[300px] origin-[--radix-popover-content-transform-origin] rounded-3xl border border-slate-200 bg-white/95 p-2 text-slate-800 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl outline-none data-[state=closed]:animate-[composer-popover-out_120ms_ease-in_forwards] data-[state=open]:animate-[composer-popover-in_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
      >
        <div className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {title}
        </div>
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.providerId}>
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {group.providerName}
              </div>
              <div className="space-y-1">
                {group.models.map((model) => {
                  const selected = group.providerId === value.providerId && model.id === value.modelId;
                  return (
                    <Popover.Close asChild key={`${group.providerId}:${model.id}`}>
                      <Button
                        variant="unstyled"
                        size="none"
                        onClick={() => onSelect({ providerId: group.providerId, modelId: model.id, modelName: model.name })}
                        className={cn(
                          'flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
                          selected ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100',
                        )}
                      >
                        <span>
                          <span className="block text-[13px] font-semibold">{model.name}</span>
                          {(model.note || model.isDefault) && (
                            <span className={cn('mt-0.5 block text-[11px] leading-5', selected ? 'text-slate-300' : 'text-slate-400')}>
                              {model.isDefault ? '默认模型' : model.note}
                            </span>
                          )}
                        </span>
                        {selected && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
                      </Button>
                    </Popover.Close>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Popover.Arrow className="fill-white" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

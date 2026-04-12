import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ArrowUp, Shield, ChevronDown, Square, Sparkles, Bot, BrainCircuit, FileText, Image as ImageIcon, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { themeRecipes } from '@/ui/theme/recipes';
import { Button, MenuContent, MenuItem, MenuPortal, MenuRoot, MenuSub, MenuSubmenuContent, MenuSubmenuTrigger, MenuTrigger, PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '@/ui/components';
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
  runtimeState,
  queueState,
  onSetMode,
  onSetModel,
  onSetReasoning,
  onToggleFullAuto,
  onInterrupt,
}: MainComposerProps) => {
  const hasContent = text.trim().length > 0;
  const canSubmit = hasContent || attachments.length > 0;
  const isBusy = Boolean(
    queueState && queueState !== 'idle'
    || runtimeState
    && !['idle', 'completed', 'failed', 'interrupted', 'waiting_for_user'].includes(runtimeState),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [isCompactControls, setIsCompactControls] = useState(false);
  const runtimeProfiles = useSettingsStore((state) => state.settings.runtimeProfiles ?? []);
  const modeOptions = useMemo(() =>
    runtimeProfiles.map((profile) => ({
      value: profile.mode,
      label: profile.label,
      description: profile.description,
    })),
  [runtimeProfiles]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [text]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      setIsCompactControls(entry.contentRect.width < 640);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const nextAttachments = (await Promise.all(files.map(createAttachment))).filter(
      (attachment): attachment is Attachment => attachment !== null,
    );
    onAddAttachments(nextAttachments);
  };

  return (
    <div ref={composerRef} className="relative z-20 mx-auto w-full max-w-[868px] px-6 pb-3">
      <div className={`text-left ${themeRecipes.workbenchSurface()} focus-within:border-[var(--theme-accent)] focus-within:ring-4 focus-within:ring-[color:color-mix(in_srgb,var(--theme-accent)_12%,transparent)] transition-all flex flex-col pointer-events-auto relative overflow-hidden`}>
        {headerContent}

        <div
          className="cursor-text px-[var(--theme-panel-padding-x)] pb-[calc(var(--theme-panel-padding-y)*0.4)] pt-[calc(var(--theme-panel-padding-y)*0.5)]"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button,input,[role="button"]')) return;
            textareaRef.current?.focus();
          }}
        >
          {attachments.length > 0 && (
            <div className="mb-[calc(var(--theme-toolbar-gap)*0.5)] flex flex-wrap gap-[var(--theme-toolbar-gap)]">
              {attachments.map((attachment) => (
                <div key={attachment.id} className={`group relative flex max-w-[220px] items-center gap-[var(--theme-toolbar-gap)] ${themeRecipes.mutedCard()} px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.75)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)]`}>
                  {attachment.kind === 'image' && attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt={attachment.name} className="h-9 w-9 shrink-0 rounded-[var(--theme-radius-control)] object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-[var(--theme-surface)] text-[var(--theme-text-muted)]">
                      <FileText size={15} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className={`block truncate ${themeRecipes.sectionTitle()}`}>{attachment.name}</span>
                    <span className="mt-0.5 block text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">{formatFileSize(attachment.size)}</span>
                  </span>
                  <Button
                    variant="unstyled"
                    size="none"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-[var(--theme-radius-control)] bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
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
            className="max-h-[180px] min-h-7 w-full resize-none overflow-y-auto bg-transparent px-1 text-[length:var(--theme-body-size)] leading-7 text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-muted)]"
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
          <div className="mt-[calc(var(--theme-toolbar-gap)*0.4)] flex items-center justify-between">
            <div className={themeRecipes.toolbar()}>
              <Button
                variant="unstyled"
                size="none"
                onClick={() => fileInputRef.current?.click()}
                className={themeRecipes.iconButton()}
                title="上传文本文件"
              >
                <Plus size={18} />
              </Button>
              <Button
                variant="unstyled"
                size="none"
                onClick={() => imageInputRef.current?.click()}
                className={themeRecipes.iconButton()}
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
                "flex h-[var(--theme-icon-button-size)] w-[var(--theme-icon-button-size)] items-center justify-center rounded-[var(--theme-radius-control)] transition-colors",
                canSubmit || isBusy
                  ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[var(--theme-shadow-soft)] hover:bg-[var(--theme-accent-hover)]"
                  : "cursor-not-allowed bg-[var(--theme-border)] text-[var(--theme-accent-contrast)]",
                isBusy ? 'ring-2 ring-[color:color-mix(in_srgb,var(--theme-accent)_15%,transparent)]' : '',
              )}
            >
              {isBusy ? <Square size={13} fill="currentColor" strokeWidth={0} /> : SUBMIT_ICON_MAP[dockType]}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[var(--theme-toolbar-gap)] border-t-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-panel-bg)_0%,var(--theme-shell-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.45)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)]">
          {isCompactControls ? (
            <CompactControlsPopover
              mode={controls.mode}
              reasoning={controls.reasoning}
              modelGroups={modelGroups}
              selectedModel={{ providerId: controls.providerId, modelId: controls.modelId, modelName: controls.modelName }}
              onSetMode={onSetMode}
              onSetModel={onSetModel}
              onSetReasoning={onSetReasoning}
            />
          ) : (
            <>
              <ControlPopover
                icon={<Sparkles size={13} />}
                label={controls.mode}
                title="选择模式"
                options={modeOptions.length > 0 ? modeOptions : [{ value: 'Chat', label: 'Chat', description: '单 agent 普通对话' }]}
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
            </>
          )}
          <div className="flex-1" />
          <Button
            variant="unstyled"
            size="none"
            onClick={onToggleFullAuto}
            className={cn(
              'inline-flex min-h-[var(--theme-control-height-sm)] items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-control)] px-[var(--theme-control-padding-x-sm)] transition-colors',
              controls.fullAuto
                ? 'bg-[var(--theme-success-surface)] text-[var(--theme-success-text)]'
                : 'bg-[var(--theme-surface)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]',
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

const CompactControlsPopover = ({
  mode,
  reasoning,
  modelGroups,
  selectedModel,
  onSetMode,
  onSetModel,
  onSetReasoning,
}: {
  mode: MainComposerProps['controls']['mode'];
  reasoning: MainComposerProps['controls']['reasoning'];
  modelGroups: MainComposerProps['modelGroups'];
  selectedModel: ComposerModelSelection;
  onSetMode: (mode: MainComposerProps['controls']['mode']) => void;
  onSetModel: (model: ComposerModelSelection) => void;
  onSetReasoning: (reasoning: MainComposerProps['controls']['reasoning']) => void;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const runtimeProfiles = useSettingsStore((state) => state.settings.runtimeProfiles ?? []);
  const modeOptions = useMemo(() =>
    runtimeProfiles.map((profile) => ({
      value: profile.mode,
      label: profile.label,
      description: profile.description,
    })),
  [runtimeProfiles]);

  return (
    <MenuRoot
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          triggerRef.current?.blur();
        }
      }}
    >
      <MenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="unstyled"
          size="none"
          className={cn(themeRecipes.chipToggle(), 'focus:ring-0')}
        >
          <SlidersHorizontal size={13} />
          <span>Controls</span>
          <ChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
        </Button>
      </MenuTrigger>
      <MenuPortal>
        <MenuContent
          align="start"
          sideOffset={10}
          collisionPadding={16}
          className="w-48"
        >
          <MenuSub>
            <MenuSubmenuTrigger icon={<Sparkles size={13} />}>
              Mode
            </MenuSubmenuTrigger>
            <MenuPortal>
              <MenuSubmenuContent>
                {modeOptions.map((option) => (
                  <MenuItem
                    key={option.value}
                    onSelect={() => onSetMode(option.value)}
                    className={option.value === mode ? 'bg-[var(--theme-menu-item-hover-bg)] text-[var(--theme-menu-item-hover-text)]' : undefined}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </MenuSubmenuContent>
            </MenuPortal>
          </MenuSub>

          <MenuSub>
            <MenuSubmenuTrigger icon={<Bot size={13} />}>
              Model
            </MenuSubmenuTrigger>
            <MenuPortal>
              <MenuSubmenuContent className="w-56">
                {modelGroups.length === 0 ? (
                  <MenuItem disabled>无可用模型</MenuItem>
                ) : (
                  modelGroups.flatMap((group) =>
                    group.models.map((model) => {
                      const selected = group.providerId === selectedModel.providerId && model.id === selectedModel.modelId;
                      return (
                        <MenuItem
                          key={`${group.providerId}:${model.id}`}
                          onSelect={() => onSetModel({ providerId: group.providerId, modelId: model.id, modelName: model.name })}
                          className={selected ? 'bg-[var(--theme-menu-item-hover-bg)] text-[var(--theme-menu-item-hover-text)]' : undefined}
                        >
                          {group.providerName} / {model.name}
                        </MenuItem>
                      );
                    }),
                  )
                )}
              </MenuSubmenuContent>
            </MenuPortal>
          </MenuSub>

          <MenuSub>
            <MenuSubmenuTrigger icon={<BrainCircuit size={13} />}>
              Reasoning
            </MenuSubmenuTrigger>
            <MenuPortal>
              <MenuSubmenuContent>
                {REASONING_OPTIONS.map((option) => (
                  <MenuItem
                    key={option.value}
                    onSelect={() => onSetReasoning(option.value)}
                    className={option.value === reasoning ? 'bg-[var(--theme-menu-item-hover-bg)] text-[var(--theme-menu-item-hover-text)]' : undefined}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </MenuSubmenuContent>
            </MenuPortal>
          </MenuSub>
        </MenuContent>
      </MenuPortal>
    </MenuRoot>
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
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          triggerRef.current?.blur();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="unstyled"
          size="none"
          className={cn(themeRecipes.chipToggle(), 'focus:ring-0')}
        >
          {icon}
          <span>{label}</span>
          <ChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={10}
          collisionPadding={16}
          className="w-[var(--theme-popover-width-sm)]"
        >
          <div className={themeRecipes.floatingHeader()}>
            <div className={themeRecipes.eyebrow()}>{title}</div>
          </div>
          <div className="space-y-[var(--theme-floating-item-gap)]">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <PopoverClose asChild key={option.value}>
                  <Button
                    variant="unstyled"
                    size="none"
                    onClick={() => onSelect(option.value)}
                    className={themeRecipes.selectionRow(selected)}
                  >
                    <span>
                      <span className={themeRecipes.selectionTitle()}>{option.label}</span>
                      <span className={themeRecipes.selectionDescription(selected)}>{option.description}</span>
                    </span>
                    {selected && <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', themeRecipes.selectionIndicator(true))} />}
                  </Button>
                </PopoverClose>
              );
            })}
          </div>
          <PopoverArrow />
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  );
};

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
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          triggerRef.current?.blur();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="unstyled"
          size="none"
          disabled={groups.length === 0}
          className={cn(themeRecipes.chipToggle(), 'focus:ring-0')}
        >
          {icon}
          <span>{label}</span>
          <ChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={10}
          collisionPadding={16}
          className="w-[var(--theme-popover-width-md)]"
        >
          <div className={themeRecipes.floatingHeader()}>
            <div className={themeRecipes.eyebrow()}>{title}</div>
          </div>
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.providerId}>
                <div className={themeRecipes.floatingGroupLabel()}>
                  {group.providerName}
                </div>
                <div className="space-y-[var(--theme-floating-item-gap)]">
                  {group.models.map((model) => {
                    const selected = group.providerId === value.providerId && model.id === value.modelId;
                    return (
                      <PopoverClose asChild key={`${group.providerId}:${model.id}`}>
                        <Button
                          variant="unstyled"
                          size="none"
                          onClick={() => onSelect({ providerId: group.providerId, modelId: model.id, modelName: model.name })}
                          className={themeRecipes.selectionRow(selected)}
                        >
                          <span>
                            <span className={themeRecipes.selectionTitle()}>{model.name}</span>
                            {model.note && (
                              <span className={themeRecipes.selectionDescription(selected)}>
                                {model.note}
                              </span>
                            )}
                          </span>
                          {selected && <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', themeRecipes.selectionIndicator(true))} />}
                        </Button>
                      </PopoverClose>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <PopoverArrow />
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  );
};

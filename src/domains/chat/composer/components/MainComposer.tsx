import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ArrowUp, Shield, ChevronDown, Square, Sparkles, Bot, BrainCircuit, FileText, Image as ImageIcon, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { themeRecipes } from '@/ui/theme/recipes';
import { Button, MenuContent, MenuItem, MenuPortal, MenuRoot, MenuSub, MenuSubmenuContent, MenuSubmenuTrigger, MenuTrigger, PopoverArrow, PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '@/ui/components';
import type { ComposerModelSelection, MainComposerProps, DockType } from '../types';
import type { Attachment } from '@/shared/types/schema';
import type { BackendAgent } from '@/shared/types/api';

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

function resolveAgentById(primaryAgents: BackendAgent[], agentId: string) {
  return primaryAgents.find((agent) => agent.id === agentId) || null;
}

function getVisibleAgentOptions(primaryAgents: BackendAgent[]) {
  return primaryAgents.map((agent) => ({
    value: agent.id,
    label: agent.label,
    description: agent.description,
  }));
}

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
  slashState,
  activeSlashCommand,
  runtimeState,
  queueState,
  onSetAgentId,
  onSetModel,
  onSetReasoning,
  onToggleFullAuto,
  onInterrupt,
  onSlashNavigate,
  onSlashConfirm,
  onSlashClose,
  onClearActiveSlashCommand,
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
  const agents = useSettingsStore((state) => state.settings.agents ?? []);
  const primaryAgents = useMemo(
    () => agents.filter((agent) => agent.kinds.includes('primary')),
    [agents],
  );
  const agentOptions = useMemo(() => getVisibleAgentOptions(primaryAgents), [primaryAgents]);
  const activeAgent = useMemo(
    () => resolveAgentById(primaryAgents, controls.agentId),
    [primaryAgents, controls.agentId],
  );
  const isLockedMode = Boolean(activeAgent?.permissions.locked);

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
        {activeSlashCommand && (
          <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-panel-bg)_0%,var(--theme-shell-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.48)]">
            <div className="flex items-center justify-between gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-accent)] bg-[color:color-mix(in_srgb,var(--theme-accent)_10%,var(--theme-panel-bg))] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.85)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)]">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[var(--theme-text-primary)]">
                  /{activeSlashCommand.name}
                </span>
                <span className="mt-0.5 block truncate opacity-80">
                  {activeSlashCommand.contextPolicy === 'exclude' ? 'BTW 模式：消息会显示在会话里，但不计入正常上下文' : activeSlashCommand.description}
                </span>
              </span>
              <Button
                variant="unstyled"
                size="none"
                onClick={onClearActiveSlashCommand}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] text-[var(--theme-text-muted)] transition-colors hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]"
                title="退出该命令模式"
              >
                <X size={14} />
              </Button>
            </div>
          </div>
        )}
        {slashState?.active && (
          <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-panel-bg)_0%,var(--theme-shell-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.55)]">
            <div className="flex items-center justify-between px-1 text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">
              <span className={themeRecipes.eyebrow()}>Commands</span>
              <span>{slashState.query ? `/${slashState.query}` : '输入命令名称或描述'}</span>
            </div>
            {slashState.commands.length > 0 ? (
              <div className="mt-[calc(var(--theme-toolbar-gap)*0.8)] space-y-[calc(var(--theme-toolbar-gap)*0.55)]">
                {slashState.commands.map((command, index) => {
                  const selected = index === slashState.selectedIndex;
                  return (
                    <button
                      key={`${command.provider.type}:${command.provider.id}:${command.name}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onTextChange(`/${command.name}`);
                      }}
                      className={cn(
                        'flex w-full items-start justify-between gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.95)] text-left transition-colors',
                        selected
                          ? 'border-[var(--theme-accent)] bg-[color:color-mix(in_srgb,var(--theme-accent)_10%,var(--theme-panel-bg))] text-[var(--theme-text-primary)]'
                          : 'border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-border-strong)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          /{command.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] opacity-80">
                          {command.title || command.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] opacity-65">
                        {command.provider.type === 'builtin' ? 'builtin' : command.provider.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-[calc(var(--theme-toolbar-gap)*0.8)] rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*1.2)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">
                没有匹配的命令
              </div>
            )}
          </div>
        )}

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
              if (slashState?.active) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  onSlashNavigate?.('down');
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  onSlashNavigate?.('up');
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onSlashClose?.();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isBusy) {
                    onSlashConfirm?.();
                  }
                  return;
                }
              }

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
              agentId={controls.agentId}
              reasoning={controls.reasoning}
              modelGroups={modelGroups}
              selectedModel={{ providerId: controls.providerId, modelId: controls.modelId, modelName: controls.modelName }}
              onSetAgentId={onSetAgentId}
              onSetModel={onSetModel}
              onSetReasoning={onSetReasoning}
            />
          ) : (
            <>
              <ControlPopover
                icon={<Sparkles size={13} />}
                label={activeAgent?.label || controls.agentId}
                title="选择助手"
                options={agentOptions}
                value={controls.agentId}
                onSelect={onSetAgentId}
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
            onClick={isLockedMode ? undefined : onToggleFullAuto}
            disabled={isLockedMode}
            className={cn(
              'inline-flex min-h-[var(--theme-control-height-sm)] items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-control)] px-[var(--theme-control-padding-x-sm)] transition-colors',
              isLockedMode
                ? 'cursor-not-allowed bg-[var(--theme-surface)] text-[var(--theme-text-muted)] opacity-80'
                : controls.fullAuto
                ? 'bg-[var(--theme-success-surface)] text-[var(--theme-success-text)]'
                : 'bg-[var(--theme-surface)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]',
            )}
            title={isLockedMode ? '当前模式使用锁定权限' : '切换权限模式'}
          >
            <Shield size={13} />
            <span>{isLockedMode ? '锁定权限' : controls.fullAuto ? '全部允许' : '逐次确认'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

const CompactControlsPopover = ({
  agentId,
  reasoning,
  modelGroups,
  selectedModel,
  onSetAgentId,
  onSetModel,
  onSetReasoning,
}: {
  agentId: string;
  reasoning: MainComposerProps['controls']['reasoning'];
  modelGroups: MainComposerProps['modelGroups'];
  selectedModel: ComposerModelSelection;
  onSetAgentId: (agentId: string) => void;
  onSetModel: (model: ComposerModelSelection) => void;
  onSetReasoning: (reasoning: MainComposerProps['controls']['reasoning']) => void;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const agents = useSettingsStore((state) => state.settings.agents ?? []);
  const primaryAgents = useMemo(
    () => agents.filter((agent) => agent.kinds.includes('primary')),
    [agents],
  );
  const agentOptions = useMemo(() => getVisibleAgentOptions(primaryAgents), [primaryAgents]);

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
              Agent
            </MenuSubmenuTrigger>
            <MenuPortal>
              <MenuSubmenuContent>
                {agentOptions.map((option) => (
                  <MenuItem
                    key={option.value}
                    onSelect={() => onSetAgentId(option.value)}
                    className={option.value === agentId ? 'bg-[var(--theme-menu-item-hover-bg)] text-[var(--theme-menu-item-hover-text)]' : undefined}
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

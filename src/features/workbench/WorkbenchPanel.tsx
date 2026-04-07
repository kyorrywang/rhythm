import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Box, ExternalLink, FileText, Globe, GitCompareArrows, PanelLeftClose, PanelLeftOpen, RefreshCw, ScrollText, X } from 'lucide-react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { Button } from '@/shared/ui/Button';
import { PluginWorkbench } from './PluginWorkbench';
import { SettingsWorkbench, type SettingsSection } from './SettingsWorkbench';

type WorkbenchState = NonNullable<ReturnType<typeof useSessionStore.getState>['workbench']>;
type WorkbenchItem = WorkbenchState['items'][number];

export const WorkbenchPanel = () => {
  const workbench = useSessionStore((s) => s.workbench);
  const closeWorkbench = useSessionStore((s) => s.closeWorkbench);
  const closeWorkbenchItem = useSessionStore((s) => s.closeWorkbenchItem);
  const setActiveWorkbenchItem = useSessionStore((s) => s.setActiveWorkbenchItem);
  const setWorkbenchLayoutMode = useSessionStore((s) => s.setWorkbenchLayoutMode);
  const plugins = usePluginStore((s) => s.plugins);
  const [webRefreshSeed, setWebRefreshSeed] = useState(0);

  if (!workbench || workbench.items.length === 0) return null;
  const activeItem = workbench.items.find((item) => item.id === workbench.activeItemId) || workbench.items[workbench.items.length - 1];
  const isFocus = workbench.layoutMode === 'focus';

  return (
    <aside className={`flex h-full shrink-0 flex-col border-r border-slate-200 bg-[linear-gradient(180deg,#fcfcfb_0%,#f4f6f8_100%)] ${isFocus ? 'w-[48%]' : 'w-[380px]'}`}>
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              <Box size={14} />
              <span>Workbench</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-slate-900">{activeItem.title}</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="unstyled"
              size="none"
              onClick={() => setWorkbenchLayoutMode(isFocus ? 'split' : 'focus')}
              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
              title={isFocus ? '切换为 split' : '切换为 focus'}
            >
              {isFocus ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </Button>
            <Button
              variant="unstyled"
              size="none"
              onClick={closeWorkbench}
              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {workbench.items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                item.id === activeItem.id ? 'border-slate-300 bg-white text-slate-900' : 'border-transparent bg-slate-100 text-slate-500'
              }`}
            >
              <Button variant="unstyled" size="none" onClick={() => setActiveWorkbenchItem(item.id)} className="truncate">
                {item.title}
              </Button>
              <Button variant="unstyled" size="none" onClick={() => closeWorkbenchItem(item.id)} className="text-slate-400 hover:text-slate-700">
                <X size={12} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 py-5">
        <div className="h-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              {iconForMode(activeItem.mode)}
              <span>{modeLabel(activeItem.mode)}</span>
            </div>
            <WorkbenchToolbar item={activeItem} onRefresh={() => setWebRefreshSeed((v) => v + 1)} />
          </div>
          <div className="h-[calc(100%-53px)] overflow-hidden">
            {renderWorkbenchContent(activeItem, webRefreshSeed, plugins)}
          </div>
        </div>
      </div>
    </aside>
  );
};

const WorkbenchToolbar = ({ item, onRefresh }: { item: WorkbenchItem; onRefresh: () => void }) => {
  return (
    <div className="flex items-center gap-1">
      {item.mode === 'web' && item.meta?.url && (
        <>
          <Button
            variant="unstyled"
            size="none"
            onClick={onRefresh}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="刷新"
          >
            <RefreshCw size={14} />
          </Button>
          <Button
            variant="unstyled"
            size="none"
            onClick={() => openUrl(item.meta!.url!)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="在浏览器中打开"
          >
            <ExternalLink size={14} />
          </Button>
        </>
      )}
    </div>
  );
};

function iconForMode(mode: WorkbenchItem['mode']) {
  switch (mode) {
    case 'file':
      return <FileText size={14} />;
    case 'diff':
      return <GitCompareArrows size={14} />;
    case 'web':
      return <Globe size={14} />;
    default:
      return <ScrollText size={14} />;
  }
}

function modeLabel(mode: WorkbenchItem['mode']) {
  switch (mode) {
    case 'plugin':
      return '插件详情';
    case 'settings':
      return '设置详情';
    case 'file':
      return '文件预览';
    case 'diff':
      return 'Diff 视图';
    case 'web':
      return '网页预览';
    case 'task':
      return '任务输出';
    default:
      return 'Workbench';
  }
}

function renderWorkbenchContent(item: WorkbenchItem, webRefreshSeed: number, plugins: ReturnType<typeof usePluginStore.getState>['plugins']) {
  if (item.mode === 'plugin') {
    const plugin = plugins.find((entry) => entry.name === item.meta?.summary || entry.name === item.title);
    if (plugin) return <PluginWorkbench plugin={plugin} />;
  }

  if (item.mode === 'settings') {
    const section = (item.meta?.summary || 'frontend') as SettingsSection;
    return <SettingsWorkbench section={section} />;
  }

  if (item.mode === 'file') {
    return (
      <div className="h-full overflow-auto px-5 py-4">
        {item.meta?.path && (
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">Path: {item.meta.path}</div>
        )}
        <pre className="min-h-full whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
          {item.content || '暂无文件内容'}
        </pre>
      </div>
    );
  }

  if (item.mode === 'diff') {
    return (
      <div className="h-full overflow-auto px-5 py-4">
        {item.meta?.path && (
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">Diff: {item.meta.path}</div>
        )}
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <pre className="text-xs leading-6">
            {(item.content || '暂无变更').split('\n').map((line, index) => {
              const tone = line.startsWith('+')
                ? 'bg-emerald-50 text-emerald-700'
                : line.startsWith('-')
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-slate-950 text-slate-100';
              return (
                <div key={`${index}-${line}`} className={`px-4 py-0.5 whitespace-pre-wrap ${tone}`}>
                  {line || ' '}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    );
  }

  if (item.mode === 'web') {
    return (
      <div className="h-full overflow-hidden">
        {item.meta?.url ? (
          <iframe key={`${item.meta.url}:${webRefreshSeed}`} src={item.meta.url} title={item.title} className="h-full w-full border-0 bg-white" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">没有可预览的地址</div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <p className="text-sm leading-6 text-slate-600">
        {item.description || '这里会在后续阶段接入真实详情视图。当前先作为 Workbench 占位。'}
      </p>
      {item.meta?.path && <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-500">Path: {item.meta.path}</div>}
      {item.meta?.url && <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-500">URL: {item.meta.url}</div>}
      {item.content && (
        <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
          {item.content}
        </pre>
      )}
    </div>
  );
}

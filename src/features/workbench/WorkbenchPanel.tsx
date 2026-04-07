import { Box, PanelLeftClose, PanelLeftOpen, ScrollText, X } from 'lucide-react';
import { createPluginContext } from '@/plugin-host/createPluginContext';
import { PluginErrorBoundary } from '@/plugin-host/PluginErrorBoundary';
import { usePluginHostStore } from '@/plugin-host/usePluginHostStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { Button } from '@/shared/ui/Button';

type WorkbenchState = NonNullable<ReturnType<typeof useSessionStore.getState>['workbench']>;

export const WorkbenchPanel = () => {
  const workbench = useSessionStore((s) => s.workbench);
  const closeWorkbench = useSessionStore((s) => s.closeWorkbench);
  const closeWorkbenchItem = useSessionStore((s) => s.closeWorkbenchItem);
  const setActiveWorkbenchItem = useSessionStore((s) => s.setActiveWorkbenchItem);
  const setWorkbenchLayoutMode = useSessionStore((s) => s.setWorkbenchLayoutMode);
  const workbenchViews = usePluginHostStore((s) => s.workbenchViews);

  if (!workbench || workbench.items.length === 0) return null;
  const activeItem = workbench.items.find((item) => item.id === workbench.activeItemId) || workbench.items[workbench.items.length - 1];
  const view = workbenchViews[activeItem.viewType];
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

        <WorkbenchTabs
          workbench={workbench}
          activeItemId={activeItem.id}
          onActivate={setActiveWorkbenchItem}
          onClose={closeWorkbenchItem}
        />
      </div>

      <div className="flex-1 overflow-hidden px-4 py-5">
        <div className="h-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              <ScrollText size={14} />
              <span>{view?.title || activeItem.viewType}</span>
            </div>
          </div>
          <div className="h-[calc(100%-53px)] overflow-hidden">
            {view ? (
              <PluginErrorBoundary pluginId={view.pluginId || activeItem.pluginId} surface={activeItem.viewType}>
                <view.component
                  ctx={createPluginContext(view.pluginId || activeItem.pluginId)}
                  title={activeItem.title}
                  description={activeItem.description}
                  payload={activeItem.payload}
                />
              </PluginErrorBoundary>
            ) : (
              <MissingWorkbenchView item={activeItem} />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

const WorkbenchTabs = ({
  workbench,
  activeItemId,
  onActivate,
  onClose,
}: {
  workbench: WorkbenchState;
  activeItemId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) => (
  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
    {workbench.items.map((item) => (
      <div
        key={item.id}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
          item.id === activeItemId ? 'border-slate-300 bg-white text-slate-900' : 'border-transparent bg-slate-100 text-slate-500'
        }`}
      >
        <Button variant="unstyled" size="none" onClick={() => onActivate(item.id)} className="truncate">
          {item.title}
        </Button>
        <Button variant="unstyled" size="none" onClick={() => onClose(item.id)} className="text-slate-400 hover:text-slate-700">
          <X size={12} />
        </Button>
      </div>
    ))}
  </div>
);

const MissingWorkbenchView = ({ item }: { item: WorkbenchState['items'][number] }) => (
  <div className="h-full overflow-auto px-5 py-4">
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Missing Plugin View</div>
      <h3 className="mt-2 text-base font-semibold text-slate-900">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        没有插件注册 `{item.viewType}` 这个 Workbench view。插件未加载或 view id 不匹配。
      </p>
    </div>
  </div>
);

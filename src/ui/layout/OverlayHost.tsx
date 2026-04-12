import { PanelRightClose, X } from 'lucide-react';
import { createPluginContext } from '@/core/plugin/host/createPluginContext';
import { PluginErrorBoundary } from '@/core/plugin/host/PluginErrorBoundary';
import { usePluginHostStore } from '@/core/plugin/host/usePluginHostStore';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { themeRecipes } from '@/ui/theme/recipes';
import { EmptyState, IconButton } from '@/ui/components';

export const OverlayHost = () => {
  const overlay = useSessionStore((s) => s.overlay);
  const closeOverlay = useSessionStore((s) => s.closeOverlay);
  const overlayViews = usePluginHostStore((s) => s.overlayViews);

  if (!overlay) return null;

  const view = overlayViews[overlay.viewType];
  const View = view?.component;
  const pluginId = view?.pluginId || overlay.pluginId;
  const isModal = overlay.kind === 'modal';

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div className={`absolute inset-0 ${themeRecipes.overlayBackdrop()} ${isModal ? 'backdrop-blur-[1px]' : ''}`} onClick={closeOverlay} />
      <div
        className={
          isModal
            ? `pointer-events-auto absolute left-1/2 top-1/2 h-[min(80vh,720px)] w-[min(90vw,860px)] -translate-x-1/2 -translate-y-1/2 ${themeRecipes.overlaySurface('modal')}`
            : `pointer-events-auto absolute inset-y-0 right-0 w-[min(40vw,520px)] min-w-[360px] ${themeRecipes.overlaySurface('drawer')}`
        }
      >
        <div className="flex items-center justify-between border-b-[var(--theme-divider-width)] border-[var(--theme-border)] px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)]">
          <div>
            <div className={themeRecipes.eyebrow()}>{isModal ? 'Modal' : 'Drawer'}</div>
            <h3 className={`mt-[var(--theme-panel-header-gap)] ${themeRecipes.title()}`}>{overlay.title}</h3>
            {overlay.description && <p className={`mt-1 ${themeRecipes.description()}`}>{overlay.description}</p>}
          </div>
          <div className={themeRecipes.toolbar()}>
            {!isModal && (
              <IconButton
                onClick={closeOverlay}
                title="关闭抽屉"
              >
                <PanelRightClose size={16} />
              </IconButton>
            )}
            <IconButton
              onClick={closeOverlay}
              title="关闭"
            >
              <X size={16} />
            </IconButton>
          </div>
        </div>
        <div className="h-[calc(100%-calc(var(--theme-panel-padding-y)*2+3rem))] overflow-hidden">
          {View ? (
            <PluginErrorBoundary pluginId={pluginId} surface={overlay.viewType}>
              <View
                ctx={createPluginContext(pluginId)}
                title={overlay.title}
                description={overlay.description}
                payload={overlay.payload}
              />
            </PluginErrorBoundary>
          ) : (
            <div className="h-full overflow-auto px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]">
              <EmptyState title={overlay.title} description={`没有插件注册 \`${overlay.viewType}\` 这个 Overlay view。插件未加载或 view id 不匹配。`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

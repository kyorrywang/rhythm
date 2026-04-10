import { Sidebar } from '@/features/sidebar/Sidebar';
import { MainStage } from '@/features/layout/MainStage';
import { OverlayHost } from '@/features/layout/OverlayHost';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { ToastContainer } from '@/shared/ui/Toast';
import { useSettingsStore } from '@/shared/state/useSettingsStore';
import type { AppSettings } from '@/shared/state/useSettingsStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { useActiveWorkspace } from '@/shared/state/useWorkspaceStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useKeyboardShortcuts } from '@/shared/hooks/useKeyboardShortcuts';
import { ThemeProvider } from '@/shared/theme/provider';
import { themeRecipes } from '@/shared/theme/recipes';
import { useEffect } from 'react';
import { getSessions } from '@/shared/api/commands';
import { PluginHostRuntime } from '@/plugin/host/PluginHostRuntime';

export function App() {
  const workbench = useSessionStore((s) => s.workbench);
  const overlay = useSessionStore((s) => s.overlay);
  const setActiveLeftPanelView = useSessionStore((s) => s.setActiveLeftPanelView);
  const closeWorkbench = useSessionStore((s) => s.closeWorkbench);
  const closeOverlay = useSessionStore((s) => s.closeOverlay);
  const setComposerControls = useSessionStore((s) => s.setComposerControls);
  const setSessions = useSessionStore((s) => s.setSessions);
  const hydrateFromBackend = useSettingsStore((s) => s.hydrateFromBackend);
  const isHydratedFromBackend = useSettingsStore((s) => s.isHydratedFromBackend);
  const settings = useSettingsStore((s) => s.settings);
  const setPermissionConfig = usePermissionStore((s) => s.setConfig);
  const activeWorkspace = useActiveWorkspace();

  useEffect(() => {
    if (!isHydratedFromBackend) {
      void hydrateFromBackend();
    }
  }, [hydrateFromBackend, isHydratedFromBackend]);

  useEffect(() => {
    let cancelled = false;
    void getSessions(activeWorkspace.path)
      .then((sessions) => {
        if (cancelled) return;
        setSessions(sessions);
        const current = useSessionStore.getState().activeSessionId;
        if (!current || !sessions.some((session) => session.id === current)) {
          const nextActive = sessions.find((session) => !session.archived)?.id || null;
          useSessionStore.getState().setActiveSession(nextActive);
        }
      })
      .catch((error) => {
        console.error('Failed to load workspace sessions', error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace.path, setSessions]);

  useEffect(() => {
    const currentControls = useSessionStore.getState().composerControls;
    const selectedModel = resolveSelectedModel(settings, currentControls);
    const permissionMode = currentControls.fullAuto
      ? 'full_auto'
      : settings.permissionMode === 'plan'
        ? 'plan'
        : 'default';

    setComposerControls({
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      modelName: selectedModel.modelName,
    });
    setPermissionConfig({
      mode: permissionMode,
      allowedTools: settings.allowedTools,
      deniedTools: settings.deniedTools,
    });
  }, [settings, setComposerControls, setPermissionConfig]);

  useKeyboardShortcuts({
    'ctrl+,': () => setActiveLeftPanelView('core.settings.panel'),
    escape: () => {
      if (overlay) {
        closeOverlay();
        return;
      }
      if (workbench) {
        closeWorkbench();
      }
    },
  });

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <div className={`flex h-screen w-full font-sans antialiased ${themeRecipes.appShell()}`}>
          <PluginHostRuntime />
          <Sidebar />
          <MainStage />
          <OverlayHost />
        </div>
      </ThemeProvider>
      <ToastContainer />
    </ErrorBoundary>
  );
}

function resolveSelectedModel(
  settings: AppSettings,
  current: ReturnType<typeof useSessionStore.getState>['composerControls'],
) {
  const enabledProviders = settings.providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) => model.enabled),
    }))
    .filter((provider) => provider.models.length > 0);

  const currentProvider = enabledProviders.find((provider) => provider.id === current.providerId);
  const currentModel = currentProvider?.models.find((model) => model.id === current.modelId || model.name === current.modelName);
  if (currentProvider && currentModel) {
    return {
      providerId: currentProvider.id,
      modelId: currentModel.id,
      modelName: currentModel.name,
    };
  }

  return {
    providerId: '',
    modelId: '',
    modelName: '',
  };
}

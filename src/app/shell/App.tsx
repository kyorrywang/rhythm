import { Sidebar } from '@/widgets/sidebar/Sidebar';
import { MainStage } from '@/app/shell/components/MainStage';
import { OverlayHost } from '@/app/shell/components/OverlayHost';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { ToastContainer } from '@/shared/ui/Toast';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import type { AppSettings } from '@/features/settings/store/useSettingsStore';
import { useSessionStore } from '@/features/chat/store/useSessionStore';
import { useActiveWorkspace } from '@/features/workspace/store/useWorkspaceStore';
import { usePermissionStore } from '@/features/permissions/store/usePermissionStore';
import { useKeyboardShortcuts } from '@/app/shell/hooks/useKeyboardShortcuts';
import { ThemeProvider } from '@/shared/theme/provider';
import { themeRecipes } from '@/shared/theme/recipes';
import { useEffect } from 'react';
import { getSessions } from '@/platform/tauri/api/commands';
import { PluginHostRuntime } from '@/features/plugins/services/host/PluginHostRuntime';

export function App() {
  const workbench = useSessionStore((s) => s.workbench);
  const overlay = useSessionStore((s) => s.overlay);
  const setActiveLeftPanelView = useSessionStore((s) => s.setActiveLeftPanelView);
  const closeWorkbench = useSessionStore((s) => s.closeWorkbench);
  const closeOverlay = useSessionStore((s) => s.closeOverlay);
  const setComposerControls = useSessionStore((s) => s.setComposerControls);
  const hydrateWorkspaceSessions = useSessionStore((s) => s.hydrateWorkspaceSessions);
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
        hydrateWorkspaceSessions(activeWorkspace.path, sessions);
        const current = useSessionStore.getState().activeSessionId;
        if (!current || !sessions.some((session) => session.id === current)) {
          const nextActive = sessions.find((session) => !session.archived && !session.parentId)?.id || null;
          useSessionStore.getState().setActiveSession(nextActive);
        }
      })
      .catch((error) => {
        console.error('Failed to load workspace sessions', error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace.path, hydrateWorkspaceSessions]);

  useEffect(() => {
    const currentControls = useSessionStore.getState().composerControls;
    const selectedModel = resolveSelectedModel(settings, currentControls);
    const primaryAgents = (settings.agents ?? []).filter((agent) => agent.kinds.includes('primary'));
    const defaultAgent = primaryAgents.find((agent) => agent.id === settings.defaultAgentId);
    const permissionMode = currentControls.fullAuto
      ? 'full_auto'
      : settings.permissionMode === 'plan'
        ? 'plan'
        : 'default';

    setComposerControls({
      agentId: defaultAgent?.id || currentControls.agentId || 'chat',
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      modelName: selectedModel.modelName,
      reasoning: settings.defaultReasoning || currentControls.reasoning || 'medium',
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
  const enabledProviders = (settings.providers ?? [])
    .map((provider) => ({
      ...provider,
      models: (provider.models ?? []).filter((model) => model.enabled),
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

  const firstProvider = enabledProviders[0];
  const firstModel = firstProvider?.models[0];
  if (firstProvider && firstModel) {
    return {
      providerId: firstProvider.id,
      modelId: firstModel.id,
      modelName: firstModel.name,
    };
  }

  return {
    providerId: '',
    modelId: '',
    modelName: '',
  };
}


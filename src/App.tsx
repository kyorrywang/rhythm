import { Sidebar } from '@/features/sidebar/Sidebar';
import { SessionContainer } from '@/features/session/SessionContainer';
import { WorkbenchPanel } from '@/features/workbench/WorkbenchPanel';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { ToastContainer } from '@/shared/ui/Toast';
import { useSettingsStore } from '@/shared/state/useSettingsStore';
import type { AppSettings } from '@/shared/state/useSettingsStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useKeyboardShortcuts } from '@/shared/hooks/useKeyboardShortcuts';
import { useEffect } from 'react';

export function App() {
  const workbench = useSessionStore((s) => s.workbench);
  const setLeftPanelMode = useSessionStore((s) => s.setLeftPanelMode);
  const closeWorkbench = useSessionStore((s) => s.closeWorkbench);
  const setComposerControls = useSessionStore((s) => s.setComposerControls);
  const hydrateFromBackend = useSettingsStore((s) => s.hydrateFromBackend);
  const isHydratedFromBackend = useSettingsStore((s) => s.isHydratedFromBackend);
  const settings = useSettingsStore((s) => s.settings);
  const setPermissionConfig = usePermissionStore((s) => s.setConfig);

  useEffect(() => {
    if (!isHydratedFromBackend) {
      void hydrateFromBackend();
    }
  }, [hydrateFromBackend, isHydratedFromBackend]);

  useEffect(() => {
    const defaultModel = selectDefaultModel(settings, useSessionStore.getState().composerControls);
    setComposerControls({
      providerId: defaultModel.providerId,
      modelId: defaultModel.modelId,
      modelName: defaultModel.modelName,
      fullAuto: settings.permissionMode === 'full_auto',
    });
    setPermissionConfig({
      mode: settings.permissionMode,
      allowedTools: settings.allowedTools,
      deniedTools: settings.deniedTools,
    });
  }, [settings, setComposerControls, setPermissionConfig]);

  useKeyboardShortcuts({
    'ctrl+,': () => setLeftPanelMode('settings'),
    escape: () => {
      if (workbench) {
        closeWorkbench();
      }
    },
  });

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full font-sans antialiased bg-[#f3efe7] text-gray-800">
        <Sidebar />
        {workbench && <WorkbenchPanel />}
        <SessionContainer />
      </div>
      <ToastContainer />
    </ErrorBoundary>
  );
}

function selectDefaultModel(
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

  const defaultProvider = enabledProviders.find((provider) => provider.isDefault) || enabledProviders[0];
  const defaultModel = defaultProvider?.models.find((model) => model.isDefault) || defaultProvider?.models[0];
  return {
    providerId: defaultProvider?.id || '',
    modelId: defaultModel?.id || '',
    modelName: defaultModel?.name || '',
  };
}

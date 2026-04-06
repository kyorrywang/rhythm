import { Sidebar } from '@/features/sidebar/Sidebar';
import { SessionContainer } from '@/features/session/SessionContainer';
import { WorkbenchPanel } from '@/features/workbench/WorkbenchPanel';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { ToastContainer } from '@/shared/ui/Toast';
import { useSettingsStore } from '@/shared/state/useSettingsStore';
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
    const provider = settings.providers.find((item) => item.isDefault) || settings.providers[0];
    const model = provider?.models.find((item) => item.isDefault) || provider?.models[0];
    setComposerControls({
      model: model?.name || 'GPT-5.4',
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

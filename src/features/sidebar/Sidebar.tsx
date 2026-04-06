import { useToast } from '@/shared/hooks/useToast';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { GlobalRail } from './GlobalRail';
import { LeftPanel } from './LeftPanel';

export const Sidebar = () => {
  const {
    leftPanelMode,
    leftSidebarCollapsed,
    setLeftPanelMode,
    toggleLeftSidebarCollapsed,
    closeWorkbench,
  } = useSessionStore();
  const { info: showInfo } = useToast();

  const handleWorkspaceClick = () => {
    if (leftPanelMode !== 'sessions') {
      setLeftPanelMode('sessions');
      closeWorkbench();
      return;
    }
    toggleLeftSidebarCollapsed();
  };

  return (
    <div className="flex h-screen shrink-0">
      <GlobalRail
        activeMode={leftPanelMode}
        isCollapsed={leftSidebarCollapsed}
        onWorkspaceClick={handleWorkspaceClick}
        onAddWorkspace={() => showInfo('多工作区能力会在后续阶段接入')}
        onOpenPlugins={() => setLeftPanelMode('plugins')}
        onOpenSettings={() => setLeftPanelMode('settings')}
      />
      {!leftSidebarCollapsed && <LeftPanel />}
    </div>
  );
};

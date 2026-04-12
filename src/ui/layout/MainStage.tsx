import { SessionContainer } from '@/domains/chat/session/SessionContainer';
import { WorkbenchHost } from '@/ui/workbench/WorkbenchHost';
import { useSessionStore } from '@/core/sessions/useSessionStore';

export const MainStage = () => {
  const workbench = useSessionStore((s) => s.workbench);

  if (!workbench) {
    return <SessionContainer />;
  }

  if (workbench.layoutMode === 'replace') {
    return <WorkbenchHost mode="replace" />;
  }

  return (
    <>
      <WorkbenchHost mode="split" />
      <SessionContainer />
    </>
  );
};

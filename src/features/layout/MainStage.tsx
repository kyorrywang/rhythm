import { SessionContainer } from '@/features/session/SessionContainer';
import { WorkbenchHost } from '@/features/workbench/WorkbenchHost';
import { useSessionStore } from '@/shared/state/useSessionStore';

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

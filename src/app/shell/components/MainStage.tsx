import { SessionContainer } from '@/features/chat/components/SessionContainer';
import { WorkbenchHost } from '@/widgets/workbench/WorkbenchHost';
import { useSessionStore } from '@/features/chat/store/useSessionStore';

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


import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface WorkbenchHeaderCenterContextValue {
  workbenchId: string;
  setHeaderCenterContent: (content: ReactNode | null) => void;
}

const WorkbenchHeaderCenterContext = createContext<WorkbenchHeaderCenterContextValue | null>(null);

export function WorkbenchHeaderCenterProvider({
  value,
  children,
}: {
  value: WorkbenchHeaderCenterContextValue;
  children: ReactNode;
}) {
  return (
    <WorkbenchHeaderCenterContext.Provider value={value}>
      {children}
    </WorkbenchHeaderCenterContext.Provider>
  );
}

export function useWorkbenchHeaderCenter() {
  return useContext(WorkbenchHeaderCenterContext);
}

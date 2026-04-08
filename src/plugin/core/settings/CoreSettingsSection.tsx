import { SettingsWorkbench, type SettingsSection } from '@/features/workbench/SettingsWorkbench';
import type { WorkbenchProps } from '@/plugin/sdk';

export function CoreSettingsSection({ payload }: WorkbenchProps<{ section?: string }>) {
  return <SettingsWorkbench section={(payload.section || 'frontend') as SettingsSection} />;
}

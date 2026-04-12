import { SettingsWorkbench, type SettingsSection } from '@/ui/workbench/SettingsWorkbench';
import type { WorkbenchProps } from '@/core/plugin/sdk';

export function CoreSettingsSection({ payload }: WorkbenchProps<{ section?: string }>) {
  return <SettingsWorkbench section={(payload.section || 'frontend') as SettingsSection} />;
}

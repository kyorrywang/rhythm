import { SettingsWorkbench, type SettingsSection } from '@/widgets/workbench/SettingsWorkbench';
import type { WorkbenchProps } from '@/features/plugins/services/sdk';

export function CoreSettingsSection({ payload }: WorkbenchProps<{ section?: string }>) {
  return <SettingsWorkbench section={(payload.section || 'frontend') as SettingsSection} />;
}


import { PluginWorkbench } from '@/features/workbench/PluginWorkbench';
import { usePluginStore } from '@/shared/state/usePluginStore';
import type { WorkbenchProps } from '@/plugin/sdk';

export function CorePluginDetail({ payload, title }: WorkbenchProps<{ pluginName?: string }>) {
  const plugins = usePluginStore((state) => state.plugins);
  const plugin = plugins.find((entry) => entry.name === payload.pluginName || entry.name === title);
  return plugin ? <PluginWorkbench plugin={plugin} /> : null;
}

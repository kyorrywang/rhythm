import { PluginWorkbench } from '@/ui/workbench/PluginWorkbench';
import { usePluginStore } from '@/core/plugin/usePluginStore';
import type { WorkbenchProps } from '@/core/plugin/sdk';
import { EmptyState } from '@/ui/components';
import { Package } from 'lucide-react';

export function CorePluginDetail({ payload, title }: WorkbenchProps<{ pluginName?: string; pluginPath?: string }>) {
  const plugins = usePluginStore((state) => state.plugins);
  const plugin = plugins.find((entry) => entry.path === payload.pluginPath)
    || plugins.find((entry) => entry.name === payload.pluginName || entry.name === title);
  return plugin ? <PluginWorkbench plugin={plugin} /> : (
    <div className="p-6">
      <EmptyState title="插件实例不存在" description="当前工作区里已经找不到这个插件实例，可能是工作区切换后来源发生了变化。" icon={<Package size={18} />} />
    </div>
  );
}

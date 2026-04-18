import { PluginWorkbench } from '@/widgets/workbench/PluginWorkbench';
import { usePluginStore } from '@/features/plugins/store/usePluginStore';
import type { WorkbenchProps } from '@/features/plugins/services/sdk';
import { EmptyState } from '@/shared/ui';
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



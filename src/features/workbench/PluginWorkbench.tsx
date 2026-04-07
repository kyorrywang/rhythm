import { CheckCircle2, Package, Power, Wrench } from 'lucide-react';
import { useToast } from '@/shared/hooks/useToast';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { Button } from '@/shared/ui/Button';
import type { BackendPluginSummary } from '@/shared/types/api';

const DEFAULT_CWD = 'C:\\Users\\Administrator\\Documents\\dev\\rhythm';

export const PluginWorkbench = ({ plugin }: { plugin: BackendPluginSummary }) => {
  const togglePlugin = usePluginStore((s) => s.togglePlugin);
  const { success, error } = useToast();

  const handleToggle = async () => {
    try {
      await togglePlugin(DEFAULT_CWD, plugin.name, !plugin.enabled);
      success(`${plugin.name} 已${plugin.enabled ? '禁用' : '启用'}`);
    } catch {
      error('插件状态切换失败');
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              <Package size={14} />
              <span>Plugin</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">{plugin.name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{plugin.description || '暂无描述'}</p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ${plugin.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {plugin.enabled ? '已启用' : '已禁用'}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label="版本" value={plugin.version} />
          <StatCard label="技能数" value={String(plugin.skills_count)} />
          <StatCard label="安装路径" value={plugin.path.split('\\').slice(-2).join('\\')} />
          <StatCard label="状态" value={plugin.enabled ? 'enabled' : 'disabled'} />
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Power size={15} />
            <span>启用状态管理</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4">
            <div>
              <div className="text-sm font-medium text-slate-800">{plugin.enabled ? '插件已启用' : '插件当前已停用'}</div>
              <div className="mt-1 text-xs text-slate-500">这里已经连接后端启用/禁用命令，切换后会立即刷新插件列表。</div>
            </div>
            <Button variant="unstyled" size="none" onClick={handleToggle} className={`rounded-full px-4 py-2 text-sm font-medium ${plugin.enabled ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'}`}>
              {plugin.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Wrench size={15} />
            <span>当前后端可见信息</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <CheckCircle2 size={14} className="text-emerald-600" />
                已接入真实后端列表
              </div>
              <div className="mt-2 text-xs leading-6 text-slate-500">
                当前 Tauri 插件命令返回名称、版本、描述、启用状态、技能数量和安装路径。更深的 hooks / MCP / skill 明细后续可以继续扩展后端 summary。
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-4">
    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
    <div className="mt-2 break-all text-sm font-medium text-slate-800">{value}</div>
  </div>
);

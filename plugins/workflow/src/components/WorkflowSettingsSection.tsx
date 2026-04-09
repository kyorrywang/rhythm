import { useEffect, useState } from 'react';
import type { SettingsSectionProps } from '../../../../src/plugin/sdk';
import { Button } from '../../../../src/shared/ui/Button';
import { DEFAULT_WORKFLOW_SETTINGS, getWorkflowSettings, saveWorkflowSettings } from '../storage';
import type { WorkflowSettings } from '../types';

export function WorkflowSettingsSection({ ctx }: SettingsSectionProps) {
  const [settings, setSettings] = useState<WorkflowSettings>(DEFAULT_WORKFLOW_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getWorkflowSettings(ctx).then((value) => {
      if (!cancelled) setSettings(value);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  const save = async () => {
    await saveWorkflowSettings(ctx, settings);
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Workflow</h3>
        <p className="mt-1 text-sm text-slate-500">Configure lightweight workflow history behavior.</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.saveRunHistory}
          onChange={(event) => setSettings((current) => ({ ...current, saveRunHistory: event.target.checked }))}
        />
        保存运行历史
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.openRunViewOnStart}
          onChange={(event) => setSettings((current) => ({ ...current, openRunViewOnStart: event.target.checked }))}
        />
        运行时自动打开运行视图
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.continueOnError}
          onChange={(event) => setSettings((current) => ({ ...current, continueOnError: event.target.checked }))}
        />
        节点失败时继续运行后续节点
      </label>
      <label className="block text-sm text-slate-700">
        最大运行历史数量
        <input
          type="number"
          min={1}
          max={100}
          value={settings.maxRunHistory}
          onChange={(event) => setSettings((current) => ({ ...current, maxRunHistory: Number(event.target.value) || 20 }))}
          className="mt-2 w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-3 py-2 outline-none focus:border-amber-300"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()}>保存设置</Button>
        {saved && <span className="text-sm text-emerald-600">已保存</span>}
      </div>
    </div>
  );
}

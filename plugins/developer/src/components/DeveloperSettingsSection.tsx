import type { SettingsSectionProps } from '../../../../src/plugin/sdk';
import { Button } from '../../../../src/shared/ui/Button';
import { useDeveloperSettings } from '../hooks/useDeveloperSettings';
import { createValidationPreset } from '../utils';

export function DeveloperSettingsSection({ ctx }: SettingsSectionProps) {
  const { settings, update } = useDeveloperSettings(ctx);

  return (
    <div className="space-y-6 rounded-[var(--theme-radius-shell)] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Plugin Settings</div>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Developer</h2>
        <p className="mt-2 text-sm leading-7 text-slate-500">管理 validation 预设与 Git 联动行为。</p>
      </div>

      <section>
        <div className="mb-2 text-sm font-medium text-slate-700">Validation presets</div>
        <textarea
          value={settings.validationPresets.map((preset) => preset.command).join('\n')}
          onChange={(event) =>
            void update({
              validationPresets: event.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean)
                .map(createValidationPreset),
            })
          }
          className="min-h-[140px] w-full rounded-[var(--theme-radius-control)] border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <ToggleCard
          title="Auto-refresh git status"
          checked={settings.autoRefreshGitStatus}
          onChange={(checked) => void update({ autoRefreshGitStatus: checked })}
        />
        <ToggleCard
          title="Sync Folder badges"
          checked={settings.syncFolderBadges}
          onChange={(checked) => void update({ syncFolderBadges: checked })}
        />
      </section>
    </div>
  );
}

function ToggleCard({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Button
      variant="unstyled"
      size="none"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between rounded-[var(--theme-radius-card)] border px-4 py-4 text-left ${
        checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
      }`}
    >
      <span className="text-sm font-medium text-slate-800">{title}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${checked ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </Button>
  );
}

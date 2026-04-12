import { useState } from 'react';
import { X, Monitor, Moon, Sun, Type, Shield, RotateCcw } from 'lucide-react';
import { useSettingsStore, type AppSettings } from '@/core/runtime/useSettingsStore';
import { useDisplayStore } from '@/ui/state/useDisplayStore';
import { Button } from '@/ui/components/Button';
import { Select } from '@/ui/components/Select';
import { themeRecipes } from '@/ui/theme/recipes';

interface SettingsPageProps {
  onClose: () => void;
}

export const SettingsPage = ({ onClose }: SettingsPageProps) => {
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { preferences, setSegmentConfig, resetToDefaults } = useDisplayStore();
  const [activeTab, setActiveTab] = useState<'general' | 'display'>('general');

  const tabs = [
    { id: 'general' as const, label: '通用', icon: Monitor },
    { id: 'display' as const, label: '显示', icon: Type },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className={`flex max-h-[80vh] w-[640px] max-w-[90vw] flex-col overflow-hidden ${themeRecipes.workbenchSurface()}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b-[var(--theme-divider-width)] border-[var(--theme-border)] px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)]">
          <h2 className={themeRecipes.title()}>设置</h2>
          <Button variant="unstyled" size="none" onClick={onClose} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]">
            <X size={20} />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-40 border-r-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[var(--theme-panel-bg)] py-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  variant="unstyled"
                  size="none"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-[var(--theme-toolbar-gap)] px-4 py-2.5 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-r-2 border-[var(--theme-accent)] bg-[var(--theme-surface)] font-medium text-[var(--theme-text-primary)]'
                      : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-secondary)]'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </Button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6 rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-warning-border)] bg-[var(--theme-warning-surface)] px-4 py-3 text-sm text-[var(--theme-warning-text)]">
              这里主要管理前端偏好与显示行为。完整的运行时配置已经统一到后端配置 bundle，并通过设置页同步。
            </div>
            {activeTab === 'general' && <GeneralSettings settings={settings} onUpdate={updateSettings} onReset={resetSettings} />}
            {activeTab === 'display' && <DisplaySettings preferences={preferences} onUpdate={setSegmentConfig} onReset={resetToDefaults} />}
          </div>
        </div>
      </div>
    </div>
  );
};

function GeneralSettings({ settings, onUpdate, onReset }: { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void; onReset: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-gray-800 mb-4 flex items-center gap-2">
          <Monitor size={16} />
          主题
        </h3>
        <div className="flex gap-2">
          {[
            { value: 'system', label: '系统', icon: Monitor },
            { value: 'light', label: '浅色', icon: Sun },
            { value: 'dark', label: '深色', icon: Moon },
          ].map((theme) => {
            const Icon = theme.icon;
            return (
              <Button
                variant="unstyled"
                size="none"
                key={theme.value}
                onClick={() => onUpdate({ theme: theme.value as AppSettings['theme'] })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 border rounded-[var(--theme-radius-control)] text-sm transition-colors ${
                  settings.theme === theme.value
                    ? 'border-gray-800 bg-gray-50 text-gray-800'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Icon size={16} />
                {theme.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-800 mb-4 flex items-center gap-2">
          <Shield size={16} />
          本地偏好
        </h3>
        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-[var(--theme-radius-card)]">
            <input
              type="checkbox"
              checked={settings.autoSaveSessions}
              onChange={(e) => onUpdate({ autoSaveSessions: e.target.checked })}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">自动保存会话</p>
              <p className="text-xs text-gray-500">将前端会话列表和界面状态持久化到本地浏览器存储。</p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <Button
          variant="unstyled"
          size="none"
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RotateCcw size={14} />
          恢复默认
        </Button>
      </div>
    </div>
  );
}

import type { DisplayPreferences, SegmentDisplayConfig } from '@/ui/state/useDisplayStore';

function DisplaySettings({ preferences, onUpdate, onReset }: { preferences: DisplayPreferences; onUpdate: (segment: keyof DisplayPreferences, config: SegmentDisplayConfig) => void; onReset: () => void }) {
  const segments = [
    { key: 'thinking' as const, label: '思考过程' },
    { key: 'toolCall' as const, label: '工具调用' },
    { key: 'ask' as const, label: 'Ask 交互' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-gray-800 mb-4 flex items-center gap-2">
          <Type size={16} />
          段展开/折叠偏好
        </h3>
        <div className="space-y-4">
          {segments.map((seg) => (
            <div key={seg.key} className="p-4 border border-gray-100 rounded-[var(--theme-radius-card)]">
              <p className="text-sm font-medium text-gray-700 mb-3">{seg.label}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">运行时</label>
                  <Select
                    value={preferences[seg.key].whileRunning}
                    onChange={(e) => onUpdate(seg.key, { ...preferences[seg.key], whileRunning: e.target.value as 'expand' | 'collapse' })}
                  >
                    <option value="expand">展开</option>
                    <option value="collapse">折叠</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">完成后</label>
                  <Select
                    value={preferences[seg.key].whenDone}
                    onChange={(e) => onUpdate(seg.key, { ...preferences[seg.key], whenDone: e.target.value as 'expand' | 'collapse' })}
                  >
                    <option value="expand">展开</option>
                    <option value="collapse">折叠</option>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <Button
          variant="unstyled"
          size="none"
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RotateCcw size={14} />
          恢复默认
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X, Monitor, Moon, Sun, Type, Shield, RotateCcw } from 'lucide-react';
import { useSettingsStore, type AppSettings } from '@/store/useSettingsStore';
import { useDisplayStore } from '@/store/useDisplayStore';

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
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[640px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-medium text-gray-800">设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-40 border-r border-gray-100 bg-gray-50 py-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-800 font-medium border-r-2 border-gray-800'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              这里当前只管理前端偏好和显示行为。模型、权限和后端运行配置仍由后端配置文件控制，尚未从这个面板写回。
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
              <button
                key={theme.value}
                onClick={() => onUpdate({ theme: theme.value as AppSettings['theme'] })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 border rounded-lg text-sm transition-colors ${
                  settings.theme === theme.value
                    ? 'border-gray-800 bg-gray-50 text-gray-800'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Icon size={16} />
                {theme.label}
              </button>
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
          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
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
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RotateCcw size={14} />
          恢复默认
        </button>
      </div>
    </div>
  );
}

import type { DisplayPreferences, SegmentDisplayConfig } from '@/store/useDisplayStore';

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
            <div key={seg.key} className="p-4 border border-gray-100 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-3">{seg.label}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">运行时</label>
                  <select
                    value={preferences[seg.key].whileRunning}
                    onChange={(e) => onUpdate(seg.key, { ...preferences[seg.key], whileRunning: e.target.value as 'expand' | 'collapse' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-300"
                  >
                    <option value="expand">展开</option>
                    <option value="collapse">折叠</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">完成后</label>
                  <select
                    value={preferences[seg.key].whenDone}
                    onChange={(e) => onUpdate(seg.key, { ...preferences[seg.key], whenDone: e.target.value as 'expand' | 'collapse' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-300"
                  >
                    <option value="expand">展开</option>
                    <option value="collapse">折叠</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RotateCcw size={14} />
          恢复默认
        </button>
      </div>
    </div>
  );
}

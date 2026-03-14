import React from 'react';
import { useAppStore, ActivityTab } from '../../app/store';
import { MessageSquare, Folder, GitMerge, Settings } from 'lucide-react';

export const ActivityBar: React.FC = () => {
  const { activeTab, setActiveTab } = useAppStore();

  const IconWrapper = ({ tab, Icon, title }: { tab: ActivityTab, Icon: any, title: string }) => {
    const isActive = activeTab === tab;
    return (
      <div 
        className="flex-center"
        title={title}
        onClick={() => setActiveTab(tab)}
        style={{
          width: '100%',
          aspectRatio: '1',
          cursor: 'pointer',
          color: isActive ? 'var(--text-active)' : 'var(--text-secondary)',
          borderLeft: isActive ? '2px solid var(--accent-color)' : '2px solid transparent',
          opacity: isActive ? 1 : 0.7,
        }}
      >
        <Icon size={24} strokeWidth={1.5} />
      </div>
    );
  };

  return (
    <div style={{
      width: 'var(--activity-bar-width)',
      height: '100%',
      backgroundColor: 'var(--bg-activity-bar)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '10px',
      gap: '15px'
    }}>
      <IconWrapper tab="sessions" Icon={MessageSquare} title="会话 (Sessions)" />
      <IconWrapper tab="explorer" Icon={Folder} title="资源管理器 (Explorer)" />
      <IconWrapper tab="workflows" Icon={GitMerge} title="工作流 (Workflows)" />
      <div style={{ flex: 1 }} />
      <IconWrapper tab="settings" Icon={Settings} title="设置 (Settings)" />
    </div>
  );
};

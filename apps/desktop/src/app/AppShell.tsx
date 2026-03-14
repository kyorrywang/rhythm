import React, { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { ActivityBar } from '../modules/sidebar/ActivityBar';
import { SidebarContainer } from '../modules/sidebar/SidebarContainer';
import { ChatContainer } from '../modules/chat/ChatContainer';
import { ArtifactPanel } from '../modules/artifacts/ArtifactPanel';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';

const WorkspaceSelector = () => {
  const { setWorkspacePath } = useAppStore();
  const [loading, setLoading] = useState(false);

  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Rhythm 项目工作区'
      });

      if (selected && typeof selected === 'string') {
        setLoading(true);
        const response = await fetch('http://localhost:8000/workspace/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_path: selected })
        });
        
        if (response.ok) {
          setWorkspacePath(selected);
        } else {
          alert('无法通过 API 初始化工作区');
        }
      }
    } catch (err) {
      console.error(err);
      alert('调用原生对话框失败或网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-app)' }}>
      <div style={{ padding: '40px', backgroundColor: 'var(--bg-sidebar)', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '24px' }}>Welcome to Rhythm</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '14px' }}>
          Select a project folder to start your content creation journey.
        </p>
        
        <button 
          onClick={handlePickFolder}
          disabled={loading}
          style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '12px 24px', 
            borderRadius: '8px', 
            backgroundColor: 'var(--accent-color)', 
            color: 'white', 
            border: 'none', 
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '15px',
            fontWeight: 500,
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
          onMouseOut={(e) => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent-color)')}
        >
          <FolderOpen size={20} />
          {loading ? 'Initializing...' : 'Select Project Folder'}
        </button>
      </div>
    </div>
  );
};

export const AppShell: React.FC = () => {
  const workspacePath = useAppStore(state => state.workspacePath);

  if (!workspacePath) {
    return <WorkspaceSelector />;
  }

  return (
    <div className="app-container">
      <ActivityBar />
      <SidebarContainer />
      <ChatContainer />
      <ArtifactPanel />
    </div>
  );
};

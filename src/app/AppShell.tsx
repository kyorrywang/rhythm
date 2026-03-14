import React, { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { ActivityBar } from '../modules/sidebar/ActivityBar';
import { SidebarContainer } from '../modules/sidebar/SidebarContainer';
import { ChatContainer } from '../modules/chat/ChatContainer';
import { ArtifactPanel } from '../modules/artifacts/ArtifactPanel';
import { initWorkspace } from '../bridge/api';
import { open } from '@tauri-apps/plugin-dialog';

const WorkspaceSelector = () => {
  const { setWorkspacePath } = useAppStore();
  const [inputPath, setInputPath] = useState('');

  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Rhythm Workspace'
      });
      if (selected && typeof selected === 'string') {
        setInputPath(selected);
      }
    } catch (err) {
      console.error('Failed to open dialog', err);
    }
  };

  const handleSetWorkspace = async () => {
    const path = inputPath.trim();
    if (path) {
      try {
        // Use the Rust bridge instead of HTTP
        await initWorkspace(path);
        setWorkspacePath(path);
      } catch (err) {
        alert('Failed to initialize workspace: ' + err);
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-app)' }}>
      <div style={{ padding: '40px', backgroundColor: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-color)', width: '450px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        <h2 style={{ margin: '0 0 10px 0', color: 'var(--text-active)' }}>Welcome to Rhythm</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '14px' }}>
          Select a local folder to serve as your project workspace. 
          Rhythm will create a <code style={{ color: 'var(--accent-color)' }}>.rhythm</code> folder to manage your SOPs and context.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="Select folder path..."
              style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'white', fontSize: '13px' }}
            />
            <button 
              onClick={handlePickFolder}
              style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: 'var(--bg-active)', color: 'white', border: '1px solid var(--border-color)', cursor: 'pointer' }}
            >
              Browse...
            </button>
          </div>
          
          <button 
            onClick={handleSetWorkspace}
            disabled={!inputPath.trim()}
            style={{ 
              padding: '12px', borderRadius: '6px', backgroundColor: 'var(--accent-color)', 
              color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600,
              opacity: inputPath.trim() ? 1 : 0.5
            }}
          >
            Open Workspace
          </button>
        </div>
      </div>
    </div>
  );
};

export const AppShell: React.FC = () => {
  const workspacePath = useAppStore(state => state.workspacePath);

  useEffect(() => {
    if (workspacePath) {
      initWorkspace(workspacePath).catch(console.error);
    }
  }, [workspacePath]);

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

import React, { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { ActivityBar } from '../modules/sidebar/ActivityBar';
import { SidebarContainer } from '../modules/sidebar/SidebarContainer';
import { ChatContainer } from '../modules/chat/ChatContainer';
import { ArtifactPanel } from '../modules/artifacts/ArtifactPanel';

const WorkspaceSelector = () => {
  const { setWorkspacePath } = useAppStore();
  const [inputPath, setInputPath] = useState('');

  const handleSetWorkspace = async () => {
    if (inputPath.trim()) {
      try {
        const response = await fetch('http://localhost:8000/workspace/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_path: inputPath.trim() })
        });
        if (response.ok) {
          setWorkspacePath(inputPath.trim());
        } else {
          alert('Failed to init workspace via API');
        }
      } catch (err) {
        alert('API server not running or network error');
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-app)' }}>
      <div style={{ padding: '30px', backgroundColor: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <h2 style={{ margin: '0 0 20px 0' }}>Welcome to Rhythm</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>Select or enter a workspace path to begin.</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="e.g. C:\Users\Admin\Documents\my_novel"
            style={{ width: '300px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'white' }}
          />
          <button 
            onClick={handleSetWorkspace}
            style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
};

export const AppShell: React.FC = () => {
  const workspacePath = useAppStore(state => state.workspacePath);

  // If no workspace is selected, show the selector
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

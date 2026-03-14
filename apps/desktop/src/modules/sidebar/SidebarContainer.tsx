import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../app/store';
import { fetchSessions, fetchWorkspaceTree, fetchWorkflows } from '../../core/api';
import { FileText, Folder, Plus, GitMerge } from 'lucide-react';

export const SidebarContainer: React.FC = () => {
  const { isSidebarOpen, activeTab, workspacePath, currentSessionId, setCurrentSessionId, setActiveArtifact } = useAppStore();
  const [sessions, setSessions] = useState<string[]>([]);
  const [tree, setTree] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);

  useEffect(() => {
    if (!workspacePath) return;
    if (activeTab === 'sessions') {
      fetchSessions(workspacePath).then(setSessions);
    } else if (activeTab === 'explorer') {
      fetchWorkspaceTree(workspacePath).then(setTree);
    } else if (activeTab === 'workflows') {
      fetchWorkflows(workspacePath).then(setWorkflows);
    }
  }, [activeTab, workspacePath]);

  if (!isSidebarOpen) return null;

  const createSession = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    setSessions(prev => [newId, ...prev]);
  };

  const renderTree = (nodes: any[], depth = 0) => {
    return nodes.map((node, i) => (
      <div key={i} style={{ marginLeft: depth * 12 }}>
        <div 
          style={{ 
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', 
            cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)',
            borderRadius: '4px'
          }}
          className="tree-item"
          onClick={() => {
            if (!node.is_dir) {
              setActiveArtifact({ id: node.path, type: 'file', title: node.name, content: node.path });
            }
          }}
        >
          {node.is_dir ? <Folder size={14} /> : <FileText size={14} />}
          <span className="text-ellipsis">{node.name}</span>
        </div>
        {node.children && renderTree(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div style={{
      width: 'var(--sidebar-width)',
      height: '100%',
      backgroundColor: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 15px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600,
        letterSpacing: '0.05em', color: 'var(--text-secondary)'
      }}>
        <span>{activeTab}</span>
        {activeTab === 'sessions' && (
          <Plus size={14} style={{ cursor: 'pointer' }} onClick={createSession} />
        )}
      </div>

      <div style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
        {activeTab === 'sessions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {sessions.map(s => (
              <div 
                key={s} 
                onClick={() => setCurrentSessionId(s)}
                style={{
                  padding: '8px 12px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: currentSessionId === s ? 'var(--bg-active)' : 'transparent',
                  color: currentSessionId === s ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {s}
              </div>
            ))}
            {sessions.length === 0 && <div style={{ padding: '12px', fontSize: '12px', color: '#666' }}>No sessions yet.</div>}
          </div>
        )}

        {activeTab === 'explorer' && (
          <div style={{ marginTop: '4px' }}>
            {renderTree(tree)}
            {tree.length === 0 && <div style={{ padding: '12px', fontSize: '12px', color: '#666' }}>Empty workspace.</div>}
          </div>
        )}

        {activeTab === 'workflows' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }}>
            {workflows.map(wf => (
              <div key={wf.id} style={{
                padding: '10px', backgroundColor: 'var(--bg-activity-bar)', 
                borderRadius: '6px', border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  <GitMerge size={14} color="var(--accent-color)" />
                  {wf.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {wf.steps?.length || 0} steps
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

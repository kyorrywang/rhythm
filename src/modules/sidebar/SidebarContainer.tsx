import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../app/store';
import { fetchSessions, fetchWorkspaceTree, fetchWorkflows, fetchEffectiveConfig, saveWorkspaceConfig, initWorkspace, readTextFile, deleteSession } from '../../bridge/api';
import { FileText, Folder, Plus, GitMerge, ChevronRight, ChevronDown, FolderOpen, Save, Eye, EyeOff, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export const SidebarContainer: React.FC = () => {
  const { isSidebarOpen, activeTab, workspacePath, setWorkspacePath, currentSessionId, setCurrentSessionId, setActiveArtifact } = useAppStore();
  const [sessions, setSessions] = useState<string[]>([]);
  const [tree, setTree] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [config, setConfig] = useState<any>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (!workspacePath && activeTab !== 'settings') return;
    if (activeTab === 'sessions' && workspacePath) {
      fetchSessions(workspacePath).then(setSessions);
    } else if (activeTab === 'explorer' && workspacePath) {
      fetchWorkspaceTree(workspacePath).then(setTree);
    } else if (activeTab === 'workflows' && workspacePath) {
      fetchWorkflows(workspacePath).then(setWorkflows);
    } else if (activeTab === 'settings') {
      fetchEffectiveConfig(workspacePath).then(setConfig);
    }
  }, [activeTab, workspacePath]);

  if (!isSidebarOpen) return null;

  const createSession = async () => {
    // Check LLM settings
    const currentConfig = config || await fetchEffectiveConfig(workspacePath);
    if (!currentConfig?.llm?.key) {
      alert("Please set your LLM API Key in Settings first.");
      return;
    }

    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    setSessions(prev => [newId, ...prev]);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (workspacePath) {
      await deleteSession(workspacePath, sessionId);
      setSessions(prev => prev.filter(s => s !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
    }
  };

  const switchWorkspace = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (selected && typeof selected === 'string') {
      await initWorkspace(selected);
      setWorkspacePath(selected);
    }
  };

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTree = (nodes: any[], depth = 0) => {
    return nodes.map((node, i) => {
      const isExpanded = expandedPaths[node.path];
      return (
        <div key={i} style={{ marginLeft: depth * 12 }}>
          <div 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', 
              cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)',
              borderRadius: '4px'
            }}
            className="tree-item"
            onClick={() => {
              if (node.is_dir) {
                toggleExpand(node.path);
              } else {
                setActiveArtifact({ id: node.path, type: 'file', title: node.name, content: node.path });
              }
            }}
          >
            {node.is_dir ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : <FileText size={14} />}
            {node.is_dir ? <Folder size={14} /> : null}
            <span className="text-ellipsis">{node.name}</span>
          </div>
          {node.is_dir && isExpanded && node.children && renderTree(node.children, depth + 1)}
        </div>
      );
    });
  };

  const saveConfig = async () => {
    if (workspacePath) {
      await saveWorkspaceConfig(workspacePath, config);
      setSaveMessage('Settings saved locally!');
      setTimeout(() => setSaveMessage(''), 3000);
    }
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
        {activeTab === 'explorer' && (
          <FolderOpen size={14} style={{ cursor: 'pointer' }} onClick={switchWorkspace} />
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
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: currentSessionId === s ? 'var(--bg-active)' : 'transparent',
                  color: currentSessionId === s ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                <span>{s}</span>
                <X 
                  size={14} 
                  style={{ opacity: 0.7, cursor: 'pointer' }} 
                  onClick={(e) => handleDeleteSession(e, s)} 
                />
              </div>
            ))}
            {sessions.length === 0 && <div style={{ padding: '12px', fontSize: '12px', color: '#666' }}>No sessions yet.</div>}
          </div>
        )}

        {activeTab === 'explorer' && (
          <div style={{ marginTop: '4px' }}>
            {workspacePath ? (
              <>
                <div style={{ 
                  fontSize: '11px', color: '#888', padding: '4px 8px', 
                  marginBottom: '8px', borderBottom: '1px solid #333',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {workspacePath}
                </div>
                {renderTree(tree)}
              </>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <button onClick={switchWorkspace} style={{ 
                  padding: '8px 16px', backgroundColor: 'var(--accent-color)', 
                  border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer'
                }}>
                  Open Folder
                </button>
              </div>
            )}
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

        {activeTab === 'settings' && config && (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>LLM PROVIDER</label>
              <select 
                value={config.llm?.provider || 'openai'} 
                onChange={e => setConfig({...config, llm: {...(config.llm || {}), provider: e.target.value}})}
                style={{ width: '100%', padding: '6px', backgroundColor: '#1e1e1e', border: '1px solid #333', color: 'white' }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>API URL</label>
              <input 
                type="text" 
                value={config.llm?.url || ''} 
                onChange={e => setConfig({...config, llm: {...(config.llm || {}), url: e.target.value}})}
                style={{ width: '100%', padding: '6px', backgroundColor: '#1e1e1e', border: '1px solid #333', color: 'white' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>API KEY</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showApiKey ? "text" : "password"} 
                  value={config.llm?.key || ''} 
                  onChange={e => setConfig({...config, llm: {...(config.llm || {}), key: e.target.value}})}
                  style={{ width: '100%', padding: '6px', paddingRight: '30px', backgroundColor: '#1e1e1e', border: '1px solid #333', color: 'white' }}
                />
                <div 
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{ position: 'absolute', right: '8px', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center' }}
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </div>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>MODEL</label>
              <input 
                type="text" 
                value={config.llm?.model || ''} 
                onChange={e => setConfig({...config, llm: {...(config.llm || {}), model: e.target.value}})}
                style={{ width: '100%', padding: '6px', backgroundColor: '#1e1e1e', border: '1px solid #333', color: 'white' }}
              />
            </div>
            <button 
              onClick={saveConfig}
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '8px', backgroundColor: 'var(--accent-color)', border: 'none', 
                borderRadius: '4px', color: 'white', cursor: 'pointer', marginTop: '10px'
              }}
            >
              <Save size={14} /> Save Settings
            </button>
            {saveMessage && (
              <div style={{ color: '#4caf50', fontSize: '11px', textAlign: 'center', marginTop: '5px' }}>
                {saveMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

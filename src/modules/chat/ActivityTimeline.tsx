import React, { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useAppStore } from '../../app/store';

export const ActivityTimeline: React.FC<{ tools?: any[], historyMode?: boolean, isLoading?: boolean }> = ({ tools, historyMode, isLoading }) => {
  const [expanded, setExpanded] = useState(!historyMode);
  const { setActiveArtifact } = useAppStore();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
        <Loader2 size={14} className="spin" />
        <span>Rhythm is thinking...</span>
      </div>
    );
  }

  if (!tools || tools.length === 0) return null;

  return (
    <div style={{ 
      marginBottom: '16px', 
      border: '1px solid var(--border-color)', 
      borderRadius: '6px', 
      backgroundColor: 'var(--bg-activity-bar)',
      overflow: 'hidden'
    }}>
      <div 
        onClick={() => setExpanded(!expanded)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          padding: '8px 12px', 
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-sidebar)'
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} color="var(--text-secondary)" />
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
          Used {tools.length} tool{tools.length > 1 ? 's' : ''}
        </span>
      </div>
      
      {expanded && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-color)' }}>
          {tools.map((t, i) => {
            const isSuccess = t.ok !== false; // handle both historical format and streaming meta format
            const toolName = t.name || t.function?.name;
            
            return (
              <div key={i} style={{ marginBottom: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)', fontFamily: 'monospace' }}>
                  <span>{toolName}</span>
                  <span style={{ color: isSuccess ? '#4caf50' : '#f44336' }}>{isSuccess ? '✓' : '✗'}</span>
                </div>
                {/* Interactive Chip for Workflows/Artifacts */}
                {toolName?.startsWith('workflow.') && (
                  <div 
                    onClick={() => setActiveArtifact({ id: 'workflow', type: 'workflow_state', title: 'Workflow Monitor' })}
                    style={{
                      display: 'inline-block',
                      marginTop: '4px',
                      padding: '4px 8px',
                      backgroundColor: 'rgba(0, 122, 204, 0.1)',
                      border: '1px solid var(--accent-color)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: 'var(--accent-color)'
                    }}
                  >
                    View Workflow State
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight, Loader2, BrainCircuit } from 'lucide-react';
import { useAppStore } from '../../app/store';

interface ActivityTimelineProps {
  tools?: any[];
  historyMode?: boolean;
  isLoading?: boolean;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ tools, historyMode, isLoading }) => {
  // Default to collapsed for historyMode, and ALSO default to collapsed for thinking as requested
  const [isExpanded, setIsExpanded] = useState(false);
  const { setActiveArtifact } = useAppStore();

  if (isLoading) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '6px 12px',
            backgroundColor: 'var(--bg-hover)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.2s'
          }}
        >
          <Loader2 size={14} className="spin" color="var(--accent-color)" />
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Thinking...
          </span>
        </div>
        
        {isExpanded && (
          <div style={{ 
            marginTop: '8px', 
            marginLeft: '12px',
            padding: '12px',
            borderLeft: '2px solid var(--accent-color)',
            backgroundColor: 'rgba(0,0,0,0.1)',
            borderRadius: '0 8px 8px 0',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic'
          }}>
            Rhythm is analyzing your request and preparing potential tool calls...
          </div>
        )}
      </div>
    );
  }

  if (!tools || tools.length === 0) return null;

  return (
    <div style={{ 
      marginBottom: '16px', 
      border: '1px solid var(--border-color)', 
      borderRadius: '8px', 
      backgroundColor: 'var(--bg-hover)',
      overflow: 'hidden'
    }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          padding: '10px 14px', 
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-sidebar)',
          borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
        }}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BrainCircuit size={16} color="var(--accent-color)" />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Thinking Process
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {tools.length} step{tools.length > 1 ? 's' : ''}
        </span>
      </div>
      
      {isExpanded && (
        <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-chat)' }}>
          {tools.map((t, i) => {
            const isSuccess = t.ok !== false;
            const toolName = t.name || t.function?.name;
            
            return (
              <div key={i} style={{ 
                marginBottom: '12px', 
                paddingBottom: i < tools.length - 1 ? '12px' : '0',
                borderBottom: i < tools.length - 1 ? '1px solid var(--border-color)' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Wrench size={12} color="var(--text-secondary)" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-color)', fontFamily: 'monospace' }}>
                    {toolName}
                  </span>
                  <span style={{ 
                    fontSize: '10px', 
                    padding: '2px 6px', 
                    borderRadius: '10px',
                    backgroundColor: isSuccess ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                    color: isSuccess ? '#4caf50' : '#f44336',
                    border: `1px solid ${isSuccess ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}`
                  }}>
                    {isSuccess ? 'SUCCESS' : 'FAILED'}
                  </span>
                </div>
                
                {toolName?.startsWith('workflow.') && (
                  <div 
                    onClick={() => setActiveArtifact({ id: 'workflow', type: 'workflow_state', title: 'Workflow Monitor' })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '6px',
                      padding: '4px 10px',
                      backgroundColor: 'rgba(0, 122, 204, 0.1)',
                      border: '1px solid var(--accent-color)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--accent-color)',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 204, 0.2)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 204, 0.1)'}
                  >
                    Open Monitor
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

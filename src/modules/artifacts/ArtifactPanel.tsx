import React from 'react';
import { useAppStore } from '../../app/store';
import { X, ExternalLink } from 'lucide-react';
import { MarkdownView } from './renderers/MarkdownView';
import { WorkflowView } from './renderers/WorkflowView';

export const ArtifactPanel: React.FC = () => {
  const { isArtifactPanelOpen, activeArtifact, toggleArtifactPanel } = useAppStore();

  if (!isArtifactPanelOpen) return null;

  const renderContent = () => {
    if (!activeArtifact) return null;
    
    switch (activeArtifact.type) {
      case 'file':
        return <MarkdownView content={activeArtifact.content} />;
      case 'workflow_state':
        return <WorkflowView />;
      default:
        return <div style={{ color: 'var(--text-secondary)' }}>Unsupported artifact type.</div>;
    }
  };

  return (
    <div style={{
      width: '500px',
      height: '100%',
      backgroundColor: 'var(--bg-artifact)',
      borderLeft: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-4px 0 15px rgba(0,0,0,0.2)',
      zIndex: 10
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-sidebar)'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {activeArtifact?.title}
        </div>
        <div style={{ display: 'flex', gap: '12px', color: 'var(--text-secondary)' }}>
          <ExternalLink size={16} style={{ cursor: 'pointer' }} />
          <X size={16} onClick={toggleArtifactPanel} style={{ cursor: 'pointer' }} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
};

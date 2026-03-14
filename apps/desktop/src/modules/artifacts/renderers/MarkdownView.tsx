import React from 'react';

export const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div style={{ color: 'var(--text-primary)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
      <i>Note: File preview not fully implemented yet. Path:</i><br/><br/>
      <span style={{ fontFamily: 'monospace', color: 'var(--accent-color)' }}>{content}</span>
    </div>
  );
};

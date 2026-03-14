import React, { useEffect, useState } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';

export const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  const [fileData, setFileData] = useState<string | null>(null);

  useEffect(() => {
    // If 'content' looks like a path (contains slashes), try to read it
    if (content.includes('/') || content.includes('\\')) {
      readTextFile(content).then(setFileData).catch(err => {
        console.error("Read file error", err);
        setFileData("Error reading file. Make sure Tauri has permissions to access this path.");
      });
    }
  }, [content]);

  return (
    <div style={{ color: 'var(--text-primary)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
      {fileData ? (
        <div style={{ 
          fontFamily: 'monospace', 
          backgroundColor: 'var(--bg-sidebar)', 
          padding: '12px', 
          borderRadius: '6px',
          border: '1px solid var(--border-color)'
        }}>
          {fileData}
        </div>
      ) : (
        <>
          <i>Path:</i><br/><br/>
          <span style={{ fontFamily: 'monospace', color: 'var(--accent-color)' }}>{content}</span>
        </>
      )}
    </div>
  );
};

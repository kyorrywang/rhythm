import React, { useEffect, useState } from 'react';
import { fetchWorkflowInstances } from '../../../bridge/api';
import { useAppStore } from '../../../app/store';
import { Play, Pause, AlertCircle } from 'lucide-react';

export const WorkflowView: React.FC = () => {
  const { workspacePath } = useAppStore();
  const [instances, setInstances] = useState<any[]>([]);

  useEffect(() => {
    const load = () => fetchWorkflowInstances(workspacePath).then(setInstances);
    load();
    const timer = setInterval(load, 2000); // Poll every 2s for real-time feel
    return () => clearInterval(timer);
  }, [workspacePath]);

  if (instances.length === 0) {
    return <div style={{ color: 'var(--text-secondary)' }}>No active workflows.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {instances.map(inst => {
        const isWaiting = inst.state === 'WAITING_FOR_USER';
        return (
          <div key={inst.id} style={{
            padding: '16px', 
            backgroundColor: 'var(--bg-sidebar)',
            borderRadius: '8px',
            border: isWaiting ? '1px solid #ff9800' : '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{inst.template_id}</strong>
              <span style={{ 
                fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                backgroundColor: isWaiting ? 'rgba(255, 152, 0, 0.2)' : 'var(--bg-hover)',
                color: isWaiting ? '#ff9800' : 'var(--text-secondary)'
              }}>
                {inst.state}
              </span>
            </div>
            
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Step: {inst.current_step_index + 1}
            </div>

            {isWaiting && (
              <div style={{ 
                padding: '10px', backgroundColor: 'var(--bg-hover)', borderRadius: '6px',
                display: 'flex', gap: '8px', alignItems: 'flex-start'
              }}>
                <AlertCircle size={16} color="#ff9800" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  <strong>Waiting for input:</strong><br/>
                  {inst.pending_question}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

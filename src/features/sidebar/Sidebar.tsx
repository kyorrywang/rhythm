import { useState, useEffect } from 'react';
import { Settings, Plus, Loader2 } from 'lucide-react';
import { useSessions, useSessionStore } from '@/shared/state/useSessionStore';
import { getSessions, createSession } from '@/shared/api/commands';
import { useToast } from '@/shared/hooks/useToast';
import { SessionItem } from './SessionItem';
import { ProjectHeader } from './ProjectHeader';

export const Sidebar = () => {
  const sessions = useSessions();
  const { setActiveSession, activeSessionId, addSession, setSessions, setSettingsOpen } = useSessionStore();
  const { error: showError } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const sessions = await getSessions();
      setSessions(sessions);
      const state = useSessionStore.getState();
      const hasActive = state.activeSessionId && sessions.some((session) => session.id === state.activeSessionId);
      if (!hasActive && sessions.length > 0) {
        setActiveSession(sessions[0].id);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await createSession('New Session');
      addSession(session);
      setActiveSession(session.id);
    } catch (err) {
      showError('Failed to create session');
    }
  };

  return (
    <div className="flex h-screen shrink-0 bg-[#fbfbfb]">
      {/* Leftmost Global Rail */}
      <div className="w-[50px] border-r border-[#f0f0f0] flex flex-col items-center py-4 bg-[#f8f9fa]">
        <div className="flex flex-col gap-3">
          <button className="w-8 h-8 rounded-lg border border-teal-200 text-teal-700 bg-teal-50 flex items-center justify-center font-bold relative text-[13px]">
            R
            <div className="absolute top-0 right-0 w-2 h-2 bg-red-400 border border-white rounded-full translate-x-1/2 -translate-y-1/3"></div>
          </button>
          <button className="w-8 h-8 rounded-lg bg-pink-50 text-pink-500 flex items-center justify-center font-medium text-[13px]">
            N
          </button>
          <button
            onClick={handleNewSession}
            className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
            title="设置"
          >
            <Settings size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Project Session Sidebar */}
      <div className="w-[230px] border-r border-[#f0f0f0] flex flex-col">
        <ProjectHeader onNewSession={handleNewSession} />

        {/* Session List */}
        <div className="flex-1 overflow-y-auto mt-2 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-[2px] px-2">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => setActiveSession(session.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

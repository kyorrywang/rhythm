import { Sidebar } from '@/features/sidebar/Sidebar';
import { SessionContainer } from '@/features/session/SessionContainer';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { ToastContainer } from '@/components/layout/Toast';
import { useSessionStore } from '@/store/useSessionStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function App() {
  const isSettingsOpen = useSessionStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);

  useKeyboardShortcuts({
    'ctrl+,': () => setSettingsOpen(true),
    escape: () => {
      if (isSettingsOpen) {
        setSettingsOpen(false);
      }
    },
  });

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full font-sans antialiased bg-white text-gray-800">
        <Sidebar />
        <SessionContainer />
      </div>
      {isSettingsOpen && (
        <SettingsPage onClose={() => setSettingsOpen(false)} />
      )}
      <ToastContainer />
    </ErrorBoundary>
  );
}

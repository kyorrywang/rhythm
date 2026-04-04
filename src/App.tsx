import { Sidebar } from '@/features/sidebar/Sidebar';
import { SessionContainer } from '@/features/session/SessionContainer';

export function App() {
  return (
    <div className="flex h-screen w-full font-sans antialiased bg-white text-gray-800">
      <Sidebar />
      <SessionContainer />
    </div>
  );
}

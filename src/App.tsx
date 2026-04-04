import { Sidebar } from './Sidebar';
import { SessionArea } from './SessionArea';

export function App() {
  return (
    <div className="flex h-screen w-full font-sans antialiased bg-white text-gray-800">
      <Sidebar />
      <SessionArea />
    </div>
  );
}

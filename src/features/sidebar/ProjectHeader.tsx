import { FileEdit } from 'lucide-react';

interface ProjectHeaderProps {
  onNewSession: () => void;
}

export const ProjectHeader = ({ onNewSession }: ProjectHeaderProps) => {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-[14px]">
        <div className="flex-1 overflow-hidden ml-2">
          <h2 className="text-[13px] font-medium text-gray-800 leading-tight">rhythm</h2>
          <p className="text-[10px] text-gray-400 truncate mt-0.5" title="~\Documents\dev\rhythm">~\Documents\dev\rhythm</p>
        </div>
      </div>
      
      <button
        onClick={onNewSession}
        className="w-full flex items-center justify-center gap-1.5 py-[5px] px-3 bg-white border border-[#e8e8e8] hover:border-gray-300 rounded shadow-sm text-gray-700 text-[13px] transition-colors"
      >
        <FileEdit size={14} opacity={0.6} />
        新建会话
      </button>
    </div>
  );
};

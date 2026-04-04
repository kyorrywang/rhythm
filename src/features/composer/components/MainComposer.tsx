import { Plus, ArrowUp, Shield, ChevronDown, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MainComposerProps, DockType } from '../types';

const PLACEHOLDER_MAP: Record<DockType, string> = {
  none: '随便问点什么...',
  append: '发送引导消息，插队到当前对话中...',
  ask: '请输入...',
};

const SUBMIT_ICON_MAP: Record<DockType, React.ReactNode> = {
  none: <ArrowUp size={16} strokeWidth={2.5} />,
  append: <Square size={13} fill="currentColor" strokeWidth={0} />,
  ask: <ArrowUp size={16} strokeWidth={2.5} />,
};

export const MainComposer = ({ text, onTextChange, onSend, dockType, headerContent }: MainComposerProps) => {
  const hasContent = text.trim().length > 0;

  return (
    <div className="w-full max-w-[700px] mx-auto pb-6 relative z-20">
      <div className="bg-white border text-left border-gray-200 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all flex flex-col pointer-events-auto relative">
        {headerContent}

        <div className="min-h-[80px] p-3 flex flex-col">
          <textarea
            value={text}
            className="w-full flex-1 resize-none bg-transparent outline-none text-[14px] text-gray-800 placeholder:text-gray-400 min-h-[40px] px-1"
            placeholder={PLACEHOLDER_MAP[dockType]}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between px-3 pb-3">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-md transition-colors">
            <Plus size={18} />
          </button>
          
          <button 
            onClick={onSend}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-md transition-colors",
              hasContent
                ? "bg-black text-white hover:bg-gray-800 shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
                : "bg-[#dbdbdb] text-white cursor-not-allowed"
            )}
          >
            {SUBMIT_ICON_MAP[dockType]}
          </button>
        </div>

        <div className="flex items-center px-3 py-2 border-t border-gray-100 bg-[#fbfbfb] rounded-b-xl gap-3 text-[12px] text-gray-500">
          <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            Build <ChevronDown size={12} />
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            <span className="font-bold font-serif italic mr-0.5">Z</span> Big Pickle <ChevronDown size={12} />
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            默认 <ChevronDown size={12} />
          </div>
          <div className="flex-1" />
          <div className="text-green-500 cursor-pointer hover:text-green-600">
            <Shield size={14} />
          </div>
        </div>
      </div>
    </div>
  );
};

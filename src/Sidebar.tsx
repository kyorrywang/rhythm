import { Settings, HelpCircle, Loader2, Pin, Archive, Plus, FileEdit, MoreHorizontal } from 'lucide-react';

export const Sidebar = () => {
  const sessions = [
    { id: 1, title: '前端编译报错修复', time: '10分钟前', running: false },
    { id: 2, title: 'React frontend project revie...', time: '1小时前', running: false },
    { id: 3, title: 'React site homepage styling...', time: '昨天', running: false },
    { id: 4, title: 'React首页样式调试', time: '昨天', running: true },
    { id: 5, title: 'Tooltip context error and De...', time: '3天前', running: false },
  ];

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
          <button className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 flex items-center justify-center transition-colors">
            <Plus size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <button className="w-8 h-8 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
            <Settings size={18} strokeWidth={2} />
          </button>
          <button className="w-8 h-8 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
            <HelpCircle size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Project Session Sidebar */}
      <div className="w-[230px] border-r border-[#f0f0f0] flex flex-col">
        {/* Project Header */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-[14px]">
            <div className="flex-1 overflow-hidden ml-2">
              <h2 className="text-[13px] font-medium text-gray-800 leading-tight">rhythm</h2>
              <p className="text-[10px] text-gray-400 truncate mt-0.5" title="~\Documents\dev\rhythm">~\Documents\dev\rhythm</p>
            </div>
            <button className="text-gray-400 hover:bg-gray-100 rounded p-1 inline-flex shrink-0">
              <MoreHorizontal size={14} />
            </button>
          </div>
          
          <button className="w-full flex items-center justify-center gap-1.5 py-[5px] px-3 bg-white border border-[#e8e8e8] hover:border-gray-300 rounded shadow-sm text-gray-700 text-[13px] transition-colors">
            <FileEdit size={14} opacity={0.6} />
            新建会话
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto mt-2 pb-4">
          <div className="space-y-[2px] px-2">
            {sessions.map((session) => (
              <div 
                key={session.id} 
                className="group relative flex items-center justify-between py-1.5 px-2 hover:bg-[#efefef] rounded-md cursor-pointer transition-colors"
              >
                <div className="flex items-center overflow-hidden mr-2">
                  <div className="w-4 flex items-center justify-center shrink-0 mr-1">
                    {/* Hover Pin Icon */}
                    <div className="hidden group-hover:flex text-gray-500">
                      <Pin size={12} strokeWidth={2.5} className="rotate-45" />
                    </div>
                    {/* Running Spinner or Dash */}
                    <div className="group-hover:hidden flex">
                      {session.running ? (
                        <Loader2 size={12} className="animate-spin text-gray-400" />
                      ) : (
                        <div className="w-[6px] h-[1.5px] bg-gray-300 rounded-full" />
                      )}
                    </div>
                  </div>
                  <span className="text-[13px] text-gray-700 truncate">{session.title}</span>
                </div>
                
                {/* Right side area: Time or Hover Archive Icon */}
                <div className="shrink-0 flex items-center justify-end w-12 text-right">
                  <span className="text-[10px] text-gray-400 group-hover:hidden line-clamp-1">{session.time}</span>
                  <div className="hidden group-hover:flex gap-1">
                    <button className="text-gray-400 hover:text-gray-700 p-0.5 rounded">
                      <Archive size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 mt-3 text-[12px] text-gray-400 hover:text-gray-600 cursor-pointer">
            加载更多
          </div>
        </div>
      </div>
    </div>
  );
};

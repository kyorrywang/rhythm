import { GitBranch, Undo, Edit3, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { Message } from '@/types/schema';

interface UserMessageProps {
  message: Message;
}

export const UserMessage = ({ message }: UserMessageProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group flex flex-col relative w-full pt-4"
    >
      <div className="bg-transparent border border-gray-200 rounded-xl px-4 py-3 text-gray-800 w-fit self-end mr-4 max-w-[80%] whitespace-pre-wrap">
        {message.content}
      </div>
      {/* Hover actions below user message */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-4 mt-1 text-[11px] text-gray-400 self-end mr-6 absolute -bottom-6 right-0 bg-white/80 px-2 rounded-full py-0.5">
        <div className="flex gap-2 items-center mr-2">
          <span>Build</span>
          <span className="w-1 h-1 rounded-full bg-gray-300"></span>
          <span>刚刚</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Fork"><GitBranch size={12}/></button>
          <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Undo"><Undo size={12}/></button>
          <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Edit"><Edit3 size={12}/></button>
          <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Copy"><Copy size={12}/></button>
        </div>
      </div>
    </motion.div>
  );
};

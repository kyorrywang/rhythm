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
      className="group flex flex-col relative w-full pt-4 pb-1"
    >
      <div className="flex flex-col items-end mr-4">
        {/* Chat Bubble */}
        <div className="bg-gray-100 text-gray-800 rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed max-w-[85%] whitespace-pre-wrap select-text">
          {message.content}
        </div>
        
        {/* Hover Actions */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-3 mt-2 mr-2 text-[12px] text-gray-400 h-6">
          <div className="flex items-center gap-0.5">
            <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors" title="Fork"><GitBranch size={14}/></button>
            <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors" title="Undo"><Undo size={14}/></button>
            <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
            <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors" title="Copy"><Copy size={14}/></button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

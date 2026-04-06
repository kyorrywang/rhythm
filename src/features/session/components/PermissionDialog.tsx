import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import type { PermissionRequest } from '@/shared/state/usePermissionStore';
import { useLLMStream } from '@/features/session/hooks/useLLMStream';
import { useState, useCallback } from 'react';
import { usePermissionStore } from '@/shared/state/usePermissionStore';

interface PermissionDialogProps {
  request: PermissionRequest;
  onResolve: (toolId: string, approved: boolean) => void;
}

export const PermissionDialog = ({ request, onResolve }: PermissionDialogProps) => {
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const { approvePermission: approvePermissionRequest } = useLLMStream();
  const allowToolAlways = usePermissionStore((s) => s.allowToolAlways);

  const handleApprove = useCallback(async () => {
    if (alwaysAllow) {
      allowToolAlways(request.toolName);
    }
    await approvePermissionRequest(request.sessionId, request.toolId, true);
    onResolve(request.toolId, true);
  }, [request, approvePermissionRequest, onResolve, alwaysAllow, allowToolAlways]);

  const handleDeny = useCallback(async () => {
    await approvePermissionRequest(request.sessionId, request.toolId, false);
    onResolve(request.toolId, false);
  }, [request, approvePermissionRequest, onResolve]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[480px] max-w-[90vw] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <ShieldAlert size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-800">权限确认</h3>
            <p className="text-xs text-gray-500">{request.toolName}</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">原因</p>
            <p className="text-sm text-gray-700">{request.reason}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="rounded border-gray-300"
            />
            始终允许此工具
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={handleDeny}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            拒绝
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 text-sm text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <ShieldCheck size={14} />
            允许
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

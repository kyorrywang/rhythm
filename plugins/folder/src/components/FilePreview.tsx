import type { WorkbenchProps } from '../../../../src/plugin-host';
import type { FilePreviewPayload } from '../types';
import { fileStatusDescription } from '../utils';

export function FilePreview({ payload }: WorkbenchProps<FilePreviewPayload>) {
  const status = fileStatusDescription(payload);

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="font-medium text-slate-700">Path: {payload.path}</div>
        <div className="mt-1">{status}</div>
      </div>
      {payload.is_binary ? (
        <EmptyPreview title="二进制文件" message="该文件包含二进制内容，当前预览器不会直接渲染。" />
      ) : payload.encoding_error ? (
        <EmptyPreview title="编码无法解析" message={payload.encoding_error} />
      ) : (
        <pre className="min-h-full whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
          {payload.content || '暂无文件内容'}
        </pre>
      )}
    </div>
  );
}

function EmptyPreview({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
    </div>
  );
}

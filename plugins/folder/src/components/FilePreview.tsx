import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import type { FilePreviewPayload } from '../types';
import { fileStatusDescription } from '../utils';

export function FilePreview({ payload }: WorkbenchProps<FilePreviewPayload>) {
  const status = fileStatusDescription(payload);
  const lines = (payload.content || '').split('\n');

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="font-medium text-slate-700">Path: {payload.path}</div>
        <div className="mt-1">{status}</div>
        {payload.line && (
          <div className="mt-1 text-amber-700">
            Target: line {payload.line}{payload.column ? `, column ${payload.column}` : ''}
          </div>
        )}
      </div>
      {payload.is_binary ? (
        <EmptyPreview title="二进制文件" message="该文件包含二进制内容，当前预览器不会直接渲染。" />
      ) : payload.encoding_error ? (
        <EmptyPreview title="编码无法解析" message={payload.encoding_error} />
      ) : (
        <div className="min-h-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 py-4 text-xs leading-6 text-slate-100">
          {payload.content ? lines.map((line, index) => {
            const lineNumber = index + 1;
            const active = payload.line === lineNumber;
            return (
              <div
                key={lineNumber}
                className={`flex gap-4 px-4 ${active ? 'bg-amber-500/20 text-amber-50' : ''}`}
              >
                <span className="w-10 shrink-0 select-none text-right text-slate-500">{lineNumber}</span>
                <span className="whitespace-pre-wrap">{line || ' '}</span>
              </div>
            );
          }) : (
            <div className="px-4 text-slate-400">暂无文件内容</div>
          )}
        </div>
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

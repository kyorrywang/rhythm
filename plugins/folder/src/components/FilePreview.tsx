import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { CopyIconButton, EmptyState, WorkbenchPage } from '../../../../src/shared/ui';
import type { FilePreviewPayload } from '../types';

export function FilePreview({ payload }: WorkbenchProps<FilePreviewPayload>) {
  const lines = payload.content ? payload.content.split('\n') : [];
  const canCopy = !payload.is_binary && !payload.encoding_error && Boolean(payload.content);

  return (
    <WorkbenchPage
      title="File Preview"
      showHeader={false}
      className="px-6 pt-0 pb-6"
    >
      <div className="group relative">
        {canCopy ? (
          <div className="pointer-events-none sticky top-[2px] z-10 -mb-8 flex justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <CopyIconButton
              text={payload.content || ''}
              className="pointer-events-auto"
            />
          </div>
        ) : null}
        {payload.is_binary ? (
          <EmptyPreview title="二进制文件" message="该文件包含二进制内容，当前预览器不会直接渲染。" />
        ) : payload.encoding_error ? (
          <EmptyPreview title="编码无法解析" message={payload.encoding_error} />
        ) : (
          <div className="min-h-full overflow-hidden bg-transparent pr-10 text-xs leading-6 text-[var(--theme-text-primary)]">
            {lines.length > 0 ? (
              <div className="overflow-auto">
                <div className="min-w-full">
                  {lines.map((line, index) => (
                    <div key={`${index + 1}-${line}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
                      <div className="select-none pr-2 text-right text-[var(--theme-text-muted)]">
                        {index + 1}
                      </div>
                      <pre className="whitespace-pre-wrap break-words">{line || ' '}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-0 py-0 text-[var(--theme-text-muted)]">暂无文件内容</div>
            )}
          </div>
        )}
      </div>
    </WorkbenchPage>
  );
}

function EmptyPreview({ title, message }: { title: string; message: string }) {
  return <EmptyState title={title} description={message} />;
}

import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { Card, CopyIconButton, EmptyState, WorkbenchPage } from '../../../../src/shared/ui';
import type { FilePreviewPayload } from '../types';

export function FilePreview({ payload }: WorkbenchProps<FilePreviewPayload>) {
  const lines = payload.content ? payload.content.split('\n') : [];
  const canCopy = !payload.is_binary && !payload.encoding_error && Boolean(payload.content);

  return (
    <WorkbenchPage
      title="File Preview"
      showHeader={false}
      className="overflow-hidden px-6 pt-0 pb-6"
    >
      <div className="group/file-preview h-full min-h-0">
        {payload.is_binary ? (
          <EmptyPreview title="二进制文件" message="该文件包含二进制内容，当前预览器不会直接渲染。" />
        ) : payload.encoding_error ? (
          <EmptyPreview title="编码无法解析" message={payload.encoding_error} />
        ) : (
          <Card className="relative flex h-full min-h-0 flex-col overflow-hidden text-xs leading-6 text-[var(--theme-text-primary)]">
            {canCopy ? (
              <div className="pointer-events-none absolute right-[var(--theme-card-padding-x)] top-[var(--theme-card-padding-y)] z-10 opacity-0 transition-opacity duration-150 group-hover/file-preview:opacity-100 group-focus-within/file-preview:opacity-100">
                <CopyIconButton
                  text={payload.content || ''}
                  className="pointer-events-auto"
                />
              </div>
            ) : null}
            {lines.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)] pr-10">
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
              <div className="px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)] pr-10 text-[var(--theme-text-muted)]">暂无文件内容</div>
            )}
          </Card>
        )}
      </div>
    </WorkbenchPage>
  );
}

function EmptyPreview({ title, message }: { title: string; message: string }) {
  return <EmptyState title={title} description={message} />;
}

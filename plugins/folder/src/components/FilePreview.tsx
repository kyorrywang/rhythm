import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { Badge, Card, EmptyState, PropertyList, WorkbenchPage, WorkbenchSection } from '../../../../src/shared/ui';
import { themeRecipes } from '../../../../src/shared/theme/recipes';
import type { FilePreviewPayload } from '../types';
import { fileStatusDescription } from '../utils';

export function FilePreview({ payload }: WorkbenchProps<FilePreviewPayload>) {
  const status = fileStatusDescription(payload);

  return (
    <WorkbenchPage
      eyebrow="File"
      title={payload.path.split(/[\\/]/).pop() || payload.path}
      description={payload.path}
      actions={<Badge tone="muted">{status}</Badge>}
    >
      <WorkbenchSection
        title="概况"
        description={payload.line ? `当前定位到第 ${payload.line} 行${payload.column ? `，第 ${payload.column} 列` : ''}。` : '当前展示的是文件原始文本内容。'}
      >
        <div className="mb-[var(--theme-section-gap)] grid gap-[var(--theme-section-gap)] xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <PropertyList
              items={[
                { label: '文件名', value: payload.path.split(/[\\/]/).pop() || payload.path },
                { label: '类型', value: payload.is_binary ? '二进制' : '文本' },
                { label: '大小', value: `${payload.size} B` },
                { label: '状态', value: status },
                { label: '定位', value: payload.line ? `第 ${payload.line} 行${payload.column ? `，第 ${payload.column} 列` : ''}` : '无' },
              ]}
            />
          </Card>
          <Card tone="muted" className={`text-[length:var(--theme-meta-size)] leading-6 ${themeRecipes.description()}`}>
            轻量查看器，适合快速核对路径、大小和文本内容。更复杂的代码理解、富文本和图片渲染后续可以交给专门插件处理。
          </Card>
        </div>

        {payload.is_binary ? (
          <EmptyPreview title="二进制文件" message="该文件包含二进制内容，当前预览器不会直接渲染。" />
        ) : payload.encoding_error ? (
          <EmptyPreview title="编码无法解析" message={payload.encoding_error} />
        ) : (
          <>
            <div className={`mb-[var(--theme-toolbar-gap)] ${themeRecipes.eyebrow()}`}>内容</div>
            <div className="min-h-full overflow-hidden rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-code-bg)] text-xs leading-6 text-[var(--theme-code-text)] shadow-[var(--theme-shadow-soft)]">
              {payload.content ? (
                <pre className="overflow-auto px-4 py-4 whitespace-pre-wrap break-words">{payload.content}</pre>
              ) : (
                <div className="px-4 py-4 text-[var(--theme-code-muted)]">暂无文件内容</div>
              )}
            </div>
          </>
        )}
      </WorkbenchSection>
    </WorkbenchPage>
  );
}

function EmptyPreview({ title, message }: { title: string; message: string }) {
  return <EmptyState title={title} description={message} />;
}

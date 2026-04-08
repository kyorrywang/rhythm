import type { KeyboardEvent, PointerEvent } from 'react';

export const SidebarResizeHandle = ({
  width,
  minWidth,
  maxWidth,
  onPointerDown,
  onKeyDown,
}: {
  width: number;
  minWidth: number;
  maxWidth: number;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) => (
  <div
    role="separator"
    aria-label="调整左侧面板宽度"
    aria-orientation="vertical"
    aria-valuemin={minWidth}
    aria-valuemax={maxWidth}
    aria-valuenow={width}
    tabIndex={0}
    onPointerDown={onPointerDown}
    onKeyDown={onKeyDown}
    className="group relative z-20 h-full w-px shrink-0 cursor-col-resize bg-[var(--theme-border)] outline-none transition-colors hover:bg-[var(--theme-accent)] focus:bg-[var(--theme-accent)]"
  >
    <div className="absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-transparent" />
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-border-strong)] opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100" />
  </div>
);

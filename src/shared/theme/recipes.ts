import { cn } from '@/shared/lib/utils';

export const themeRecipes = {
  appShell: () => 'bg-[var(--theme-shell-bg)] text-[var(--theme-text-primary)]',
  activityRail: () => 'border-r-[var(--theme-border-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-rail-bg-start)_0%,var(--theme-rail-bg-end)_100%)]',
  activityItem: (active: boolean) =>
    cn(
      'flex h-[var(--theme-activity-size)] w-[var(--theme-activity-size)] items-center justify-center rounded-[var(--theme-activity-radius)] border-[var(--theme-border-width)] transition-all duration-200',
      active
        ? 'translate-y-[-1px] border-[var(--theme-activity-active-border)] bg-[var(--theme-activity-active-bg)] text-[var(--theme-activity-active-text)] shadow-[var(--theme-activity-active-shadow)]'
        : 'border-[var(--theme-activity-border)] bg-[var(--theme-activity-bg)] text-[var(--theme-activity-text)] hover:border-[var(--theme-activity-border)] hover:bg-[var(--theme-activity-hover-bg)] hover:text-[var(--theme-activity-hover-text)]',
    ),
  leftPanelShell: () => 'bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)]',
  workbenchShell: () => 'bg-[linear-gradient(180deg,var(--theme-workbench-bg-start)_0%,var(--theme-workbench-bg-end)_100%)]',
  workbenchSurface: () => 'rounded-[var(--theme-radius-shell)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-[var(--theme-shadow-strong)]',
  overlayBackdrop: () => 'bg-[var(--theme-overlay-backdrop)]',
  overlaySurface: (kind: 'drawer' | 'modal') =>
    cn(
      'overflow-hidden border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-[var(--theme-shadow-strong)]',
      kind === 'modal'
        ? 'rounded-[var(--theme-radius-shell)] border-[var(--theme-border-width)]'
        : 'border-l-[var(--theme-border-width)]',
    ),
  floatingSurface: () => 'z-50 origin-[--radix-popover-content-transform-origin] rounded-[var(--theme-floating-radius)] border-[var(--theme-border-width)] border-[var(--theme-floating-border)] bg-[var(--theme-floating-bg)] p-[var(--theme-floating-padding)] text-[var(--theme-text-primary)] shadow-[var(--theme-floating-shadow)] backdrop-blur-xl outline-none data-[state=closed]:animate-[composer-popover-out_120ms_ease-in_forwards] data-[state=open]:animate-[composer-popover-in_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]',
  floatingHeader: () => 'mb-[var(--theme-floating-group-gap)] border-b-[var(--theme-divider-width)] border-[var(--theme-floating-header-border)] px-[var(--theme-control-padding-x-sm)] pb-[var(--theme-floating-group-gap)] pt-[calc(var(--theme-floating-group-gap)*0.8)]',
  floatingGroupLabel: () => 'px-[var(--theme-control-padding-x-sm)] py-1 text-[length:var(--theme-eyebrow-size)] uppercase tracking-[var(--theme-eyebrow-spacing)] text-[var(--theme-floating-group-label)]',
  panelShell: () => 'rounded-[var(--theme-radius-shell)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)] shadow-[var(--theme-shadow-strong)]',
  surfaceCard: () => 'rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)]',
  mutedCard: () => 'rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)]',
  card: (tone: 'default' | 'muted' | 'success' | 'warning' | 'danger' = 'default') =>
    cn(
      'rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]',
      tone === 'muted'
        ? 'border-[var(--theme-border)] bg-[var(--theme-surface-muted)]'
        : tone === 'success'
          ? 'border-[var(--theme-success-border)] bg-[var(--theme-success-surface)]'
          : tone === 'warning'
            ? 'border-[var(--theme-warning-border)] bg-[var(--theme-warning-surface)]'
            : tone === 'danger'
              ? 'border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)]'
              : 'border-[var(--theme-border)] bg-[var(--theme-surface)]',
    ),
  eyebrow: () => 'text-[length:var(--theme-eyebrow-size)] uppercase tracking-[var(--theme-eyebrow-spacing)] text-[var(--theme-text-muted)]',
  title: () => 'font-[var(--theme-title-weight)] text-[length:var(--theme-title-size)] leading-tight text-[var(--theme-text-primary)]',
  sectionTitle: () => 'font-[var(--theme-title-weight)] text-[length:var(--theme-section-title-size)] leading-tight text-[var(--theme-text-primary)]',
  description: () => 'text-[length:var(--theme-body-size)] leading-6 text-[var(--theme-text-secondary)]',
  field: () => 'w-full rounded-[var(--theme-radius-control)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] text-[length:var(--theme-body-size)] text-[var(--theme-text-primary)] outline-none transition-colors focus:border-[var(--theme-accent)]',
  fieldMuted: () => 'w-full rounded-[var(--theme-radius-control)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)] text-[length:var(--theme-body-size)] text-[var(--theme-text-primary)] outline-none transition-colors focus:border-[var(--theme-accent)]',
  textarea: () => 'min-h-[var(--theme-textarea-min-height)] px-[var(--theme-control-padding-x-md)] py-[calc(var(--theme-control-padding-x-md)*0.8)]',
  tag: () => 'rounded-full bg-[var(--theme-surface)] px-[calc(var(--theme-control-padding-x-sm)*0.95)] py-1 text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)] shadow-sm',
  badge: (tone: 'default' | 'muted' | 'success' | 'warning' | 'danger' = 'default') =>
    cn(
      'inline-flex min-h-[calc(var(--theme-control-height-sm)-0.3rem)] items-center rounded-full px-[calc(var(--theme-control-padding-x-sm)*0.95)] py-1 text-[length:var(--theme-meta-size)] font-medium',
      tone === 'success'
        ? 'bg-[var(--theme-success-surface)] text-[var(--theme-success-text)]'
        : tone === 'warning'
          ? 'bg-[var(--theme-warning-surface)] text-[var(--theme-warning-text)]'
          : tone === 'danger'
            ? 'bg-[var(--theme-danger-surface)] text-[var(--theme-danger-text)]'
            : tone === 'muted'
              ? 'bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)]'
              : 'bg-[var(--theme-surface-subtle)] text-[var(--theme-text-secondary)]',
    ),
  emptyState: () => 'rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)] px-[var(--theme-card-padding-x)] py-[calc(var(--theme-card-padding-y)*1.4)] text-center',
  errorState: () => 'rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)] px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]',
  iconButton: () => 'flex h-[var(--theme-icon-button-size)] w-[var(--theme-icon-button-size)] items-center justify-center rounded-[var(--theme-radius-control)] text-[var(--theme-text-muted)] transition-colors hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]',
  searchField: () => 'flex min-h-[var(--theme-control-height-md)] items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-control)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] px-[var(--theme-control-padding-x-md)] text-[length:var(--theme-body-size)] text-[var(--theme-text-secondary)] focus-within:border-[var(--theme-accent)]',
  listRow: (active: boolean) =>
    cn(
      'relative flex w-full cursor-pointer items-start justify-between rounded-[var(--theme-list-row-radius)] border-[var(--theme-border-width)] px-[var(--theme-row-padding-x)] py-[var(--theme-row-padding-y)] outline-none transition-all duration-200',
      active
        ? 'translate-y-[-1px] border-[var(--theme-list-row-active-border)] bg-[var(--theme-list-row-active-bg)] shadow-[var(--theme-list-row-active-shadow)]'
        : 'border-[var(--theme-list-row-border)] bg-[var(--theme-list-row-bg)] hover:border-[var(--theme-list-row-hover-border)] hover:bg-[var(--theme-list-row-hover-bg)]',
    ),
  listRowTitle: (active: boolean) =>
    active ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text-primary)]',
  listRowMeta: (active: boolean) =>
    active ? 'text-[var(--theme-list-row-active-meta)]' : 'text-[var(--theme-list-row-meta)]',
  listRowMetaBadge: (active: boolean) =>
    cn(
      'rounded-full px-[calc(var(--theme-control-padding-x-sm)*0.6)] py-[0.15rem]',
      active ? 'bg-[var(--theme-list-row-active-meta-bg)]' : 'bg-[var(--theme-list-row-meta-bg)]',
    ),
  toolbar: () => 'flex flex-wrap items-center gap-[var(--theme-toolbar-gap)]',
  actionBar: () => 'flex items-center justify-between gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-[var(--theme-card-padding-x)] py-[calc(var(--theme-card-padding-y)*0.9)]',
  formSection: () => 'space-y-[var(--theme-section-gap)]',
  chipToggle: () => 'inline-flex min-h-[var(--theme-control-height-sm)] items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-chip-radius)] border-[var(--theme-border-width)] border-[var(--theme-chip-border)] bg-[var(--theme-chip-bg)] px-[var(--theme-control-padding-x-sm)] text-[length:var(--theme-meta-size)] text-[var(--theme-chip-text)] shadow-[var(--theme-chip-shadow)] transition-all duration-150 hover:bg-[var(--theme-chip-hover-bg)] hover:text-[var(--theme-chip-hover-text)] data-[state=open]:border-[var(--theme-chip-open-border)] data-[state=open]:bg-[var(--theme-chip-open-bg)] data-[state=open]:text-[var(--theme-chip-open-text)] data-[state=open]:shadow-[var(--theme-chip-open-shadow)] disabled:cursor-not-allowed disabled:opacity-60',
  selectionRow: (selected: boolean) =>
    cn(
      'flex w-full items-start justify-between gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-selection-radius)] border-[var(--theme-border-width)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.8)] text-left transition-colors',
      selected
        ? 'border-[var(--theme-selection-selected-border)] bg-[var(--theme-selection-selected-bg)] text-[var(--theme-selection-selected-text)] shadow-[var(--theme-selection-selected-shadow)]'
        : 'border-[var(--theme-selection-border)] bg-[var(--theme-selection-bg)] text-[var(--theme-selection-text)] hover:bg-[var(--theme-selection-hover-bg)] hover:text-[var(--theme-selection-hover-text)]',
    ),
  selectionIndicator: (selected: boolean) =>
    selected ? 'bg-[var(--theme-selection-selected-indicator)]' : 'bg-[var(--theme-selection-indicator)]',
  selectionTitle: () => 'block text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] leading-5 text-[var(--theme-selection-title)]',
  selectionDescription: (selected: boolean) =>
    cn(
      'mt-0.5 block text-[length:var(--theme-meta-size)] leading-5',
      selected ? 'text-[var(--theme-selection-selected-description)]' : 'text-[var(--theme-selection-description)]',
    ),
  button: (variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'unstyled') => {
    switch (variant) {
      case 'primary':
        return 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] hover:bg-[var(--theme-accent-hover)] disabled:opacity-50';
      case 'secondary':
        return 'border border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-muted)] disabled:opacity-50';
      case 'ghost':
        return 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)] disabled:opacity-40';
      case 'danger':
        return 'bg-[var(--theme-danger)] text-white hover:bg-[var(--theme-danger-hover)] disabled:opacity-50';
      case 'link':
        return 'px-0 py-0 text-[var(--theme-accent)] underline-offset-2 hover:text-[var(--theme-accent-hover)] hover:underline disabled:opacity-40';
      case 'unstyled':
      default:
        return '';
    }
  },
  buttonSize: (size: 'sm' | 'md' | 'lg' | 'icon' | 'none') => {
    switch (size) {
      case 'sm':
        return 'h-[var(--theme-control-height-sm)] px-[var(--theme-control-padding-x-sm)] text-[length:var(--theme-meta-size)]';
      case 'md':
        return 'h-[var(--theme-control-height-md)] px-[var(--theme-control-padding-x-md)] text-[length:var(--theme-body-size)]';
      case 'lg':
        return 'h-[var(--theme-control-height-lg)] px-[var(--theme-control-padding-x-lg)] text-[length:var(--theme-body-size)]';
      case 'icon':
        return 'h-[var(--theme-icon-button-size)] w-[var(--theme-icon-button-size)] p-0';
      case 'none':
      default:
        return '';
    }
  },
};

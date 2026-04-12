import { themeRecipes } from '@/ui/theme/recipes';

export function PropertyList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-[calc(var(--theme-toolbar-gap)*0.85)]">
      {items.map((item) => (
        <div key={`${item.label}:${item.value}`} className="flex items-start justify-between gap-[var(--theme-toolbar-gap)] border-b-[var(--theme-divider-width)] border-[var(--theme-border)] py-[calc(var(--theme-row-padding-y)*0.7)] last:border-b-0">
          <div className={`font-medium ${themeRecipes.description()}`}>{item.label}</div>
          <div className="text-right text-[length:var(--theme-meta-size)] leading-5 text-[var(--theme-text-secondary)]">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

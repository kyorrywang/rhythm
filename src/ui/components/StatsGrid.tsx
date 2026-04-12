import { Card } from '@/ui/components/Card';
import { themeRecipes } from '@/ui/theme/recipes';

interface StatsGridItem {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger';
}

export function StatCard({
  label,
  value,
  tone = 'default',
}: StatsGridItem) {
  return (
    <Card tone={tone === 'muted' ? 'default' : tone}>
      <div className={themeRecipes.eyebrow()}>{label}</div>
      <div className={`mt-[var(--theme-panel-header-gap)] break-all ${themeRecipes.sectionTitle()}`}>{value}</div>
    </Card>
  );
}

export function StatsGrid({
  items,
  columnsClassName = 'md:grid-cols-2 lg:grid-cols-4',
}: {
  items: StatsGridItem[];
  columnsClassName?: string;
}) {
  return (
    <div className={`grid gap-[var(--theme-section-gap)] ${columnsClassName}`}>
      {items.map((item) => (
        <StatCard key={`${item.label}:${item.value}`} {...item} />
      ))}
    </div>
  );
}

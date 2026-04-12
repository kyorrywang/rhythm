import { Badge } from '@/ui/components/Badge';
import { Card } from '@/ui/components/Card';
import { EmptyState } from '@/ui/components/EmptyState';
import { themeRecipes } from '@/ui/theme/recipes';

export function InfoList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <Card>
      <div className={themeRecipes.sectionTitle()}>{title}</div>
      {items.length > 0 ? (
        <div className="mt-[var(--theme-panel-header-gap)] flex flex-wrap gap-[var(--theme-toolbar-gap)]">
          {items.map((item, index) => (
            <Badge key={`${item}:${index}`} tone="muted">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <EmptyState title={empty} className="mt-[var(--theme-panel-header-gap)] px-0 py-[var(--theme-card-padding-y)]" />
      )}
    </Card>
  );
}

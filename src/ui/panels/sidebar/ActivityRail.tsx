import { Code2, FolderOpen, Globe, MessageSquare, Puzzle, ScrollText, Settings2, Workflow } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import { Button } from '@/ui/components/Button';
import type { ActivityBarContribution } from '@/core/plugin/sdk';

interface ActivityRailProps {
  activeViewId: string;
  workspaceActivityItems: ActivityBarContribution[];
  globalActivityItems: ActivityBarContribution[];
  onOpenActivity: (item: ActivityBarContribution) => void;
}

export const ActivityRail = ({
  activeViewId,
  workspaceActivityItems,
  globalActivityItems,
  onOpenActivity,
}: ActivityRailProps) => {
  return (
    <div className={`flex w-[var(--theme-rail-width)] flex-col items-center py-[var(--theme-sidebar-padding-y)] ${themeRecipes.activityRail()}`}>
      <ActivityGroup
        items={workspaceActivityItems}
        activeViewId={activeViewId}
        onOpenActivity={onOpenActivity}
      />

      <div className="mt-auto">
        <ActivityGroup
          items={globalActivityItems}
          activeViewId={activeViewId}
          onOpenActivity={onOpenActivity}
        />
      </div>
    </div>
  );
};

function ActivityGroup({
  items,
  activeViewId,
  onOpenActivity,
}: {
  items: ActivityBarContribution[];
  activeViewId: string;
  onOpenActivity: (item: ActivityBarContribution) => void;
}) {
  return (
    <div className="flex flex-col gap-[var(--theme-toolbar-gap)]">
      {items.map((item) => (
        <Button
          variant="unstyled"
          size="none"
          key={`${item.pluginId || 'plugin'}:${item.id}`}
          onClick={() => onOpenActivity(item)}
          title={activityTooltip(item)}
          className={cn(themeRecipes.activityItem(activeViewId === item.opens))}
        >
          {iconForPluginActivity(item.icon, item.title)}
        </Button>
      ))}
    </div>
  );
}

function iconForPluginActivity(icon: string | undefined, title: string) {
  const normalized = (icon || title).toLowerCase();
  const iconClassName = 'h-[var(--theme-activity-icon-size)] w-[var(--theme-activity-icon-size)]';
  if (normalized.includes('message') || normalized.includes('session') || normalized.includes('会话')) return <MessageSquare className={iconClassName} />;
  if (normalized.includes('folder') || normalized.includes('file')) return <FolderOpen className={iconClassName} />;
  if (normalized.includes('workflow') || normalized.includes('flow')) return <Workflow className={iconClassName} />;
  if (normalized.includes('scroll') || normalized.includes('spec')) return <ScrollText className={iconClassName} />;
  if (normalized.includes('web') || normalized.includes('browser')) return <Globe className={iconClassName} />;
  if (normalized.includes('code') || normalized.includes('dev')) return <Code2 className={iconClassName} />;
  if (normalized.includes('settings')) return <Settings2 className={iconClassName} />;
  return <Puzzle className={iconClassName} />;
}

function activityTooltip(item: ActivityBarContribution) {
  const normalized = `${item.id} ${item.opens} ${item.title} ${item.icon || ''}`.toLowerCase();

  if (normalized.includes('session') || normalized.includes('message') || normalized.includes('会话')) {
    return 'SESSION\nOpen and manage your conversations';
  }

  if (normalized.includes('folder') || normalized.includes('file')) {
    return 'EXPLORER\nBrowse files and folders in the workspace';
  }

  if (normalized.includes('workflow') || normalized.includes('flow')) {
    return 'WORKFLOW\nBuild and run workflow graphs';
  }

  if (normalized.includes('spec') || normalized.includes('scroll')) {
    return 'SPEC\nCreate, edit, and run document-driven changes';
  }

  return `${item.title.toUpperCase()}\n${item.pluginId || 'plugin'}`;
}

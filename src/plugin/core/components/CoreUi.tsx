import type React from 'react';
import { Badge, InfoList as SharedInfoList, SidebarHeader, SidebarPage, StatCard } from '@/shared/ui';

export function PanelShell({
  width,
  icon,
  title,
  subtitle,
  children,
}: {
  width: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <SidebarPage width={width}>
      <SidebarHeader icon={icon} title={title} subtitle={subtitle} />
      {children}
    </SidebarPage>
  );
}

export function EcosystemStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
}) {
  return <StatCard label={label} value={value} tone={tone} />;
}

export function InfoList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return <SharedInfoList title={title} items={items} empty={empty} />;
}

export function pluginStatusPillClass(status: 'enabled' | 'disabled' | 'blocked' | 'error') {
  switch (status) {
    case 'enabled':
      return 'success';
    case 'blocked':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'muted';
  }
}

export function statusLabel(status: 'enabled' | 'disabled' | 'blocked' | 'error') {
  switch (status) {
    case 'enabled':
      return '已启用';
    case 'blocked':
      return '依赖阻塞';
    case 'error':
      return '加载错误';
    default:
      return '已禁用';
  }
}

export function StatusPill({ status }: { status: 'enabled' | 'disabled' | 'blocked' | 'error' }) {
  return <Badge tone={pluginStatusPillClass(status)}>{statusLabel(status)}</Badge>;
}

import type { ReactNode } from 'react';
import { Toolbar } from './Toolbar';

export function FilterBar({
  search,
  filters,
}: {
  search?: ReactNode;
  filters?: ReactNode;
}) {
  return <Toolbar leading={search} trailing={filters} className="flex-wrap" />;
}

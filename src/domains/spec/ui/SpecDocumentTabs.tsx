import { Button } from '@/ui/components';
import type { SpecDocumentId } from './helpers';

export function SpecDocumentTabs({
  activeDocument,
  onChange,
}: {
  activeDocument: SpecDocumentId;
  onChange: (documentId: SpecDocumentId) => void;
}) {
  const tabs: Array<{ id: SpecDocumentId; label: string }> = [
    { id: 'change', label: 'change.md' },
    { id: 'plan', label: 'plan.md' },
    { id: 'tasks', label: 'tasks.md' },
    { id: 'timeline', label: 'timeline' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          variant={activeDocument === tab.id ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}

import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { themeRecipes } from '@/shared/theme/recipes';
import { Input } from '@/shared/ui/Input';

export function SearchField({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className={themeRecipes.searchField()}>
      <Search size={15} className="text-[var(--theme-text-muted)]" />
      <Input
        ref={inputRef}
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="h-auto w-full border-none bg-transparent px-0 py-0 placeholder:text-[var(--theme-text-muted)] focus:border-transparent"
        readOnly={!onChange}
      />
    </label>
  );
}

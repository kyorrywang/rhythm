import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Children, forwardRef, isValidElement, useMemo, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';

type SelectChangeEvent = {
  target: { value: string };
  currentTarget: { value: string };
};

type SelectOptionNode = ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>;
type SelectGroupNode = ReactElement<{ label?: string; children?: ReactNode }>;

type SelectEntry =
  | {
      kind: 'item';
      key: string;
      value: string;
      disabled?: boolean;
      label: ReactNode;
    }
  | {
      kind: 'group';
      key: string;
      label: ReactNode;
      items: Array<Extract<SelectEntry, { kind: 'item' }>>;
    };

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onChange?: (event: SelectChangeEvent) => void;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  required?: boolean;
}

function parseOptions(nodes: ReactNode): SelectEntry[] {
  const entries: SelectEntry[] = [];

  Children.toArray(nodes).forEach((child, index) => {
    if (!isValidElement(child)) return [];

    if (child.type === 'option') {
      const option = child as SelectOptionNode;
      if (option.props.value !== undefined) {
        entries.push({
            kind: 'item' as const,
            key: option.key?.toString() ?? `option-${index}-${option.props.value}`,
            value: String(option.props.value),
            disabled: option.props.disabled,
            label: option.props.children,
        });
      }
      return;
    }

    if (child.type === 'optgroup') {
      const group = child as SelectGroupNode;
      const items = Children.toArray(group.props.children).flatMap((nestedChild, nestedIndex) => {
        if (!isValidElement(nestedChild) || nestedChild.type !== 'option') return [];
        const option = nestedChild as SelectOptionNode;
        return option.props.value === undefined
          ? []
          : [{
              kind: 'item' as const,
              key: option.key?.toString() ?? `group-${index}-option-${nestedIndex}-${option.props.value}`,
              value: String(option.props.value),
              disabled: option.props.disabled,
              label: option.props.children,
            }];
      });

      if (items.length > 0) {
        entries.push({
          kind: 'group' as const,
          key: group.key?.toString() ?? `group-${index}`,
          label: group.props.label ?? '',
          items,
        });
      }
      return;
    }
  });

  return entries;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  ({ value, defaultValue, onChange, onValueChange, children, className, placeholder, disabled, name, required }, ref) => {
    const entries = useMemo(() => parseOptions(children), [children]);

    return (
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        required={required}
        onValueChange={(nextValue) => {
          onValueChange?.(nextValue);
          onChange?.({
            target: { value: nextValue },
            currentTarget: { value: nextValue },
          });
        }}
      >
        <RadixSelect.Trigger
          ref={ref}
          className={cn(
            themeRecipes.field(),
            'flex h-[var(--theme-control-height-md)] w-full items-center justify-between gap-[var(--theme-toolbar-gap)] px-[var(--theme-control-padding-x-md)] text-left data-[placeholder]:text-[var(--theme-text-muted)]',
            className,
          )}
          aria-label={typeof placeholder === 'string' ? placeholder : undefined}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="shrink-0 text-[var(--theme-text-muted)]">
            <ChevronDown size={16} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={8}
            className={cn(themeRecipes.floatingSurface(), 'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1')}
          >
            <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center text-[var(--theme-text-muted)]">
              <ChevronUp size={14} />
            </RadixSelect.ScrollUpButton>
            <RadixSelect.Viewport className="p-1">
              {entries.map((entry) =>
                entry.kind === 'group' ? (
                  <RadixSelect.Group key={entry.key}>
                    <RadixSelect.Label className={cn(themeRecipes.floatingGroupLabel(), 'px-[var(--theme-control-padding-x-sm)] py-1.5')}>
                      {entry.label}
                    </RadixSelect.Label>
                    {entry.items.map((item) => (
                      <SelectItem key={item.key} value={item.value} disabled={item.disabled}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </RadixSelect.Group>
                ) : (
                  <SelectItem key={entry.key} value={entry.value} disabled={entry.disabled}>
                    {entry.label}
                  </SelectItem>
                ),
              )}
            </RadixSelect.Viewport>
            <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center text-[var(--theme-text-muted)]">
              <ChevronDown size={14} />
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    );
  },
);

Select.displayName = 'Select';

function SelectItem({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <RadixSelect.Item
      value={value}
      disabled={disabled}
      className={cn(
        themeRecipes.selectionRow(false),
        'relative mb-1 flex min-h-[var(--theme-control-height-sm)] cursor-pointer select-none items-center rounded-[var(--theme-selection-radius)] pr-9 outline-none last:mb-0 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:border-[var(--theme-selection-selected-border)] data-[highlighted]:bg-[var(--theme-selection-selected-bg)] data-[highlighted]:text-[var(--theme-selection-selected-text)]',
      )}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <span className="absolute right-3 inline-flex items-center justify-center text-[var(--theme-selection-selected-indicator)]">
        <RadixSelect.ItemIndicator>
          <Check size={14} />
        </RadixSelect.ItemIndicator>
      </span>
    </RadixSelect.Item>
  );
}

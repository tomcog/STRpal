import { SegmentedControl, Segment } from '@tomcoggia/ui';

// Stock-level marker for an inventory item.
// Four states: Check | Stocked | Low | Restock (stored in DB as "Empty").
// DB values are 'Check' | 'Stocked' | 'Low' | 'Empty'; the Restock label is
// presentation-only.
export const OPTIONS = [
  { value: 'Check',   label: 'Check' },
  { value: 'Stocked', label: 'Stocked' },
  { value: 'Low',     label: 'Low' },
  { value: 'Empty',   label: 'Restock' },
];

export function labelFor(value) {
  const o = OPTIONS.find(x => x.value === value);
  return o ? o.label : value;
}

export function options() {
  return OPTIONS.slice();
}

/**
 * <StockStatus value="Low" onChange={(status) => …} size="md" />
 * Clicks don't bubble, so it can sit inside a clickable card.
 */
export function StockStatus({ value, onChange, size = 'md', className, 'aria-label': ariaLabel = 'Stock status' }) {
  const status = value || 'Stocked';
  // onChange fires even for the current value: re-marking Stocked refreshes last_stocked_at
  return (
    // Wrapper swallows clicks/keys so a parent clickable card doesn't open
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <SegmentedControl aria-label={ariaLabel} size={size}>
      {OPTIONS.map(o => (
        <Segment
          key={o.value}
          selected={status === o.value}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </Segment>
      ))}
    </SegmentedControl>
    </div>
  );
}

export default StockStatus;

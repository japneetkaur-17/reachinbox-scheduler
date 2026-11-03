import { useState } from 'react';
import { Check, Filter, RotateCw, Search } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Popover } from '../ui/Popover';
import type { EmailStatus } from '../../types/api';

export interface FilterOption {
  value: EmailStatus | 'all';
  label: string;
}

interface ListToolbarProps {
  query: string;
  onQuery: (q: string) => void;
  filter: FilterOption['value'];
  filterOptions: FilterOption[];
  onFilter: (v: FilterOption['value']) => void;
  onRefresh: () => Promise<void>;
}

/** Search bar + filter + refresh row at the top of the email list. */
export function ListToolbar({ query, onQuery, filter, filterOptions, onFilter, onRefresh }: ListToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <label className="relative flex-1 lg:max-w-[560px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search emails"
          className="h-8 w-full rounded-lg bg-field pl-8 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-brand-500/20"
        />
      </label>

      <div className="relative">
        <IconButton label="Filter by status" active={filter !== 'all'} onClick={() => setFilterOpen((o) => !o)}>
          <Filter className="h-4 w-4" />
        </IconButton>
        <Popover open={filterOpen} onClose={() => setFilterOpen(false)} className="left-0 top-full mt-1 w-40 p-1">
          {filterOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onFilter(o.value);
                setFilterOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm text-ink hover:bg-field"
            >
              {o.label}
              {filter === o.value && <Check className="h-3.5 w-3.5 text-brand-500" />}
            </button>
          ))}
        </Popover>
      </div>

      <IconButton
        label="Refresh"
        onClick={async () => {
          setRefreshing(true);
          try {
            await onRefresh();
          } finally {
            setRefreshing(false);
          }
        }}
      >
        <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      </IconButton>
    </div>
  );
}

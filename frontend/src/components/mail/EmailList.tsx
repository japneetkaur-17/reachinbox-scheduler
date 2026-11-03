import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmailRow } from './EmailRow';
import { EmptyState } from '../ui/EmptyState';
import { useStarred } from '../../hooks/useStarred';
import type { EmailItem } from '../../types/api';

interface EmailListProps {
  items: EmailItem[];
  loading: boolean;
  empty: { title: string; description: string; action?: ReactNode };
}

function SkeletonRows() {
  return (
    <ul aria-label="Loading emails" className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-line px-5 py-4">
          <span className="h-3 w-36 rounded bg-field" />
          <span className="h-4 w-24 rounded-full bg-field" />
          <span className="h-3 flex-1 rounded bg-field" />
        </li>
      ))}
    </ul>
  );
}

export function EmailList({ items, loading, empty }: EmailListProps) {
  const navigate = useNavigate();
  const { isStarred, toggle } = useStarred();

  if (loading && items.length === 0) return <SkeletonRows />;
  if (items.length === 0) return <EmptyState {...empty} />;

  return (
    <ul className="mx-4 border-t border-line">
      {items.map((e) => (
        <EmailRow
          key={e.id}
          email={e}
          starred={isStarred(e.id)}
          onToggleStar={() => toggle(e.id)}
          onOpen={() => navigate(`/email/${e.id}`)}
        />
      ))}
    </ul>
  );
}

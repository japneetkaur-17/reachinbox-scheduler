import { Star } from 'lucide-react';

export function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={starred ? 'Unstar' : 'Star'}
      aria-pressed={starred}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex h-7 w-7 flex-none items-center justify-center rounded-md hover:bg-field"
    >
      <Star className={`h-4 w-4 ${starred ? 'fill-amber-400 text-amber-400' : 'text-[#C9C9C9]'}`} strokeWidth={1.6} />
    </button>
  );
}

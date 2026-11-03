import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { Popover } from '../ui/Popover';

/** User card at the top of the sidebar (avatar, name, email) with a Logout menu. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl bg-[#F7F7F7] px-3 py-2.5 text-left transition-colors hover:bg-field"
      >
        <Avatar src={user.avatarUrl} name={user.name} size={30} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block truncate text-[11px] text-ink-muted">{user.email}</span>
        </span>
        <ChevronDown className={`h-4 w-4 flex-none text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} className="left-0 right-0 top-full mt-1 p-1">
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-field"
        >
          <LogOut className="h-4 w-4 text-ink-muted" />
          Logout
        </button>
      </Popover>
    </div>
  );
}

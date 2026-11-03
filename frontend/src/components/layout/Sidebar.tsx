import { NavLink, useNavigate } from 'react-router-dom';
import { Activity, Clock, Send, type LucideIcon } from 'lucide-react';
import { useStats } from '../../context/StatsContext';
import { links } from '../../lib/api';
import { Button } from '../ui/Button';
import { SlackConnect } from '../SlackConnect';
import { UserMenu } from './UserMenu';

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-1 mt-6 px-3 text-[10px] font-medium uppercase tracking-wider text-ink-faint">{children}</p>;
}

function NavItem({ to, icon: Icon, label, count }: { to: string; icon: LucideIcon; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
          isActive ? 'bg-brand-50 font-semibold text-ink' : 'text-ink hover:bg-field'
        }`
      }
    >
      <Icon className="h-4 w-4 text-ink-muted" strokeWidth={2} />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs font-normal text-ink-muted">{count.toLocaleString()}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const { stats } = useStats();
  const navigate = useNavigate();

  return (
    <aside className="flex w-[260px] flex-none flex-col border-r border-line bg-white px-3 py-5">
      <div className="px-2 pb-4 font-logo text-[34px] font-bold leading-none tracking-tight text-ink">ONB</div>

      <UserMenu />

      <Button variant="outline" size="sm" block className="mt-4" onClick={() => navigate('/compose')}>
        Compose
      </Button>

      <SectionLabel>Core</SectionLabel>
      <nav className="space-y-0.5">
        <NavItem to="/scheduled" icon={Clock} label="Scheduled" count={stats?.scheduled} />
        <NavItem to="/sent" icon={Send} label="Sent" count={stats?.sent} />
      </nav>

      <div className="mt-auto">
        <SectionLabel>Integrations</SectionLabel>
        <SlackConnect />
        <a
          href={links.bullBoard}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-field"
        >
          <Activity className="h-4 w-4 text-ink-muted" />
          Queue dashboard
        </a>
      </div>
    </aside>
  );
}

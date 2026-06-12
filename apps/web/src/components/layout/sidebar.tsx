'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Users, Settings, Inbox, UserCog } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Role } from '@/types';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const ALL: Role[] = ['CRIADOR', 'ADMIN', 'ADMIN_SERVICO', 'ADMIN_ICMS', 'BALANCO'];

const items: NavItem[] = [
  { label: 'Calendário', href: '/calendario', icon: CalendarDays, roles: ALL },
  { label: 'Recebidas (SEFAZ)', href: '/recebidas', icon: Inbox, roles: ALL },
  { label: 'Membros', href: '/membros', icon: Users, roles: ['CRIADOR'] },
  { label: 'Minha Conta', href: '/conta', icon: UserCog, roles: ALL },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, roles: ['CRIADOR'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-slate-900 text-slate-100 h-screen sticky top-0">
      <div className="p-6 border-b border-slate-800 text-center">
        <h1 className="text-2xl font-bold tracking-tight">KALENA</h1>
        <p className="text-xs text-emerald-400 tracking-[0.25em] mt-1">NOTAS FISCAIS</p>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items
          .filter((i) => i.roles.includes(user.role))
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        Kalena Foods © {new Date().getFullYear()}
      </div>
    </aside>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Settings,
  Inbox,
  UserCog,
  FileBox,
  Landmark,
  Wallet,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Role } from '@/types';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

interface NavGroup {
  title?: string;
  roles?: Role[]; // se definido, o grupo inteiro só aparece para esses perfis
  items: NavItem[];
}

const ALL: Role[] = ['CRIADOR', 'ADMIN', 'ADMIN_SERVICO', 'ADMIN_ICMS', 'BALANCO'];
const SO_CRIADOR: Role[] = ['CRIADOR'];
// Notas físicas: todos menos Serviço
const NOTA_FISICA: Role[] = ['CRIADOR', 'ADMIN', 'ADMIN_ICMS', 'BALANCO'];

const groups: NavGroup[] = [
  { items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ALL }] },
  {
    title: 'Notas fiscais',
    items: [
      { label: 'Recebidas (SEFAZ)', href: '/recebidas', icon: Inbox, roles: ALL },
      { label: 'Calendário', href: '/calendario', icon: CalendarDays, roles: ALL },
      { label: 'Notas físicas', href: '/notas-fisicas', icon: FileBox, roles: NOTA_FISICA },
    ],
  },
  {
    title: 'Integrações',
    roles: SO_CRIADOR,
    items: [
      { label: 'SEFAZ', href: '/integracoes', icon: Landmark, roles: SO_CRIADOR },
      { label: 'Omie (Contas a Pagar)', href: '/integracoes', icon: Wallet, roles: SO_CRIADOR },
      { label: 'Google Drive', href: '/integracoes', icon: HardDrive, roles: SO_CRIADOR },
    ],
  },
  {
    title: 'Equipe',
    roles: SO_CRIADOR,
    items: [{ label: 'Membros', href: '/membros', icon: Users, roles: SO_CRIADOR }],
  },
  {
    title: 'Configurações',
    roles: SO_CRIADOR,
    items: [{ label: 'Configurações', href: '/configuracoes', icon: Settings, roles: SO_CRIADOR }],
  },
  {
    title: 'Conta',
    items: [{ label: 'Minha Conta', href: '/conta', icon: UserCog, roles: ALL }],
  },
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
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {groups
          .filter((g) => !g.roles || g.roles.includes(user.role))
          .map((group, gi) => {
            const items = group.items.filter((i) => i.roles.includes(user.role));
            if (items.length === 0) return null;
            return (
              <div key={group.title ?? `g${gi}`} className="space-y-1">
                {group.title && (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {group.title}
                  </p>
                )}
                {items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label + item.href}
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
              </div>
            );
          })}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        Kalena Foods © {new Date().getFullYear()}
      </div>
    </aside>
  );
}

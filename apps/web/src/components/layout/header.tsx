'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, Search, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { ROLE_LABELS } from '@/types';

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');

  if (!user) return null;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/recebidas?q=${encodeURIComponent(term)}` : '/recebidas');
  };

  return (
    <header className="h-16 border-b bg-card flex items-center gap-4 px-6 sticky top-0 z-30">
      <div className="md:hidden text-lg font-bold tracking-wide">KALENA</div>

      <form onSubmit={submitSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nota por emitente, CNPJ ou número..."
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </form>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggle} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <div className="hidden sm:flex flex-col items-center">
          <div className="text-sm font-medium">{user.name}</div>
          <Badge variant={user.role === 'CRIADOR' ? 'info' : 'secondary'} className="mt-0.5">
            {ROLE_LABELS[user.role] ?? user.role}
          </Badge>
        </div>
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
          <UserIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="Sair">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}

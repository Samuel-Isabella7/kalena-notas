'use client';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { ROLE_LABELS } from '@/types';

export function Header() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="md:hidden text-lg font-bold tracking-wide">KALENA</div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center">
          <div className="text-sm font-medium">{user.name}</div>
          <Badge variant={user.role === 'CRIADOR' ? 'info' : 'secondary'} className="mt-0.5">
            {ROLE_LABELS[user.role] ?? user.role}
          </Badge>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center">
          <UserIcon className="w-4 h-4 text-slate-600" />
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="Sair">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}

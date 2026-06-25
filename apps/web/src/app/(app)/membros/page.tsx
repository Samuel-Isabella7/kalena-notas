'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus, Trash2, ShieldCheck, User as UserIcon, Mail, Copy, Send } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { Member, Role, ROLE_LABELS } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PendingMember = Member & { pending?: boolean };

export default function MembrosPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<Role>('ADMIN');
  const [shareLink, setShareLink] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery<PendingMember[]>({
    queryKey: ['members'],
    queryFn: async () => (await api.get('/users')).data,
    enabled: can('CRIADOR'),
  });

  if (!can('CRIADOR')) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border bg-card p-10 text-center text-muted-foreground">
        Apenas o criador pode gerenciar membros.
      </div>
    );
  }

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  const handleInviteResult = (data: { sent: boolean; inviteLink?: string }) => {
    if (data.inviteLink) {
      // SMTP não configurado: mostramos o link para você enviar manualmente
      setShareLink(data.inviteLink);
    } else if (data.sent) {
      toast({ title: 'Convite enviado por e-mail', variant: 'success' });
    }
  };

  const create = async () => {
    setSaving(true);
    try {
      const { data } = await api.post('/users', { email: formEmail, role: formRole });
      toast({ title: 'Convite criado', variant: 'success' });
      setOpen(false);
      setFormEmail('');
      setFormRole('ADMIN');
      refetch();
      handleInviteResult(data);
    } catch (e) {
      toast({ title: 'Erro ao convidar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resend = async (m: PendingMember) => {
    try {
      const { data } = await api.post(`/users/${m.id}/resend-invite`);
      toast({ title: 'Convite reenviado', variant: 'success' });
      handleInviteResult(data);
    } catch (e) {
      toast({ title: 'Erro ao reenviar', description: apiError(e), variant: 'destructive' });
    }
  };

  const toggleActive = async (m: PendingMember) => {
    try {
      await api.patch(`/users/${m.id}`, { active: !m.active });
      refetch();
    } catch (e) {
      toast({ title: 'Erro', description: apiError(e), variant: 'destructive' });
    }
  };

  const remove = async (m: PendingMember) => {
    if (!confirm(`Excluir o membro ${m.name}?`)) return;
    try {
      await api.delete(`/users/${m.id}`);
      toast({ title: 'Membro excluído', variant: 'success' });
      refetch();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: apiError(e), variant: 'destructive' });
    }
  };

  const copyLink = () => {
    if (shareLink) {
      navigator.clipboard?.writeText(shareLink).catch(() => {});
      toast({ title: 'Link copiado', variant: 'success' });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Membros</h1>
          <p className="text-sm text-muted-foreground">
            Convide pelo e-mail; a pessoa recebe um link para criar o próprio cadastro (nome e senha).
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="w-4 h-4" /> Convidar membro
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {members?.map((m) => (
            <div key={m.id} className="rounded-lg border bg-card p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                {m.role === 'CRIADOR' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                ) : (
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{m.pending ? m.email : m.name}</span>
                  <Badge variant={m.role === 'CRIADOR' ? 'info' : 'secondary'}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Badge>
                  {m.pending && <Badge variant="warning">Convite pendente</Badge>}
                  {!m.active && !m.pending && <Badge variant="danger">Inativo</Badge>}
                </div>
                {!m.pending && <div className="text-sm text-muted-foreground">{m.email}</div>}
                <div className="text-xs text-muted-foreground">
                  {m.pending
                    ? 'Aguardando a pessoa criar o cadastro'
                    : `Último acesso: ${m.lastLoginAt ? formatDateTime(m.lastLoginAt) : 'nunca'}`}
                </div>
              </div>
              {m.role !== 'CRIADOR' && m.id !== user?.id && (
                <div className="flex items-center gap-2">
                  {m.pending ? (
                    <Button variant="outline" size="sm" onClick={() => resend(m)}>
                      <Send className="w-4 h-4" /> Reenviar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => toggleActive(m)}>
                      {m.active ? 'Desativar' : 'Ativar'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => remove(m)} title="Excluir">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Matriz de papéis (o que cada perfil pode fazer) */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">O que cada perfil pode fazer</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Recurso</th>
              {(['CRIADOR', 'ADMIN', 'ADMIN_ICMS', 'ADMIN_SERVICO', 'BALANCO'] as Role[]).map((r) => (
                <th key={r} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                  {ROLE_LABELS[r] ?? r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                { cap: 'Dashboard / Recebidas / Calendário', roles: ['CRIADOR', 'ADMIN', 'ADMIN_ICMS', 'ADMIN_SERVICO', 'BALANCO'] },
                { cap: 'Manifestar notas (SEFAZ)', roles: ['CRIADOR', 'ADMIN'] },
                { cap: 'Anexar e lançar notas (Omie)', roles: ['CRIADOR', 'ADMIN'] },
                { cap: 'Contas a Pagar', roles: ['CRIADOR', 'ADMIN'] },
                { cap: 'Ver notas físicas', roles: ['CRIADOR', 'ADMIN', 'ADMIN_ICMS', 'BALANCO'] },
                { cap: 'Anexar notas físicas', roles: ['CRIADOR', 'ADMIN'] },
                { cap: 'Integrações', roles: ['CRIADOR'] },
                { cap: 'Configurações', roles: ['CRIADOR'] },
                { cap: 'Gerenciar membros', roles: ['CRIADOR'] },
              ] as { cap: string; roles: Role[] }[]
            ).map((row) => (
              <tr key={row.cap} className="border-t">
                <td className="px-4 py-2">{row.cap}</td>
                {(['CRIADOR', 'ADMIN', 'ADMIN_ICMS', 'ADMIN_SERVICO', 'BALANCO'] as Role[]).map((r) => (
                  <td key={r} className="px-3 py-2 text-center">
                    {row.roles.includes(r) ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : (
                      <span className="text-muted-foreground/40">–</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog de convite */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar membro</DialogTitle>
            <DialogDescription>Informe o e-mail e o perfil. A pessoa define o nome e a senha pelo link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Perfil de acesso</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as Role)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">{ROLE_LABELS.ADMIN}</SelectItem>
                  <SelectItem value="ADMIN_SERVICO">{ROLE_LABELS.ADMIN_SERVICO}</SelectItem>
                  <SelectItem value="ADMIN_ICMS">{ROLE_LABELS.ADMIN_ICMS}</SelectItem>
                  <SelectItem value="BALANCO">{ROLE_LABELS.BALANCO}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input className="mt-1.5" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="pessoa@empresa.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={saving || !formEmail.includes('@')}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog com o link do convite (quando o envio de e-mail ainda não está configurado) */}
      <Dialog open={!!shareLink} onOpenChange={(o) => !o && setShareLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link do convite</DialogTitle>
            <DialogDescription>
              O envio automático de e-mail ainda não está configurado. Copie o link abaixo e envie para a pessoa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={shareLink ?? ''} className="text-xs" />
            <Button variant="outline" size="icon" onClick={copyLink} title="Copiar">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShareLink(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

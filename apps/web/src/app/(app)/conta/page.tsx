'use client';
import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { ROLE_LABELS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ContaPage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const emailMudou = email.toLowerCase() !== (user.email ?? '').toLowerCase();
  const querTrocarSenha = newPassword.length > 0;

  const salvar = async () => {
    if (querTrocarSenha && newPassword !== confirm) {
      toast({ title: 'As senhas novas não conferem', variant: 'destructive' });
      return;
    }
    if ((emailMudou || querTrocarSenha) && !currentPassword) {
      toast({ title: 'Informe sua senha atual', description: 'Necessária para alterar e-mail ou senha.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const body: any = {};
      if (name !== user.name) body.name = name;
      if (emailMudou) body.email = email;
      if (querTrocarSenha) body.newPassword = newPassword;
      if (emailMudou || querTrocarSenha) body.currentPassword = currentPassword;

      const { data } = await api.patch('/auth/me', body);
      updateUser({ name: data.name, email: data.email });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      toast({ title: 'Conta atualizada', variant: 'success' });
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha Conta</h1>
        <p className="text-sm text-muted-foreground">Altere seu nome, e-mail e senha.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Dados
            <Badge variant={user.role === 'CRIADOR' ? 'info' : 'secondary'}>
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input className="mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {emailMudou && (
              <p className="text-xs text-amber-600 mt-1">Você usará este novo e-mail para entrar.</p>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Trocar senha (opcional)</p>
            <div className="space-y-3">
              <div>
                <Label>Nova senha</Label>
                <Input
                  className="mt-1.5"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              {querTrocarSenha && (
                <div>
                  <Label>Confirmar nova senha</Label>
                  <Input
                    className="mt-1.5"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {(emailMudou || querTrocarSenha) && (
            <div className="border-t pt-4">
              <Label>Senha atual (para confirmar)</Label>
              <Input
                className="mt-1.5"
                type="password"
                placeholder="sua senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

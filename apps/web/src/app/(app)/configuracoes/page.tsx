'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, HardDrive, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatusResponse {
  omie: { accounts: string[] };
  drive: { driveEnabled: boolean; rootFolderConfigured: boolean };
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {ok ? (
        <CheckCircle2 className="w-5 h-5 text-green-600" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500" />
      )}
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const { can } = useAuth();

  const { data: status } = useQuery<StatusResponse>({
    queryKey: ['settings-status'],
    queryFn: async () => (await api.get('/settings/status')).data,
    enabled: can('CRIADOR'),
  });

  if (!can('CRIADOR')) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border bg-white p-10 text-center text-muted-foreground">
        Apenas o criador pode acessar as configurações.
      </div>
    );
  }

  const accounts = status?.omie.accounts ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Status das integrações.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4" /> Integração Omie (Contas a Pagar)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StatusRow
            ok={accounts.includes('SP')}
            label="Conta São Paulo (SP)"
            detail={accounts.includes('SP') ? 'Credenciais configuradas' : 'Credenciais ausentes no servidor'}
          />
          <StatusRow
            ok={accounts.includes('RJ')}
            label="Conta Rio de Janeiro (RJ)"
            detail={accounts.includes('RJ') ? 'Credenciais configuradas' : 'Credenciais ausentes no servidor'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="w-4 h-4" /> Armazenamento (Google Drive)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StatusRow
            ok={!!status?.drive.driveEnabled}
            label="Google Drive"
            detail={
              status?.drive.driveEnabled
                ? 'Conectado via conta de serviço — notas salvas no Drive'
                : 'Não configurado — notas salvas localmente no servidor (modo local)'
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

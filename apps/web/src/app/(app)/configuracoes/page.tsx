'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, HardDrive, Building2, CalendarOff } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StatusResponse {
  omie: { accounts: string[] };
  drive: { driveEnabled: boolean; rootFolderConfigured: boolean };
}

interface Holiday {
  date: string;
  name: string;
  scope: string;
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
  const { data: status } = useQuery<StatusResponse>({
    queryKey: ['settings-status'],
    queryFn: async () => (await api.get('/settings/status')).data,
  });

  const { data: holidays } = useQuery<Holiday[]>({
    queryKey: ['settings-holidays', 2026],
    queryFn: async () => (await api.get('/settings/holidays', { params: { year: 2026 } })).data,
  });

  const accounts = status?.omie.accounts ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Status das integrações e calendário de feriados.</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarOff className="w-4 h-4" /> Feriados bloqueados em 2026
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {holidays?.map((h) => (
              <div key={h.date} className="flex items-center justify-between py-1 text-sm border-b border-dashed last:border-0">
                <span>{h.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatDate(h.date)}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {h.scope === 'NACIONAL' ? 'Nacional' : h.scope === 'ESTADUAL_SP' ? 'SP estado' : 'SP cidade'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Fins de semana também ficam bloqueados para anexo de notas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

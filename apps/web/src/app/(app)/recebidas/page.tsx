'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2, FileText, ExternalLink, Inbox } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { ReceivedNfe } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatDate, formatDocument } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function RecebidasPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const canSync = can('CRIADOR', 'ADMIN', 'ADMIN_ICMS');

  const { data: notas, isLoading } = useQuery<ReceivedNfe[]>({
    queryKey: ['received-nfe'],
    queryFn: async () => (await api.get('/sefaz/received')).data,
  });

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/sefaz/sync');
      const partes = (data?.empresas ?? []).map((e: any) =>
        e.erro ? `${e.empresa}: erro` : `${e.empresa}: ${e.novos} nova(s)`,
      );
      toast({
        title: 'Sincronização concluída',
        description: partes.join(' · ') || 'Sem novidades',
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['received-nfe'] });
    } catch (e) {
      toast({ title: 'Erro ao sincronizar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notas Recebidas (SEFAZ)</h1>
          <p className="text-sm text-muted-foreground">
            NF-e (ICMS) emitidas contra a empresa, baixadas da SEFAZ — organizadas pela emissão.
          </p>
        </div>
        {canSync && (
          <Button onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !notas || notas.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma nota recebida ainda. Clique em <strong>Sincronizar</strong> para buscar na SEFAZ.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Emissão</th>
                <th className="px-4 py-2 font-medium">Emitente</th>
                <th className="px-4 py-2 font-medium">NF</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">XML</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="border-t hover:bg-slate-50/60">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(n.dataEmissao)}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{n.emitenteNome || '-'}</div>
                    <div className="text-xs text-muted-foreground">{formatDocument(n.emitenteCnpj)}</div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{n.numero || '-'}</td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {n.valor != null ? formatCurrency(n.valor) : '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Badge variant="outline">{n.empresaUf || n.empresaNome}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    {n.hasXml && n.driveLink ? (
                      <a
                        href={n.driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> XML
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" /> resumo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Observação: a SEFAZ entrega NF-e (mercadoria/ICMS). Notas de serviço (NFS-e) são municipais e não vêm por aqui.
        Quando a NF-e completa está disponível, o XML é salvo no Drive (pasta "NF-e Recebidas (SEFAZ)").
      </p>
    </div>
  );
}

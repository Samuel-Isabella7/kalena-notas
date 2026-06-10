'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2, FileText, Inbox, FileCode } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { ReceivedNfe } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatDate, formatDocument } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function RecebidasPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [filtro, setFiltro] = useState<string>('TODAS'); // UF da empresa
  const [tipoF, setTipoF] = useState<string>('TODOS'); // tipo de documento
  const canSync = can('CRIADOR', 'ADMIN', 'ADMIN_ICMS');

  const tipoLabel = (t: string) => (t === 'CTE' ? 'CT-e' : t === 'NFCE' ? 'NFC-e' : 'NF-e');

  const { data: notas, isLoading } = useQuery<ReceivedNfe[]>({
    queryKey: ['received-nfe'],
    queryFn: async () => (await api.get('/sefaz/received')).data,
  });

  const ufs = useMemo(() => {
    const set = new Set<string>();
    (notas ?? []).forEach((n) => n.empresaUf && set.add(n.empresaUf));
    return Array.from(set).sort();
  }, [notas]);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    (notas ?? []).forEach((n) => n.tipoDoc && set.add(n.tipoDoc));
    return Array.from(set).sort();
  }, [notas]);

  const visiveis = useMemo(() => {
    if (!notas) return [];
    return notas.filter(
      (n) => (filtro === 'TODAS' || n.empresaUf === filtro) && (tipoF === 'TODOS' || n.tipoDoc === tipoF),
    );
  }, [notas, filtro, tipoF]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/sefaz/sync');
      const partes = (data?.empresas ?? []).map((e: any) =>
        e.erro ? `${e.empresa}: erro` : `${e.empresa}: ${e.novos} nova(s)`,
      );
      toast({ title: 'Sincronização concluída', description: partes.join(' · ') || 'Sem novidades', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['received-nfe'] });
    } catch (e) {
      toast({ title: 'Erro ao sincronizar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const downloadXml = async (n: ReceivedNfe) => {
    try {
      const res = await api.get(`/sefaz/received/${n.id}/xml`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${n.chave}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Erro ao baixar XML', description: apiError(e), variant: 'destructive' });
    }
  };

  const filtros = ['TODAS', ...ufs];

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

      {/* Filtro por empresa */}
      {ufs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {filtros.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                filtro === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:border-slate-400',
              )}
            >
              {f === 'TODAS' ? 'Todas' : f}
              <span className="ml-1 text-xs opacity-70">
                ({f === 'TODAS' ? (notas?.length ?? 0) : (notas ?? []).filter((n) => n.empresaUf === f).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filtro por tipo de documento */}
      {tipos.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {['TODOS', ...tipos].map((t) => (
            <button
              key={t}
              onClick={() => setTipoF(t)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                tipoF === t ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white hover:border-slate-400',
              )}
            >
              {t === 'TODOS' ? 'Todos os tipos' : tipoLabel(t)}
              <span className="ml-1 opacity-70">
                ({t === 'TODOS' ? (notas?.length ?? 0) : (notas ?? []).filter((n) => n.tipoDoc === t).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma nota neste filtro. Clique em <strong>Sincronizar</strong> para buscar na SEFAZ.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Emissão</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Emitente</th>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Documentos</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((n) => (
                <tr key={n.id} className="border-t hover:bg-slate-50/60">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(n.dataEmissao)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Badge variant={n.tipoDoc === 'CTE' ? 'warning' : 'info'}>{tipoLabel(n.tipoDoc)}</Badge>
                  </td>
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
                  <td className="px-4 py-2 whitespace-nowrap">
                    {n.hasXml ? (
                      <button
                        onClick={() => downloadXml(n)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        title="Baixar XML"
                      >
                        <FileCode className="w-3.5 h-3.5" /> XML
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Veio só como resumo (sem XML)">
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
        A SEFAZ entrega NF-e (mercadoria/ICMS). Notas de serviço (NFS-e) são municipais e não vêm por aqui.
        Notas "resumo" ainda não têm XML/DANFE — é preciso a manifestação do destinatário para baixar o XML completo.
      </p>
    </div>
  );
}

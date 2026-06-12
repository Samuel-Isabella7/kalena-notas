'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2, FileText, Inbox, FileCode, FileDown, BadgeCheck } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { ReceivedNfe } from '@/types';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatDate, formatDocument } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}/${y}`;
}

export default function RecebidasPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [manifesting, setManifesting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>('TODAS'); // UF da empresa
  const [tipoF, setTipoF] = useState<string>('TODOS'); // tipo de documento
  const [mesF, setMesF] = useState<string>('TODOS'); // emissão (YYYY-MM)
  const [emitenteF, setEmitenteF] = useState<string>('TODOS'); // emitente (fornecedor)

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

  // Meses de emissão presentes (YYYY-MM), mais recentes primeiro
  const meses = useMemo(() => {
    const set = new Set<string>();
    (notas ?? []).forEach((n) => n.dataEmissao && set.add(n.dataEmissao.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [notas]);

  // Emitentes (fornecedores) distintos, em ordem alfabética
  const emitentes = useMemo(() => {
    const set = new Set<string>();
    (notas ?? []).forEach((n) => n.emitenteNome && set.add(n.emitenteNome));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [notas]);

  const visiveis = useMemo(() => {
    if (!notas) return [];
    return notas.filter(
      (n) =>
        (filtro === 'TODAS' || n.empresaUf === filtro) &&
        (tipoF === 'TODOS' || n.tipoDoc === tipoF) &&
        (mesF === 'TODOS' || (n.dataEmissao ?? '').slice(0, 7) === mesF) &&
        (emitenteF === 'TODOS' || n.emitenteNome === emitenteF),
    );
  }, [notas, filtro, tipoF, mesF, emitenteF]);

  const resumoCount = useMemo(() => (notas ?? []).filter((n) => !n.hasXml).length, [notas]);

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

  const manifestarTodas = async () => {
    if (!confirm('Manifestar (Ciência da Operação) todas as notas sem XML e baixar o XML completo? Isso pode levar alguns minutos.')) return;
    setManifesting(true);
    try {
      const { data } = await api.post('/sefaz/manifestar-todas');
      toast({
        title: 'Manifestação concluída',
        description: `${data.manifestadas}/${data.total} manifestada(s), ${data.comXml} com XML${data.erros?.length ? ` · ${data.erros.length} erro(s)` : ''}`,
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['received-nfe'] });
    } catch (e) {
      toast({ title: 'Erro ao manifestar', description: apiError(e), variant: 'destructive' });
    } finally {
      setManifesting(false);
    }
  };

  const manifestar = async (n: ReceivedNfe) => {
    setBusyId(n.id);
    try {
      const { data } = await api.post(`/sefaz/received/${n.id}/manifestar`);
      toast({
        title: 'Manifestação registrada',
        description: data.hasXml ? 'XML completo baixado.' : `cStat ${data.cStat}: ${data.xMotivo}`,
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['received-nfe'] });
    } catch (e) {
      toast({ title: 'Erro ao manifestar', description: apiError(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const downloadBlob = async (url: string, filename: string) => {
    const res = await api.get(url, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const downloadXml = async (n: ReceivedNfe) => {
    try {
      await downloadBlob(`/sefaz/received/${n.id}/xml`, `${n.chave}.xml`);
    } catch (e) {
      toast({ title: 'Erro ao baixar XML', description: apiError(e), variant: 'destructive' });
    }
  };

  const downloadPdf = async (n: ReceivedNfe) => {
    setBusyId(n.id);
    try {
      await downloadBlob(`/sefaz/received/${n.id}/pdf`, `${n.chave}.pdf`);
    } catch (e) {
      toast({ title: 'Erro ao gerar PDF', description: apiError(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const filtros = ['TODAS', ...ufs];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notas Recebidas (SEFAZ)</h1>
          <p className="text-sm text-muted-foreground">
            NF-e (ICMS) emitidas contra a empresa, baixadas da SEFAZ — organizadas pela emissão.
          </p>
        </div>

        {/* Ações + filtros ao lado do botão Sincronizar */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Emissão</label>
            <Select value={mesF} onValueChange={setMesF}>
              <SelectTrigger className="w-40 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os meses</SelectItem>
                {meses.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Emitente</label>
            <Select value={emitenteF} onValueChange={setEmitenteF}>
              <SelectTrigger className="w-52 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os emitentes</SelectItem>
                {emitentes.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {resumoCount > 0 && (
            <Button variant="outline" onClick={manifestarTodas} disabled={manifesting || syncing}>
              {manifesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
              Manifestar todas ({resumoCount})
            </Button>
          )}
          <Button onClick={sync} disabled={syncing || manifesting}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar
          </Button>
        </div>
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
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => downloadXml(n)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          title="Baixar XML"
                        >
                          <FileCode className="w-3.5 h-3.5" /> XML
                        </button>
                        <button
                          onClick={() => downloadPdf(n)}
                          disabled={busyId === n.id}
                          className="inline-flex items-center gap-1 text-rose-600 hover:underline disabled:opacity-50"
                          title="Baixar PDF (DANFE)"
                        >
                          {busyId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF
                        </button>
                      </div>
                    ) : n.tipoDoc === 'CTE' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="CT-e: sem manifestação do destinatário">
                        <FileText className="w-3.5 h-3.5" /> resumo
                      </span>
                    ) : (
                      <button
                        onClick={() => manifestar(n)}
                        disabled={busyId === n.id}
                        className="inline-flex items-center gap-1 text-emerald-700 hover:underline disabled:opacity-50"
                        title="Manifestar (Ciência da Operação) e baixar o XML completo"
                      >
                        {busyId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />} Manifestar
                      </button>
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
        Notas "resumo" ainda não têm o XML — use <strong>Manifestar</strong> (Ciência da Operação) para baixar o XML completo e habilitar o PDF.
      </p>
    </div>
  );
}

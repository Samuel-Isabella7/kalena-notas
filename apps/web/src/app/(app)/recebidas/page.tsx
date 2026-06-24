'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { RefreshCw, Loader2, FileText, Inbox, FileCode, FileDown, BadgeCheck, X, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { ReceivedNfe, ReceivedMeta } from '@/types';
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

const PAGE_SIZE = 50;

interface SyncProgress {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  empresas: Array<{ empresa: string; novos?: number; novosCte?: number; erro?: string; cteErro?: string }>;
}

function RecebidasContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get('q') ?? '';
  const [buscaInput, setBuscaInput] = useState(q);

  // Busca com debounce → atualiza ?q= (server-side); não derruba os filtros (estado local)
  useEffect(() => {
    const t = setTimeout(() => {
      const atual = searchParams.get('q') ?? '';
      const novo = buscaInput.trim();
      if (novo !== atual) router.replace(novo ? `/recebidas?q=${encodeURIComponent(novo)}` : '/recebidas');
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput]);
  const [manifesting, setManifesting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>(searchParams.get('uf') ?? 'TODAS'); // UF da empresa
  const [tipoF, setTipoF] = useState<string>(searchParams.get('tipo') ?? 'TODOS'); // tipo de documento
  const [mesF, setMesF] = useState<string>(searchParams.get('mes') ?? 'TODOS'); // emissão (YYYY-MM)
  const [emitenteF, setEmitenteF] = useState<string>(searchParams.get('emitente') ?? 'TODOS'); // emitente
  const [page, setPage] = useState(1);

  const tipoLabel = (t: string) => (t === 'CTE' ? 'CT-e' : t === 'NFCE' ? 'NFC-e' : 'NF-e');

  // Reinicia a página ao mudar qualquer filtro
  useEffect(() => setPage(1), [filtro, tipoF, mesF, emitenteF, q]);

  // Lista paginada NO SERVIDOR (rápido: carrega 50 por vez, não milhares)
  const { data: notas, isLoading } = useQuery<{ total: number; rows: ReceivedNfe[] }>({
    queryKey: ['received-nfe', filtro, tipoF, mesF, emitenteF, q, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
      if (filtro !== 'TODAS') params.uf = filtro;
      if (tipoF !== 'TODOS') params.tipo = tipoF;
      if (mesF !== 'TODOS') params.mes = mesF;
      if (emitenteF !== 'TODOS') params.emitente = emitenteF;
      if (q) params.q = q;
      return (await api.get('/sefaz/received', { params })).data;
    },
  });

  // Opções dos filtros + total, calculados no servidor sobre TODAS as notas
  const { data: meta } = useQuery<ReceivedMeta>({
    queryKey: ['received-meta'],
    queryFn: async () => (await api.get('/sefaz/received/meta')).data,
  });

  // Empresas configuradas (SP/RJ/AL) — fonte do filtro de UF, sempre presente
  const { data: empresas } = useQuery<{ cnpj: string; nome: string; uf: string }[]>({
    queryKey: ['sefaz-empresas'],
    queryFn: async () => (await api.get('/sefaz/empresas')).data,
  });

  // Progresso da sincronização (roda em background no servidor) — polling enquanto ativa
  const { data: syncProg } = useQuery<SyncProgress>({
    queryKey: ['sefaz-sync-progress'],
    queryFn: async () => (await api.get('/sefaz/sync/progress')).data,
    refetchInterval: (query) => (query.state.data?.running ? 4000 : false),
  });
  const syncing = !!syncProg?.running;

  // Ao TERMINAR a sincronização, atualiza lista + opções de uma vez (não recarrega
  // a cada 4s para não ficar "piscando"/embaralhando a lista durante o processo).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (syncProg?.running) {
      wasRunning.current = true;
      return;
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      queryClient.invalidateQueries({ queryKey: ['received-nfe'] });
      queryClient.invalidateQueries({ queryKey: ['received-meta'] });
      const partes = (syncProg?.empresas ?? []).map((e) => {
        if (e.erro && e.cteErro) return `${e.empresa}: erro`;
        const nfe = e.erro ? 'NF-e: erro' : `${e.novos ?? 0} NF-e`;
        const cte = e.cteErro ? 'CT-e: erro' : `${e.novosCte ?? 0} CT-e`;
        return `${e.empresa}: ${nfe}, ${cte}`;
      });
      toast({
        title: 'Sincronização concluída',
        description: partes.join(' · ') || 'Sem novidades',
        variant: 'success',
      });
    }
  }, [syncProg, queryClient]);

  // UF vem das empresas configuradas (SP/RJ/AL) — sempre presente, não depende das notas
  const ufs = useMemo(() => {
    const set = new Set<string>();
    (empresas ?? []).forEach((e) => e.uf && set.add(e.uf));
    return Array.from(set).sort();
  }, [empresas]);
  const tipos = useMemo(() => (meta?.tipos ?? []).map((t) => t.tipo), [meta]);
  const meses = meta?.meses ?? [];
  const emitentes = meta?.emitentes ?? [];
  const total = meta?.total ?? 0;
  const ufCount = (uf: string) => meta?.ufs.find((u) => u.uf === uf)?.qtd ?? 0;
  const tipoCount = (t: string) => meta?.tipos.find((x) => x.tipo === t)?.qtd ?? 0;

  // O servidor já devolve filtrado e paginado.
  const visiveis = notas?.rows ?? [];
  const filtTotal = notas?.total ?? 0; // total do filtro atual (todas as páginas)
  const totalPages = Math.max(1, Math.ceil(filtTotal / PAGE_SIZE));
  const inicio = filtTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, filtTotal);
  const resumoCount = meta?.manifestaveis ?? 0;

  const sync = async () => {
    try {
      await api.post('/sefaz/sync');
      queryClient.invalidateQueries({ queryKey: ['sefaz-sync-progress'] });
      toast({
        title: 'Sincronização iniciada',
        description: 'Rodando em segundo plano — as notas vão aparecendo na lista. Pode levar vários minutos na primeira vez.',
        variant: 'success',
      });
    } catch (e) {
      toast({ title: 'Erro ao sincronizar', description: apiError(e), variant: 'destructive' });
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
            NF-e (ICMS) e CT-e (fretes) emitidos contra a empresa, baixados da SEFAZ — organizados pela emissão.
          </p>
          {syncing && (
            <p className="text-xs text-emerald-700 mt-1 animate-pulse">
              Sincronizando em segundo plano —{' '}
              {(syncProg?.empresas ?? [])
                .map((e) => `${e.empresa}: ${e.novos ?? 0} NF-e, ${e.novosCte ?? 0} CT-e`)
                .join(' · ') || 'iniciando...'}
            </p>
          )}
          {q && (
            <a
              href="/recebidas"
              className="inline-flex items-center gap-1 text-xs mt-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              Busca: <strong className="text-foreground">{q}</strong> <X className="w-3 h-3" />
            </a>
          )}
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

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
          placeholder="Buscar por emitente, CNPJ, nº ou chave…"
          className="w-full h-10 pl-9 pr-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring/30"
        />
        {buscaInput && (
          <button
            onClick={() => setBuscaInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
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
                filtro === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-card hover:border-muted-foreground/40',
              )}
            >
              {f === 'TODAS' ? 'Todas' : f}
              <span className="ml-1 text-xs opacity-70">
                ({f === 'TODAS' ? total : ufCount(f)})
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
                tipoF === t ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-card hover:border-muted-foreground/40',
              )}
            >
              {t === 'TODOS' ? 'Todos os tipos' : tipoLabel(t)}
              <span className="ml-1 opacity-70">
                ({t === 'TODOS' ? total : tipoCount(t)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Total do filtro atual + página */}
      {filtTotal > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {filtTotal.toLocaleString('pt-BR')} nota(s) no filtro atual · mostrando{' '}
          {inicio.toLocaleString('pt-BR')} a {fim.toLocaleString('pt-BR')}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma nota neste filtro. Clique em <strong>Sincronizar</strong> para buscar na SEFAZ.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Emissão</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Emitente</th>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Manifestação</th>
                <th className="px-4 py-2 font-medium">Documentos</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((n) => (
                <tr key={n.id} className="border-t hover:bg-muted/50">
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
                    {(() => {
                      const st = n.hasXml
                        ? { txt: 'Manifestada', dot: '#10b981', cls: 'bg-emerald-500/12 text-emerald-600 border border-emerald-500/35' }
                        : n.tipoDoc === 'CTE'
                          ? { txt: 'Resumo (s/ XML)', dot: '#94a3b8', cls: 'bg-muted text-muted-foreground border border-border' }
                          : { txt: 'Pendente', dot: '#f59e0b', cls: 'bg-amber-500/12 text-amber-600 border border-amber-500/35' };
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>
                          <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: st.dot }} />
                          {st.txt}
                        </span>
                      );
                    })()}
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

      {/* Paginação */}
      {filtTotal > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
          <span className="tabular-nums">
            Página {page} de {totalPages.toLocaleString('pt-BR')}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecebidasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RecebidasContent />
    </Suspense>
  );
}

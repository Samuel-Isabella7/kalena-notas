'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronLeft, ChevronRight, Send, RotateCcw, Eye } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { Invoice } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatDate, formatDocument } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { InvoiceEditDialog } from '@/components/invoices/invoice-edit-dialog';

const PAGE_SIZE = 50;

interface FilaResp {
  total: number;
  rows: Invoice[];
  counts: { aLancar: number; comErro: number; lancadasMes: number; valorPagar: number };
}

function statusPill(status: Invoice['status']) {
  switch (status) {
    case 'LANCADA':
      return { txt: 'Lançado (integração)', dot: '#10b981', cls: 'bg-emerald-500/12 text-emerald-600 border border-emerald-500/35' };
    case 'MANUAL':
      return { txt: 'Lançado manual', dot: '#6366f1', cls: 'bg-indigo-500/12 text-indigo-600 border border-indigo-500/35' };
    case 'ERRO':
      return { txt: 'Erro', dot: '#ef4444', cls: 'bg-rose-500/12 text-rose-600 border border-rose-500/35' };
    default:
      return { txt: 'A lançar', dot: '#f59e0b', cls: 'bg-amber-500/12 text-amber-600 border border-amber-500/35' };
  }
}

export default function ContasAPagarPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [account, setAccount] = useState<string>('TODAS');
  const [status, setStatus] = useState<string>('TODOS');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [launching, setLaunching] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canManage = can('CRIADOR', 'ADMIN');

  const { data, isLoading } = useQuery<FilaResp>({
    queryKey: ['contas-fila', account, status, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
      if (account !== 'TODAS') params.account = account;
      if (status !== 'TODOS') params.status = status;
      return (await api.get('/invoices/fila', { params })).data;
    },
    enabled: canManage,
  });

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border bg-card p-10 text-center text-muted-foreground">
        Você não tem acesso às Contas a Pagar.
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? { aLancar: 0, comErro: 0, lancadasMes: 0, valorPagar: 0 };
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, total);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['contas-fila'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const setFiltro = (fn: () => void) => {
    fn();
    setPage(1);
    setSelected(new Set());
  };

  const selecionavel = rows.filter((r) => r.status === 'PENDENTE' || r.status === 'ERRO');
  const allSel = selecionavel.length > 0 && selecionavel.every((r) => selected.has(r.id));
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (allSel) selecionavel.forEach((r) => s.delete(r.id));
      else selecionavel.forEach((r) => s.add(r.id));
      return s;
    });

  const lancarSelecionadas = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Lançar/Reprocessar ${ids.length} nota(s) na Omie?`)) return;
    setLaunching(true);
    try {
      const { data: r } = await api.post('/invoices/launch-batch', { ids });
      toast({
        title: 'Lançamento concluído',
        description: `${r.lancadas}/${r.total} lançada(s)${r.erros?.length ? ` · ${r.erros.length} erro(s)` : ''}`,
        variant: 'success',
      });
      setSelected(new Set());
      refetch();
    } catch (e) {
      toast({ title: 'Erro ao lançar', description: apiError(e), variant: 'destructive' });
    } finally {
      setLaunching(false);
    }
  };

  const abrir = (inv: Invoice) => {
    setEditing(inv);
    setDialogOpen(true);
  };

  const Card = ({ label, value, color, onClick, active }: { label: string; value: string; color?: string; onClick?: () => void; active?: boolean }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-[10px] border bg-card p-4 text-left transition-colors',
        onClick && 'hover:border-muted-foreground/40',
        active && 'ring-1 ring-slate-400 border-slate-400',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar (Omie)</h1>
        <p className="text-sm text-muted-foreground">Fila de lançamento das notas anexadas.</p>
      </div>

      {/* Cards-resumo */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="A lançar" value={counts.aLancar.toLocaleString('pt-BR')} color="text-amber-600"
          onClick={() => setFiltro(() => setStatus(status === 'PENDENTE' ? 'TODOS' : 'PENDENTE'))} active={status === 'PENDENTE'} />
        <Card label="Com erro" value={counts.comErro.toLocaleString('pt-BR')} color="text-rose-600"
          onClick={() => setFiltro(() => setStatus(status === 'ERRO' ? 'TODOS' : 'ERRO'))} active={status === 'ERRO'} />
        <Card label="Lançadas no mês" value={counts.lancadasMes.toLocaleString('pt-BR')} color="text-emerald-600" />
        <Card label="Valor a pagar" value={formatCurrency(counts.valorPagar)} color="text-foreground" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Conta</span>
        {['TODAS', 'SP', 'RJ'].map((a) => (
          <button key={a} onClick={() => setFiltro(() => setAccount(a))}
            className={cn('px-3 py-1 rounded-md text-xs font-medium border transition-colors',
              account === a ? 'bg-slate-900 text-white border-slate-900' : 'bg-card hover:border-muted-foreground/40')}>
            {a === 'TODAS' ? 'Todas' : a}
          </button>
        ))}
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground ml-3">Situação</span>
        {[
          { k: 'TODOS', l: 'Todas' },
          { k: 'PENDENTE', l: 'A lançar' },
          { k: 'ERRO', l: 'Com erro' },
          { k: 'LANCADA', l: 'Lançadas' },
          { k: 'MANUAL', l: 'Manual' },
        ].map((s) => (
          <button key={s.k} onClick={() => setFiltro(() => setStatus(s.k))}
            className={cn('px-3 py-1 rounded-md text-xs font-medium border transition-colors',
              status === s.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-card hover:border-muted-foreground/40')}>
            {s.l}
          </button>
        ))}
      </div>

      {/* Barra de ações */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-card p-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
          <Button onClick={lancarSelecionadas} disabled={launching} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Lançar na Omie
          </Button>
          <Button variant="outline" onClick={() => setSelected(new Set())}>Limpar</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          Nenhuma nota neste filtro.
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <input type="checkbox" checked={allSel} onChange={toggleAll}
                      disabled={selecionavel.length === 0} className="w-4 h-4 accent-emerald-600 align-middle" />
                  </th>
                  <th className="px-4 py-2 font-medium">Emissão</th>
                  <th className="px-4 py-2 font-medium">Fornecedor</th>
                  <th className="px-4 py-2 font-medium">Nº</th>
                  <th className="px-4 py-2 font-medium">Valor</th>
                  <th className="px-4 py-2 font-medium">Vencimento</th>
                  <th className="px-4 py-2 font-medium">Conta</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const st = statusPill(inv.status);
                  const sel = inv.status === 'PENDENTE' || inv.status === 'ERRO';
                  return (
                    <tr key={inv.id} className={cn('border-t hover:bg-muted/50', selected.has(inv.id) && 'bg-emerald-500/10')}>
                      <td className="px-3 py-2 w-10">
                        {sel && (
                          <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSel(inv.id)}
                            className="w-4 h-4 accent-emerald-600 align-middle" />
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(inv.dataEmissao ?? inv.competenceDate)}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{inv.fornecedorNome || '-'}</div>
                        <div className="text-xs text-muted-foreground">{formatDocument(inv.fornecedorDoc)}</div>
                        {inv.status === 'ERRO' && inv.omieErro && (
                          <div className="text-xs text-rose-600 mt-0.5 max-w-xs truncate" title={inv.omieErro}>{inv.omieErro}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{inv.numeroDocumento || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-medium tabular-nums">
                        {inv.valor != null ? formatCurrency(inv.valor) : '-'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(inv.dataVencimento)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{inv.account}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>
                          <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: st.dot }} />
                          {st.txt}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {inv.status === 'ERRO' ? (
                          <button onClick={() => abrir(inv)} className="inline-flex items-center gap-1 text-rose-600 hover:underline">
                            <RotateCcw className="w-3.5 h-3.5" /> Reprocessar
                          </button>
                        ) : inv.status === 'PENDENTE' ? (
                          <button onClick={() => abrir(inv)} className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                            <Send className="w-3.5 h-3.5" /> Revisar e lançar
                          </button>
                        ) : (
                          <button onClick={() => abrir(inv)} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <Eye className="w-3.5 h-3.5" /> Ver
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <span className="tabular-nums">
              {total.toLocaleString('pt-BR')} nota(s) · mostrando {inicio.toLocaleString('pt-BR')} a {fim.toLocaleString('pt-BR')}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setSelected(new Set()); }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2 tabular-nums">{page} / {totalPages.toLocaleString('pt-BR')}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => { setPage((p) => p + 1); setSelected(new Set()); }}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <InvoiceEditDialog
        invoice={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onChanged={refetch}
        canLaunch={canManage}
        canEdit={canManage}
      />
    </div>
  );
}

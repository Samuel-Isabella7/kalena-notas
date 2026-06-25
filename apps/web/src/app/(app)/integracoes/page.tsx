'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Landmark, Wallet, HardDrive, Sparkles, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { DashboardSummary, ReceivedMeta } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

export default function IntegracoesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const enabled = can('CRIADOR');
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
    enabled,
  });
  const { data: meta } = useQuery<ReceivedMeta>({
    queryKey: ['received-meta'],
    queryFn: async () => (await api.get('/sefaz/received/meta')).data,
    enabled,
  });
  const { data: fila } = useQuery<{ counts: { aLancar: number; comErro: number } }>({
    queryKey: ['contas-fila', 'TODAS', 'TODOS', 1],
    queryFn: async () => (await api.get('/invoices/fila', { params: { page: '1', pageSize: '1' } })).data,
    enabled,
  });

  if (!can('CRIADOR')) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border bg-card p-10 text-center text-muted-foreground">
        Apenas o criador pode ver as integrações.
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sincronizar = async () => {
    setSyncing(true);
    try {
      await api.post('/sefaz/sync');
      toast({ title: 'Sincronização iniciada', description: 'Rodando em segundo plano.', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['sefaz-sync-progress'] });
    } catch (e) {
      toast({ title: 'Erro ao sincronizar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const i = data.integracoes;
  const cards = [
    {
      label: 'SEFAZ',
      icon: Landmark,
      ok: i.sefaz,
      okText: 'Sincronizado',
      desc: 'Captura de NF-e e CT-e (Distribuição de DFe) e manifestação do destinatário.',
      metric: `${(meta?.total ?? 0).toLocaleString('pt-BR')} capturadas · ${(meta?.manifestaveis ?? 0).toLocaleString('pt-BR')} a manifestar`,
      href: '/recebidas',
      hrefText: 'Abrir Recebidas',
    },
    {
      label: 'Omie (Contas a Pagar)',
      icon: Wallet,
      ok: i.omie,
      okText: 'Conectado',
      desc: 'Lançamento das notas como Conta a Pagar (SP e RJ).',
      metric: `${(fila?.counts.aLancar ?? 0).toLocaleString('pt-BR')} a lançar · ${(fila?.counts.comErro ?? 0).toLocaleString('pt-BR')} com erro`,
      href: '/contas-a-pagar',
      hrefText: 'Abrir fila',
    },
    {
      label: 'Google Drive',
      icon: HardDrive,
      ok: i.drive,
      okText: 'Conectado',
      desc: 'Armazenamento dos arquivos (notas, XMLs da SEFAZ e notas físicas).',
      metric: i.drive ? 'Arquivos salvos no Drive' : 'Modo local (sem Drive)',
      href: '/notas-fisicas',
      hrefText: 'Abrir Notas físicas',
    },
    {
      label: 'Leitura por IA (Gemini)',
      icon: Sparkles,
      ok: i.ia,
      okText: 'Ativa',
      desc: 'Leitura automática dos PDFs anexados (fornecedor, valor, datas), inclusive escaneados.',
      metric: i.ia ? 'Lendo PDFs no anexo' : 'Desativada',
      href: '/contas-a-pagar',
      hrefText: 'Abrir Contas a Pagar',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral e ações. Para chaves e credenciais, vá em Configurações.
          </p>
        </div>
        <Button onClick={sincronizar} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sincronizar agora
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-muted text-muted-foreground">
                  <Icon className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-semibold">{c.label}</h2>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      c.ok ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}
                  >
                    {c.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {c.ok ? c.okText : 'Não configurado'}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">{c.desc}</p>
              <p className="text-xs font-medium mt-2 tabular-nums">{c.metric}</p>
              <div className="mt-3 flex items-center gap-3">
                <Link href={c.href} className="text-xs text-blue-600 hover:underline">
                  {c.hrefText}
                </Link>
                {c.label === 'SEFAZ' && (
                  <button onClick={sincronizar} disabled={syncing} className="text-xs text-emerald-700 hover:underline disabled:opacity-50">
                    Sincronizar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        As credenciais (chaves Omie, certificado SEFAZ, conta do Drive, chave da IA) são definidas com
        segurança nas variáveis de ambiente do servidor. Veja o status em <Link href="/configuracoes" className="text-blue-600 hover:underline">Configurações</Link>.
      </p>
    </div>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Landmark, Wallet, HardDrive, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardSummary } from '@/types';
import { useAuth } from '@/hooks/use-auth';

export default function IntegracoesPage() {
  const { can } = useAuth();

  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
    enabled: can('CRIADOR'),
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

  const i = data.integracoes;
  const cards = [
    {
      label: 'SEFAZ',
      icon: Landmark,
      ok: i.sefaz,
      desc: 'Captura de NF-e e CT-e emitidas contra a empresa (Distribuição de DFe) e manifestação do destinatário.',
      okText: 'Sincronizado',
      href: '/recebidas',
      hrefText: 'Abrir Recebidas',
    },
    {
      label: 'Omie (Contas a Pagar)',
      icon: Wallet,
      ok: i.omie,
      desc: 'Lançamento das notas como Conta a Pagar nas contas SP e RJ.',
      okText: 'Conectado',
      href: '/calendario',
      hrefText: 'Abrir Calendário',
    },
    {
      label: 'Google Drive',
      icon: HardDrive,
      ok: i.drive,
      desc: 'Armazenamento dos arquivos (notas anexadas, XMLs da SEFAZ e notas físicas).',
      okText: 'Conectado',
      href: '/notas-fisicas',
      hrefText: 'Abrir Notas físicas',
    },
    {
      label: 'Leitura por IA (Gemini)',
      icon: Sparkles,
      ok: i.ia,
      desc: 'Leitura automática dos PDFs anexados (fornecedor, valor, datas), inclusive escaneados.',
      okText: 'Ativa',
      href: '/calendario',
      hrefText: 'Abrir Calendário',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">Status das integrações do sistema.</p>
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
              <Link href={c.href} className="mt-3 inline-block text-xs text-blue-600 hover:underline">
                {c.hrefText}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

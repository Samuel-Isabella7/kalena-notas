'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  FileText,
  Clock,
  CheckCircle2,
  DollarSign,
  Paperclip,
  Loader2,
  Landmark,
  Wallet,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardSummary } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency, formatDateTime, formatDocument } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const SITUACAO_COLORS: Record<string, string> = {
  Processadas: '#10b981',
  Pendentes: '#f59e0b',
  Anexadas: '#3b82f6',
  'Notas físicas': '#94a3b8',
};

function tipoLabel(t: string) {
  return t === 'CTE' ? 'CT-e' : t === 'NFCE' ? 'NFC-e' : 'NF-e';
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    INVOICE_UPLOAD: 'Nota anexada',
    INVOICE_UPDATE: 'Nota editada',
    INVOICE_LAUNCH: 'Nota lançada na Omie',
    INVOICE_DELETE: 'Nota excluída',
    PHYSICAL_NOTE_UPLOAD: 'Nota física anexada',
    PHYSICAL_NOTE_DELETE: 'Nota física excluída',
  };
  return map[action] ?? action;
}

/** Donut em SVG puro (sem libs). */
function Donut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {data.map((d) => {
          const frac = d.value / total;
          const len = frac * c;
          const seg = (
            <circle
              key={d.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={SITUACAO_COLORS[d.label] ?? '#cbd5e1'}
              strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: SITUACAO_COLORS[d.label] ?? '#cbd5e1' }}
            />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="font-medium ml-auto">
              {d.value.toLocaleString('pt-BR')} ({Math.round((d.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Gráfico de linhas (fluxo mensal) em SVG puro. */
function FluxoChart({ data }: { data: { mes: string; recebidas: number; processadas: number }[] }) {
  const W = 460;
  const H = 200;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.recebidas, d.processadas)));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const line = (key: 'recebidas' | 'processadas') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="#f1f5f9" />
      ))}
      <path d={line('recebidas')} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
      <path d={line('processadas')} fill="none" stroke="#10b981" strokeWidth="2.5" />
      {data.map((d, i) => (
        <g key={d.mes}>
          <circle cx={x(i)} cy={y(d.recebidas)} r="3" fill="#3b82f6" />
          <circle cx={x(i)} cy={y(d.processadas)} r="3" fill="#10b981" />
          <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400" fontSize="10">
            {MONTH_NAMES[Number(d.mes.split('-')[1]) - 1]?.slice(0, 3)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function KpiCard({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between">
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-3">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const now = new Date();
  const greet = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (user?.name ?? '').split(' ')[0];
  const periodLabel = `${MONTH_NAMES[now.getMonth()]}/${now.getFullYear()}`;

  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
  });

  const integr = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'SEFAZ', icon: Landmark, ok: data.integracoes.sefaz, okText: 'Sincronizado' },
      { label: 'Omie (Contas a Pagar)', icon: Wallet, ok: data.integracoes.omie, okText: 'Conectado' },
      { label: 'Google Drive', icon: HardDrive, ok: data.integracoes.drive, okText: 'Conectado' },
      { label: 'Leitura por IA', icon: Sparkles, ok: data.integracoes.ia, okText: 'Ativa' },
    ];
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const t = data.totais;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greet}, {firstName}! 👋
          </h1>
          <p className="text-sm text-muted-foreground">Aqui está o resumo das suas notas fiscais.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Período</span>
          <span className="font-medium">{periodLabel}</span>
        </span>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={FileText} color="bg-violet-100 text-violet-600" label="Total de notas"
          value={t.totalNotas.toLocaleString('pt-BR')} sub="Recebidas + anexadas + físicas" />
        <KpiCard icon={Clock} color="bg-amber-100 text-amber-600" label="Pendentes"
          value={t.pendentes.toLocaleString('pt-BR')} sub="Manifestação / lançamento" />
        <KpiCard icon={CheckCircle2} color="bg-emerald-100 text-emerald-600" label="Processadas hoje"
          value={t.processadasHoje.toLocaleString('pt-BR')} sub="Capturadas hoje" />
        <KpiCard icon={DollarSign} color="bg-blue-100 text-blue-600" label="Valor total (mês)"
          value={formatCurrency(t.valorMes)} sub={periodLabel} />
        <KpiCard icon={Paperclip} color="bg-teal-100 text-teal-600" label="Anexadas (mês)"
          value={t.anexadasMes.toLocaleString('pt-BR')} sub="Notas anexadas no mês" />
      </div>

      {/* Fluxo + Atividades + Situação/Integrações */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Fluxo */}
        <div className="rounded-xl border bg-white p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Fluxo de notas por período</h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Recebidas</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Com XML</span>
          </div>
          {data.fluxo.length > 0 ? (
            <FluxoChart data={data.fluxo} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de emissão ainda.</p>
          )}
        </div>

        {/* Atividades recentes */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold mb-3">Atividades recentes</h2>
          {data.atividades.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma atividade ainda.</p>
          ) : (
            <ul className="space-y-3">
              {data.atividades.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                    {formatDateTime(a.createdAt).slice(-5)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{actionLabel(a.action)}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.quem}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Situação + Integrações */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold mb-3">Situação das notas</h2>
            <Donut data={data.situacao} />
          </div>

          {can('CRIADOR') && (
            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold mb-3">Integrações</h2>
              <ul className="space-y-2">
                {integr.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.label} className="flex items-center gap-2 text-sm">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{it.label}</span>
                      <span className={`ml-auto text-xs font-medium ${it.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {it.ok ? it.okText : 'Não configurado'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href="/integracoes" className="mt-3 inline-block text-xs text-blue-600 hover:underline">
                Ver integrações
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Últimas notas recebidas */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold">Últimas notas recebidas</h2>
          <Link href="/recebidas" className="text-xs text-blue-600 hover:underline">
            Ver todas
          </Link>
        </div>
        {data.ultimasRecebidas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma nota recebida ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Emissão</th>
                  <th className="px-5 py-2 font-medium">Tipo</th>
                  <th className="px-5 py-2 font-medium">Emitente</th>
                  <th className="px-5 py-2 font-medium">Nº</th>
                  <th className="px-5 py-2 font-medium">Valor</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimasRecebidas.map((n) => (
                  <tr key={n.id} className="border-t hover:bg-slate-50/60">
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      {n.dataEmissao ? n.dataEmissao.split('-').reverse().join('/') : '-'}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge variant={n.tipoDoc === 'CTE' ? 'warning' : 'info'}>{tipoLabel(n.tipoDoc)}</Badge>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{n.emitenteNome || '-'}</div>
                      <div className="text-xs text-muted-foreground">{formatDocument(n.emitenteCnpj)}</div>
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">{n.numero || '-'}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap font-medium">
                      {n.valor != null ? formatCurrency(n.valor) : '-'}
                    </td>
                    <td className="px-5 py-2.5">
                      {n.hasXml ? (
                        <Badge variant="success">Processada</Badge>
                      ) : (
                        <Badge variant="warning">Pendente</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

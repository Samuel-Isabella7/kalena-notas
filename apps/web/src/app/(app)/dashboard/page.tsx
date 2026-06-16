'use client';
import { useMemo, useState } from 'react';
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
import { formatCurrency, formatDocument } from '@/lib/utils';
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

/** Data/hora correta e curta: "16/06 09:30". */
function dateTimeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} ${hora}`;
}

/** Últimos 12 meses (YYYY-MM), mais recente primeiro. */
function ultimosMeses(n = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}/${y}`;
}

/** Donut em SVG puro com total no centro (sem libs). */
function Donut({ data, total }: { data: { label: string; value: number }[]; total: number }) {
  const soma = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {data.map((d) => {
            const len = (d.value / soma) * c;
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold leading-none">{total.toLocaleString('pt-BR')}</span>
          <span className="text-xs text-muted-foreground mt-1">Total</span>
        </div>
      </div>
      <div className="space-y-2 flex-1">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: SITUACAO_COLORS[d.label] ?? '#cbd5e1' }}
            />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="font-medium ml-auto whitespace-nowrap">
              {d.value.toLocaleString('pt-BR')} ({Math.round((d.value / soma) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  bg,
  fg,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  fg: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <span
        className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
        style={{ backgroundColor: bg, color: fg }}
      >
        <Icon className="w-5 h-5" />
      </span>
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

  const meses = useMemo(() => ultimosMeses(12), []);
  const [mesSel, setMesSel] = useState<string>(meses[0]);

  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard', mesSel],
    queryFn: async () => (await api.get('/dashboard', { params: { mes: mesSel } })).data,
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

  const isCriador = can('CRIADOR');

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Período</span>
          <Select value={mesSel} onValueChange={setMesSel}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard icon={FileText} bg="#ede9fe" fg="#7c3aed" label="Total de notas"
              value={data.totais.totalNotas.toLocaleString('pt-BR')} sub="Recebidas + anexadas + físicas" />
            <KpiCard icon={Clock} bg="#fef3c7" fg="#d97706" label="Pendentes"
              value={data.totais.pendentes.toLocaleString('pt-BR')} sub="Manifestação / lançamento" />
            <KpiCard icon={CheckCircle2} bg="#d1fae5" fg="#059669" label="Processadas hoje"
              value={data.totais.processadasHoje.toLocaleString('pt-BR')} sub="Capturadas hoje" />
            <KpiCard icon={DollarSign} bg="#dbeafe" fg="#2563eb" label="Valor total (mês)"
              value={formatCurrency(data.totais.valorMes)} sub={monthLabel(data.periodoMes)} />
            <KpiCard icon={Paperclip} bg="#ccfbf1" fg="#0d9488" label="Anexadas (mês)"
              value={data.totais.anexadasMes.toLocaleString('pt-BR')} sub="Notas + notas físicas" />
          </div>

          {/* Situação + Atividades + Integrações */}
          <div className={`grid gap-4 ${isCriador ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold mb-4">Situação das notas</h2>
              <Donut data={data.situacao} total={data.totais.totalNotas} />
            </div>

            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold mb-2">Atividades recentes</h2>
              {data.atividades.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma atividade ainda.</p>
              ) : (
                <ul className="divide-y">
                  {data.atividades.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{actionLabel(a.action)}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.quem}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                        {dateTimeShort(a.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isCriador && (
              <div className="rounded-xl border bg-white p-5">
                <h2 className="font-semibold mb-3">Integrações</h2>
                <ul className="space-y-2.5">
                  {integr.map((it) => {
                    const Icon = it.icon;
                    return (
                      <li key={it.label} className="flex items-center gap-2 text-sm">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground truncate">{it.label}</span>
                        <span
                          className={`ml-auto text-xs font-medium whitespace-nowrap ${
                            it.ok ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
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
        </>
      )}
    </div>
  );
}

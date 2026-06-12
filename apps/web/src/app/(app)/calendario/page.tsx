'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileText, CheckCircle2, AlertCircle, Clock, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { CalendarOverview, CalendarMonth } from '@/types';
import { cn, WEEKDAY_SHORT } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CalendarioPage() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const initialYear = Math.max(now.getFullYear(), 2026);
  // Junho é o primeiro mês de 2026; nos demais anos começa em janeiro.
  const initialMonth = initialYear === 2026 ? Math.max(now.getMonth() + 1, 6) : now.getMonth() + 1;
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const { data: years } = useQuery<number[]>({
    queryKey: ['calendar-years'],
    queryFn: async () => (await api.get('/calendar/years')).data,
  });

  const { data: overview, isLoading: loadingOverview } = useQuery<CalendarOverview>({
    queryKey: ['calendar-overview', year],
    queryFn: async () => (await api.get('/calendar/overview', { params: { year } })).data,
  });

  const { data: monthData, isLoading: loadingMonth } = useQuery<CalendarMonth>({
    queryKey: ['calendar-month', year, month],
    queryFn: async () => (await api.get('/calendar/month', { params: { year, month } })).data,
  });

  // espaços em branco antes do dia 1 (alinhamento de semana, domingo = 0)
  const leadingBlanks = monthData ? monthData.days[0]?.weekday ?? 0 : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário de Notas Fiscais</h1>
          <p className="text-sm text-muted-foreground">
            Selecione o dia para anexar e acompanhar as notas recebidas.
          </p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(years ?? [2026]).map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Seletor de meses */}
      {loadingOverview ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {overview?.months.map((m) => {
            const active = m.month === month;
            return (
              <button
                key={m.month}
                onClick={() => setMonth(m.month)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all',
                  active
                    ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                    : 'bg-white hover:border-slate-400',
                )}
              >
                <div className="font-semibold text-sm">{m.name}</div>
                <div className={cn('text-xs mt-1', active ? 'text-slate-300' : 'text-muted-foreground')}>
                  {m.total} nota{m.total === 1 ? '' : 's'}
                </div>
                {m.pendentes > 0 && (
                  <div className={cn('text-xs mt-0.5', active ? 'text-amber-300' : 'text-amber-600')}>
                    {m.pendentes} pendente{m.pendentes === 1 ? '' : 's'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Grade de dias */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold mb-4">
          {monthData?.name} de {year}
        </h2>

        {loadingMonth ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAY_SHORT.map((w) => (
                <div key={w} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {monthData?.days.map((d) => {
                const blocked = !d.isBusinessDay;
                const isToday = d.date === todayStr;
                const cell = (
                  <div
                    className={cn(
                      'h-24 rounded-md border p-2 flex flex-col text-sm transition-all',
                      blocked
                        ? 'bg-slate-50 border-slate-100 text-slate-400'
                        : 'bg-white hover:border-slate-900 hover:shadow-sm cursor-pointer',
                      isToday && 'ring-2 ring-blue-500 ring-offset-1 border-blue-500',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('font-semibold', blocked && 'text-slate-400', isToday && 'text-blue-600')}>
                          {d.day}
                        </span>
                        {isToday && <span className="w-2 h-2 rounded-full bg-blue-500" title="Hoje" />}
                      </span>
                      {!blocked && d.total > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                          <FileText className="w-3 h-3" /> {d.total}
                        </span>
                      )}
                    </div>
                    {blocked ? (
                      <span className="text-[10px] leading-tight mt-auto">
                        {d.holiday ?? 'Fim de semana'}
                      </span>
                    ) : (
                      <div className="mt-auto flex flex-wrap gap-1">
                        {d.lancadas > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-green-700">
                            <CheckCircle2 className="w-3 h-3" />
                            {d.lancadas}
                          </span>
                        )}
                        {d.manuais > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600">
                            <UserCheck className="w-3 h-3" />
                            {d.manuais}
                          </span>
                        )}
                        {d.pendentes > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                            <Clock className="w-3 h-3" />
                            {d.pendentes}
                          </span>
                        )}
                        {d.erros > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600">
                            <AlertCircle className="w-3 h-3" />
                            {d.erros}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
                return blocked ? (
                  <div key={d.date} title={d.holiday ?? 'Fim de semana'}>
                    {cell}
                  </div>
                ) : (
                  <Link key={d.date} href={`/dia/${d.date}`}>
                    {cell}
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Hoje
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-700" /> Lançado via integração
              </span>
              <span className="inline-flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-indigo-600" /> Lançado Manual
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" /> Pendente
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-red-600" /> Erro no lançamento
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

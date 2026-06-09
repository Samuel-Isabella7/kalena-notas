/**
 * Cálculo de feriados e dias úteis.
 *
 * Cobertura escolhida pelo projeto:
 *  - Feriados NACIONAIS (fixos + móveis derivados da Páscoa)
 *  - Feriado ESTADUAL de São Paulo (09/07 - Revolução Constitucionalista)
 *  - Feriado MUNICIPAL da cidade de São Paulo (25/01 - Aniversário de São Paulo)
 *
 * As funções trabalham com datas em UTC (meia-noite) para evitar problemas de fuso.
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  scope: 'NACIONAL' | 'ESTADUAL_SP' | 'MUNICIPAL_SP';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) para um dado ano. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Soma `days` dias a uma data (UTC) e retorna YYYY-MM-DD. */
function addDays(year: number, month: number, day: number, days: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Lista todos os feriados considerados para o ano. */
export function holidaysForYear(year: number): Holiday[] {
  const easter = easterSunday(year);
  const easterDays = (offset: number) =>
    addDays(year, easter.month, easter.day, offset);

  const list: Holiday[] = [
    // Nacionais fixos
    { date: ymd(year, 1, 1), name: 'Confraternização Universal', scope: 'NACIONAL' },
    { date: ymd(year, 4, 21), name: 'Tiradentes', scope: 'NACIONAL' },
    { date: ymd(year, 5, 1), name: 'Dia do Trabalho', scope: 'NACIONAL' },
    { date: ymd(year, 9, 7), name: 'Independência do Brasil', scope: 'NACIONAL' },
    { date: ymd(year, 10, 12), name: 'Nossa Senhora Aparecida', scope: 'NACIONAL' },
    { date: ymd(year, 11, 2), name: 'Finados', scope: 'NACIONAL' },
    { date: ymd(year, 11, 15), name: 'Proclamação da República', scope: 'NACIONAL' },
    { date: ymd(year, 11, 20), name: 'Consciência Negra', scope: 'NACIONAL' },
    { date: ymd(year, 12, 25), name: 'Natal', scope: 'NACIONAL' },

    // Nacionais móveis (derivados da Páscoa)
    { date: easterDays(-48), name: 'Carnaval (segunda-feira)', scope: 'NACIONAL' },
    { date: easterDays(-47), name: 'Carnaval (terça-feira)', scope: 'NACIONAL' },
    { date: easterDays(-2), name: 'Sexta-feira Santa', scope: 'NACIONAL' },
    { date: easterDays(60), name: 'Corpus Christi', scope: 'NACIONAL' },

    // Estadual SP
    { date: ymd(year, 7, 9), name: 'Revolução Constitucionalista (SP)', scope: 'ESTADUAL_SP' },

    // Municipal cidade de São Paulo
    { date: ymd(year, 1, 25), name: 'Aniversário de São Paulo', scope: 'MUNICIPAL_SP' },
  ];

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

let cache: Record<number, Map<string, Holiday>> = {};

function holidayMap(year: number): Map<string, Holiday> {
  if (!cache[year]) {
    cache[year] = new Map(holidaysForYear(year).map((h) => [h.date, h]));
  }
  return cache[year];
}

/** Retorna o feriado de uma data (YYYY-MM-DD), ou null. */
export function getHoliday(dateStr: string): Holiday | null {
  const year = Number(dateStr.slice(0, 4));
  return holidayMap(year).get(dateStr) ?? null;
}

/** True se a data (YYYY-MM-DD) cai num sábado ou domingo. */
export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

/** True se a data é um dia útil (não é fim de semana nem feriado). */
export function isBusinessDay(dateStr: string): boolean {
  return !isWeekend(dateStr) && !getHoliday(dateStr);
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number; // dia do mês
  weekday: number; // 0=domingo ... 6=sábado
  isWeekend: boolean;
  isBusinessDay: boolean;
  holiday: string | null;
}

/** Gera todos os dias de um mês com metadados de dia útil/feriado. */
export function daysOfMonth(year: number, month: number): CalendarDay[] {
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: CalendarDay[] = [];
  for (let d = 1; d <= total; d++) {
    const date = ymd(year, month, d);
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const holiday = getHoliday(date);
    const weekend = weekday === 0 || weekday === 6;
    out.push({
      date,
      day: d,
      weekday,
      isWeekend: weekend,
      isBusinessDay: !weekend && !holiday,
      holiday: holiday ? holiday.name : null,
    });
  }
  return out;
}

export const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

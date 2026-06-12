import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { daysOfMonth, MONTH_NAMES_PT } from '../../common/utils/business-days';
import { allowedKinds } from '../../common/utils/role-scope';

// O sistema começa em junho/2026. Anos seguintes mostram o ano inteiro
// e ficam disponíveis automaticamente conforme o tempo passa (sem mexer no código).
const FIRST_YEAR = 2026;
const FIRST_MONTH = 6;

function startMonthFor(year: number): number {
  return year === FIRST_YEAR ? FIRST_MONTH : 1;
}

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  availableYears(): number[] {
    const current = new Date().getFullYear();
    const last = Math.max(current, FIRST_YEAR);
    const years: number[] = [];
    for (let y = FIRST_YEAR; y <= last; y++) years.push(y);
    return years;
  }

  async overview(year: number, role: Role) {
    const start = new Date(Date.UTC(year, startMonthFor(year) - 1, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const invoices = await this.prisma.invoice.findMany({
      where: { competenceDate: { gte: start, lt: end }, kind: { in: allowedKinds(role) } },
      select: { competenceDate: true, status: true },
    });

    const buckets: Record<number, { total: number; lancadas: number; manuais: number; pendentes: number; erros: number }> = {};
    for (const inv of invoices) {
      const month = inv.competenceDate.getUTCMonth() + 1;
      buckets[month] ??= { total: 0, lancadas: 0, manuais: 0, pendentes: 0, erros: 0 };
      buckets[month].total++;
      if (inv.status === InvoiceStatus.LANCADA) buckets[month].lancadas++;
      else if (inv.status === InvoiceStatus.MANUAL) buckets[month].manuais++;
      else if (inv.status === InvoiceStatus.ERRO) buckets[month].erros++;
      else buckets[month].pendentes++;
    }

    const months: Array<{
      month: number;
      name: string;
      businessDays: number;
      total: number;
      lancadas: number;
      manuais: number;
      pendentes: number;
      erros: number;
    }> = [];
    for (let m = startMonthFor(year); m <= 12; m++) {
      const days = daysOfMonth(year, m);
      const businessDays = days.filter((d) => d.isBusinessDay).length;
      const b = buckets[m] ?? { total: 0, lancadas: 0, manuais: 0, pendentes: 0, erros: 0 };
      months.push({
        month: m,
        name: MONTH_NAMES_PT[m - 1],
        businessDays,
        total: b.total,
        lancadas: b.lancadas,
        manuais: b.manuais,
        pendentes: b.pendentes,
        erros: b.erros,
      });
    }

    return { year, months };
  }

  async month(year: number, month: number, role: Role) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const invoices = await this.prisma.invoice.findMany({
      where: { competenceDate: { gte: start, lt: end }, kind: { in: allowedKinds(role) } },
      select: { competenceDate: true, status: true },
    });

    const byDay: Record<string, { total: number; lancadas: number; manuais: number; pendentes: number; erros: number }> = {};
    for (const inv of invoices) {
      const key = inv.competenceDate.toISOString().slice(0, 10);
      byDay[key] ??= { total: 0, lancadas: 0, manuais: 0, pendentes: 0, erros: 0 };
      byDay[key].total++;
      if (inv.status === InvoiceStatus.LANCADA) byDay[key].lancadas++;
      else if (inv.status === InvoiceStatus.MANUAL) byDay[key].manuais++;
      else if (inv.status === InvoiceStatus.ERRO) byDay[key].erros++;
      else byDay[key].pendentes++;
    }

    const days = daysOfMonth(year, month).map((d) => ({
      ...d,
      ...(byDay[d.date] ?? { total: 0, lancadas: 0, manuais: 0, pendentes: 0, erros: 0 }),
    }));

    return { year, month, name: MONTH_NAMES_PT[month - 1], days };
  }
}

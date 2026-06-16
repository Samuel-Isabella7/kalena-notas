import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async summary(mes?: string) {
    const now = new Date();
    // Mês de referência (YYYY-MM) — padrão: mês atual. Afeta os cards "(mês)".
    const ref = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null;
    const refY = ref ? Number(ref.split('-')[0]) : now.getUTCFullYear();
    const refM = ref ? Number(ref.split('-')[1]) - 1 : now.getUTCMonth();
    const inicioMes = new Date(Date.UTC(refY, refM, 1));
    const fimMes = new Date(Date.UTC(refY, refM + 1, 1));
    const inicioHoje = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const periodoMes = `${refY}-${String(refM + 1).padStart(2, '0')}`;

    const [
      recebidasTotal,
      recebidasResumo,
      recebidasPorTipo,
      processadasHoje,
      invoicesTotal,
      invoicesPendentes,
      invoicesPorStatus,
      invoicesMes,
      fisicasMes,
      fisicasTotal,
      valorMesAgg,
      atividadesRaw,
      ultimasRaw,
    ] = await Promise.all([
      this.prisma.receivedNfe.count(),
      this.prisma.receivedNfe.count({ where: { resumoOnly: true } }),
      this.prisma.receivedNfe.groupBy({ by: ['tipoDoc'], _count: { _all: true } }),
      this.prisma.receivedNfe.count({ where: { capturedAt: { gte: inicioHoje } } }),
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.PENDENTE } }),
      this.prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.invoice.count({ where: { createdAt: { gte: inicioMes, lt: fimMes } } }),
      this.prisma.physicalNote.count({ where: { createdAt: { gte: inicioMes, lt: fimMes } } }),
      this.prisma.physicalNote.count(),
      this.prisma.receivedNfe.aggregate({
        _sum: { valor: true },
        where: { dataEmissao: { gte: inicioMes, lt: fimMes } },
      }),
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { user: { select: { name: true } } },
      }),
      this.prisma.receivedNfe.findMany({
        orderBy: { capturedAt: 'desc' },
        take: 5,
      }),
    ]);

    const recebidasComXml = recebidasTotal - recebidasResumo;
    const totalNotas = recebidasTotal + invoicesTotal + fisicasTotal;

    return {
      periodoMes,
      totais: {
        totalNotas,
        recebidas: recebidasTotal,
        anexadas: invoicesTotal,
        fisicas: fisicasTotal,
        pendentes: recebidasResumo + invoicesPendentes,
        processadasHoje,
        // Anexadas no mês = notas anexadas (Invoice) + notas físicas no mês
        anexadasMes: invoicesMes + fisicasMes,
        valorMes: valorMesAgg._sum.valor ? Number(valorMesAgg._sum.valor) : 0,
      },
      porTipo: recebidasPorTipo.map((t) => ({ tipo: t.tipoDoc, qtd: t._count._all })),
      invoicesPorStatus: invoicesPorStatus.map((s) => ({ status: s.status, qtd: s._count._all })),
      // Donut "Situação das notas" — partição limpa (soma = total de notas)
      situacao: [
        { label: 'Processadas', value: recebidasComXml },
        { label: 'Pendentes', value: recebidasResumo },
        { label: 'Anexadas', value: invoicesTotal },
        { label: 'Notas físicas', value: fisicasTotal },
      ],
      atividades: atividadesRaw.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        details: a.details,
        quem: a.user?.name ?? 'Sistema',
        createdAt: a.createdAt,
      })),
      ultimasRecebidas: ultimasRaw.map((r) => ({
        id: r.id,
        tipoDoc: r.tipoDoc,
        emitenteNome: r.emitenteNome,
        emitenteCnpj: r.emitenteCnpj,
        numero: r.numero,
        valor: r.valor != null ? Number(r.valor) : null,
        dataEmissao: r.dataEmissao ? r.dataEmissao.toISOString().slice(0, 10) : null,
        hasXml: r.hasXml,
        capturedAt: r.capturedAt,
      })),
      integracoes: {
        sefaz: !!(this.config.get<string>('SEFAZ_SP_CNPJ') || this.config.get<string>('SEFAZ_RJ_CNPJ')),
        omie: !!this.config.get<string>('OMIE_SP_APP_KEY'),
        drive: !!(
          this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON') ||
          this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_FILE')
        ),
        ia: !!(this.config.get<string>('GEMINI_API_KEY') || '').trim(),
      },
    };
  }
}

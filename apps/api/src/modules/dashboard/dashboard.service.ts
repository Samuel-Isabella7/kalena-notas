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

  async summary() {
    const now = new Date();
    const inicioMes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const inicioHoje = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [
      recebidasTotal,
      recebidasResumo,
      recebidasPorTipo,
      processadasHoje,
      invoicesTotal,
      invoicesPendentes,
      invoicesPorStatus,
      anexadasMes,
      fisicasTotal,
      valorMesAgg,
      fluxoRaw,
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
      this.prisma.invoice.count({ where: { createdAt: { gte: inicioMes } } }),
      this.prisma.physicalNote.count(),
      this.prisma.receivedNfe.aggregate({
        _sum: { valor: true },
        where: { dataEmissao: { gte: inicioMes } },
      }),
      this.prisma.$queryRaw<{ mes: string; total: bigint; com_xml: bigint }[]>`
        SELECT to_char(data_emissao, 'YYYY-MM') AS mes,
               COUNT(*) AS total,
               SUM(CASE WHEN has_xml THEN 1 ELSE 0 END) AS com_xml
        FROM received_nfe
        WHERE data_emissao >= date_trunc('month', CURRENT_DATE) - interval '5 months'
        GROUP BY 1
        ORDER BY 1`,
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
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
      totais: {
        totalNotas,
        recebidas: recebidasTotal,
        anexadas: invoicesTotal,
        fisicas: fisicasTotal,
        pendentes: recebidasResumo + invoicesPendentes,
        processadasHoje,
        anexadasMes,
        valorMes: valorMesAgg._sum.valor ? Number(valorMesAgg._sum.valor) : 0,
      },
      porTipo: recebidasPorTipo.map((t) => ({ tipo: t.tipoDoc, qtd: t._count._all })),
      invoicesPorStatus: invoicesPorStatus.map((s) => ({ status: s.status, qtd: s._count._all })),
      // Donut "Situação das notas"
      situacao: [
        { label: 'Processadas', value: recebidasComXml },
        { label: 'Pendentes', value: recebidasResumo + invoicesPendentes },
        { label: 'Anexadas', value: invoicesTotal },
        { label: 'Notas físicas', value: fisicasTotal },
      ],
      // Fluxo mensal (últimos 6 meses)
      fluxo: fluxoRaw.map((r) => ({
        mes: r.mes,
        recebidas: Number(r.total),
        processadas: Number(r.com_xml),
      })),
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

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
    const ref = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null;
    const refY = ref ? Number(ref.split('-')[0]) : now.getUTCFullYear();
    const refM = ref ? Number(ref.split('-')[1]) - 1 : now.getUTCMonth();
    const inicioMes = new Date(Date.UTC(refY, refM, 1));
    const fimMes = new Date(Date.UTC(refY, refM + 1, 1));
    const periodoMes = `${refY}-${String(refM + 1).padStart(2, '0')}`;

    // Janelas por mês selecionado (recebidas: emissão; anexadas: dia; físicas: anexo)
    const recWhere = { dataEmissao: { gte: inicioMes, lt: fimMes } };
    const invWhere = { competenceDate: { gte: inicioMes, lt: fimMes } };
    const fisWhere = { createdAt: { gte: inicioMes, lt: fimMes } };

    const [
      recTotal,
      recResumo,
      recPorTipo,
      invTotal,
      invPend,
      invErros,
      fisTotal,
      valorAgg,
      atividadesRaw,
      mesesRec,
      mesesInv,
      mesesFis,
    ] = await Promise.all([
      this.prisma.receivedNfe.count({ where: recWhere }),
      this.prisma.receivedNfe.count({ where: { ...recWhere, resumoOnly: true } }),
      this.prisma.receivedNfe.groupBy({ by: ['tipoDoc'], where: recWhere, _count: { _all: true } }),
      this.prisma.invoice.count({ where: invWhere }),
      this.prisma.invoice.count({ where: { ...invWhere, status: InvoiceStatus.PENDENTE } }),
      this.prisma.invoice.count({ where: { ...invWhere, status: InvoiceStatus.ERRO } }),
      this.prisma.physicalNote.count({ where: fisWhere }),
      this.prisma.receivedNfe.aggregate({ _sum: { valor: true }, where: recWhere }),
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { user: { select: { name: true } } },
      }),
      this.prisma.$queryRaw<{ mes: string }[]>`
        SELECT DISTINCT to_char(data_emissao, 'YYYY-MM') AS mes FROM received_nfe WHERE data_emissao IS NOT NULL`,
      this.prisma.$queryRaw<{ mes: string }[]>`
        SELECT DISTINCT to_char(competence_date, 'YYYY-MM') AS mes FROM invoices`,
      this.prisma.$queryRaw<{ mes: string }[]>`
        SELECT DISTINCT to_char(created_at, 'YYYY-MM') AS mes FROM physical_notes`,
    ]);

    const recComXml = recTotal - recResumo;
    const totalNotas = recTotal + invTotal + fisTotal;

    // Meses existentes no sistema (união), do mais recente para o mais antigo.
    const setMeses = new Set<string>();
    for (const r of [...mesesRec, ...mesesInv, ...mesesFis]) if (r.mes) setMeses.add(r.mes);
    setMeses.add(periodoMes); // garante o mês selecionado na lista
    const mesesDisponiveis = Array.from(setMeses).sort().reverse();

    return {
      periodoMes,
      mesesDisponiveis,
      totais: {
        totalNotas,
        pendentes: recResumo + invPend,
        processadas: recComXml,
        anexadas: invTotal + fisTotal,
        valorMes: valorAgg._sum.valor ? Number(valorAgg._sum.valor) : 0,
        errosOmie: invErros,
      },
      situacao: [
        { label: 'Processadas', value: recComXml },
        { label: 'Pendentes', value: recResumo },
        { label: 'Anexadas', value: invTotal },
        { label: 'Notas físicas', value: fisTotal },
      ],
      porTipoMes: recPorTipo.map((t) => ({ tipo: t.tipoDoc, qtd: t._count._all })),
      atividades: atividadesRaw.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        details: a.details,
        quem: a.user?.name ?? 'Sistema',
        createdAt: a.createdAt,
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

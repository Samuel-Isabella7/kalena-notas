import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Invoice, InvoiceKind, InvoiceStatus, OmieAccount, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveService } from '../storage/drive.service';
import { PdfService } from '../pdf/pdf.service';
import { OmieService } from '../omie/omie.service';
import { isBusinessDay } from '../../common/utils/business-days';
import { allowedKinds } from '../../common/utils/role-scope';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private drive: DriveService,
    private pdf: PdfService,
    private omie: OmieService,
  ) {}

  async upload(
    file: UploadedFile,
    dateStr: string,
    account: OmieAccount,
    kind: InvoiceKind,
    uploaderId: string,
    status: InvoiceStatus = InvoiceStatus.MANUAL,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!isBusinessDay(dateStr)) {
      throw new BadRequestException('Só é possível anexar notas em dias úteis (sem fins de semana/feriados).');
    }

    const [y, m, d] = dateStr.split('-').map(Number);
    const kindLabel = kind === InvoiceKind.SERVICO ? 'Serviço' : 'ICMS';

    // Lê o PDF (pré-preenchimento) e faz upload em paralelo
    const [extracted, stored] = await Promise.all([
      this.pdf.extract(file.buffer, file.mimetype),
      this.drive.upload({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        kindLabel,
        year: y,
        month: m,
        day: d,
      }),
    ]);

    const invoice = await this.prisma.invoice.create({
      data: {
        competenceDate: this.toDate(dateStr),
        account,
        kind,
        status: status === InvoiceStatus.MANUAL ? InvoiceStatus.MANUAL : InvoiceStatus.PENDENTE,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        driveFileId: stored.driveFileId,
        driveLink: stored.driveLink,
        localPath: stored.localPath,
        fornecedorDoc: extracted.fornecedorDoc,
        fornecedorNome: extracted.fornecedorNome,
        numeroDocumento: extracted.numeroDocumento,
        valor: extracted.valor != null ? new Prisma.Decimal(extracted.valor) : null,
        dataEmissao: extracted.dataEmissao ? this.toDate(extracted.dataEmissao) : null,
        dataVencimento: extracted.dataVencimento ? this.toDate(extracted.dataVencimento) : null,
        extractedRaw: extracted as unknown as Prisma.InputJsonValue,
        uploadedById: uploaderId,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId: uploaderId,
        action: 'INVOICE_UPLOAD',
        entity: 'Invoice',
        entityId: invoice.id,
        details: { date: dateStr, fileName: file.originalname, pdfOk: extracted.textOk },
      },
    });

    return { invoice: this.map(invoice), extraction: { textOk: extracted.textOk } };
  }

  async listByDate(dateStr: string, role: Role) {
    const invoices = await this.prisma.invoice.findMany({
      where: { competenceDate: this.toDate(dateStr), kind: { in: allowedKinds(role) } },
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: { name: true } }, launchedBy: { select: { name: true } } },
    });
    return invoices.map((i) => this.map(i));
  }

  async get(id: string, role: Role) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { uploadedBy: { select: { name: true } }, launchedBy: { select: { name: true } } },
    });
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (!allowedKinds(role).includes(invoice.kind)) {
      throw new ForbiddenException('Você não tem acesso a este tipo de nota.');
    }
    return this.map(invoice);
  }

  async update(id: string, dto: UpdateInvoiceDto, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (invoice.status === InvoiceStatus.LANCADA) {
      throw new BadRequestException('Esta nota já foi lançada na Omie e não pode mais ser editada.');
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.account !== undefined) data.account = dto.account;
    if (dto.fornecedorNome !== undefined) data.fornecedorNome = dto.fornecedorNome;
    if (dto.fornecedorDoc !== undefined) data.fornecedorDoc = dto.fornecedorDoc;
    if (dto.numeroDocumento !== undefined) data.numeroDocumento = dto.numeroDocumento;
    if (dto.valor !== undefined) data.valor = new Prisma.Decimal(dto.valor);
    if (dto.dataEmissao !== undefined) data.dataEmissao = this.toDate(dto.dataEmissao);
    if (dto.dataVencimento !== undefined) data.dataVencimento = this.toDate(dto.dataVencimento);
    if (dto.categoriaCodigo !== undefined) data.categoriaCodigo = dto.categoriaCodigo;
    if (dto.categoriaDescricao !== undefined) data.categoriaDescricao = dto.categoriaDescricao;
    if (dto.contaCorrenteId !== undefined) data.contaCorrenteId = dto.contaCorrenteId;
    if (dto.contaCorrenteDescricao !== undefined) data.contaCorrenteDescricao = dto.contaCorrenteDescricao;
    if (dto.observacao !== undefined) data.observacao = dto.observacao;

    const updated = await this.prisma.invoice.update({ where: { id }, data });
    await this.prisma.activityLog.create({
      data: { userId: actorId, action: 'INVOICE_UPDATE', entity: 'Invoice', entityId: id },
    });
    return this.map(updated);
  }

  async remove(id: string, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (invoice.status === InvoiceStatus.LANCADA) {
      throw new BadRequestException('Não é possível excluir uma nota já lançada na Omie.');
    }

    await this.drive.delete({ driveFileId: invoice.driveFileId, localPath: invoice.localPath });
    await this.prisma.invoice.delete({ where: { id } });
    await this.prisma.activityLog.create({
      data: {
        userId: actorId,
        action: 'INVOICE_DELETE',
        entity: 'Invoice',
        entityId: id,
        details: { fileName: invoice.fileName },
      },
    });
    return { ok: true };
  }

  /** Lança a nota como Conta a Pagar na Omie. Apenas o criador chama isto. */
  async launch(id: string, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (invoice.status === InvoiceStatus.LANCADA) {
      throw new BadRequestException('Esta nota já foi lançada na Omie.');
    }

    const missing = this.validateForLaunch(invoice);
    if (missing.length) {
      throw new BadRequestException(`Preencha os campos antes de lançar: ${missing.join(', ')}.`);
    }

    try {
      const result = await this.omie.incluirContaPagar(invoice.account, {
        fornecedorDoc: invoice.fornecedorDoc!,
        fornecedorNome: invoice.fornecedorNome || '',
        numeroDocumento: invoice.numeroDocumento,
        valor: Number(invoice.valor),
        dataEmissao: invoice.dataEmissao ? this.fromDate(invoice.dataEmissao) : null,
        dataVencimento: this.fromDate(invoice.dataVencimento!),
        categoriaCodigo: invoice.categoriaCodigo!,
        contaCorrenteId: invoice.contaCorrenteId!,
        observacao: invoice.observacao,
        integrationCode: `KNF-${invoice.id}`,
      });

      const updated = await this.prisma.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.LANCADA,
          omieCodigoLancamento: result.codigoLancamento,
          omieIntegrationCode: result.integrationCode,
          omieErro: null,
          launchedById: actorId,
          launchedAt: new Date(),
        },
      });

      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'INVOICE_LAUNCH',
          entity: 'Invoice',
          entityId: id,
          details: { account: invoice.account, omieCodigo: result.codigoLancamento },
        },
      });

      return this.map(updated);
    } catch (e: any) {
      const msg = e?.message || 'Erro ao lançar na Omie';
      await this.prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.ERRO, omieErro: msg },
      });
      throw e;
    }
  }

  private validateForLaunch(invoice: Invoice): string[] {
    const missing: string[] = [];
    if (!invoice.fornecedorDoc) missing.push('CNPJ/CPF do fornecedor');
    if (!invoice.valor || Number(invoice.valor) <= 0) missing.push('valor');
    if (!invoice.dataVencimento) missing.push('data de vencimento');
    if (!invoice.categoriaCodigo) missing.push('categoria');
    if (!invoice.contaCorrenteId) missing.push('conta corrente');
    return missing;
  }

  // ---------- helpers ----------
  private toDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  private fromDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private map(invoice: any) {
    return {
      id: invoice.id,
      competenceDate: this.fromDate(invoice.competenceDate),
      account: invoice.account,
      kind: invoice.kind,
      status: invoice.status,
      fileName: invoice.fileName,
      mimeType: invoice.mimeType,
      fileSize: invoice.fileSize,
      driveLink: invoice.driveLink,
      hasLocalFile: !!invoice.localPath,
      fornecedorNome: invoice.fornecedorNome,
      fornecedorDoc: invoice.fornecedorDoc,
      numeroDocumento: invoice.numeroDocumento,
      valor: invoice.valor != null ? Number(invoice.valor) : null,
      dataEmissao: invoice.dataEmissao ? this.fromDate(invoice.dataEmissao) : null,
      dataVencimento: invoice.dataVencimento ? this.fromDate(invoice.dataVencimento) : null,
      categoriaCodigo: invoice.categoriaCodigo,
      categoriaDescricao: invoice.categoriaDescricao,
      contaCorrenteId: invoice.contaCorrenteId,
      contaCorrenteDescricao: invoice.contaCorrenteDescricao,
      observacao: invoice.observacao,
      omieCodigoLancamento: invoice.omieCodigoLancamento,
      omieErro: invoice.omieErro,
      launchedAt: invoice.launchedAt,
      uploadedByName: invoice.uploadedBy?.name ?? null,
      launchedByName: invoice.launchedBy?.name ?? null,
      createdAt: invoice.createdAt,
    };
  }
}

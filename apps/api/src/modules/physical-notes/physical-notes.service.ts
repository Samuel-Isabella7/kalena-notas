import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveService } from '../storage/drive.service';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class PhysicalNotesService {
  constructor(
    private prisma: PrismaService,
    private drive: DriveService,
  ) {}

  async upload(file: UploadedFile, nome: string, observacao: string | undefined, uploaderId: string) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!nome?.trim()) throw new BadRequestException('Informe o nome da nota.');

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    const stored = await this.drive.uploadToSegments(
      file.buffer,
      file.originalname,
      file.mimetype,
      ['Notas Físicas', String(year), month],
    );

    const note = await this.prisma.physicalNote.create({
      data: {
        nome: nome.trim(),
        observacao: observacao?.trim() || null,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        driveFileId: stored.driveFileId,
        driveLink: stored.driveLink,
        localPath: stored.localPath,
        uploadedById: uploaderId,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId: uploaderId,
        action: 'PHYSICAL_NOTE_UPLOAD',
        entity: 'PhysicalNote',
        entityId: note.id,
        details: { nome: note.nome, fileName: note.fileName },
      },
    });

    return this.map(note);
  }

  /** Lista as notas físicas, opcionalmente filtrando por mês (YYYY-MM) do anexo. */
  async list(mes?: string) {
    const where: any = {};
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [y, m] = mes.split('-').map(Number);
      where.createdAt = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lt: new Date(Date.UTC(y, m, 1)),
      };
    }
    const rows = await this.prisma.physicalNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } } },
      take: 2000,
    });
    return rows.map((r) => this.map(r));
  }

  /** Total + meses disponíveis (do anexo) para o seletor do frontend. */
  async meta() {
    const total = await this.prisma.physicalNote.count();
    const mesesRaw = await this.prisma.$queryRaw<{ mes: string }[]>`
      SELECT DISTINCT to_char(created_at, 'YYYY-MM') AS mes
      FROM physical_notes
      ORDER BY mes DESC`;
    return { total, meses: mesesRaw.map((r) => r.mes) };
  }

  async fileRef(id: string) {
    const note = await this.prisma.physicalNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota física não encontrada.');
    return note;
  }

  async remove(id: string, actorId: string, actorRole: Role) {
    const note = await this.prisma.physicalNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota física não encontrada.');
    // Quem anexou ou o criador podem excluir.
    if (note.uploadedById !== actorId && actorRole !== Role.CRIADOR) {
      throw new ForbiddenException('Apenas quem anexou ou o criador podem excluir esta nota.');
    }

    await this.drive.delete({ driveFileId: note.driveFileId, localPath: note.localPath });
    await this.prisma.physicalNote.delete({ where: { id } });
    await this.prisma.activityLog.create({
      data: {
        userId: actorId,
        action: 'PHYSICAL_NOTE_DELETE',
        entity: 'PhysicalNote',
        entityId: id,
        details: { nome: note.nome, fileName: note.fileName },
      },
    });
    return { ok: true };
  }

  private map(note: any) {
    return {
      id: note.id,
      nome: note.nome,
      observacao: note.observacao,
      fileName: note.fileName,
      mimeType: note.mimeType,
      fileSize: note.fileSize,
      driveLink: note.driveLink,
      hasFile: !!(note.driveFileId || note.driveLink || note.localPath),
      uploadedById: note.uploadedById,
      uploadedByName: note.uploadedBy?.name ?? null,
      createdAt: note.createdAt,
    };
  }
}

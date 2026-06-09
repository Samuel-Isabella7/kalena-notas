import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        inviteToken: true,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    // Não expõe o token; apenas indica se o convite ainda está pendente.
    return users.map(({ inviteToken, ...u }) => ({ ...u, pending: !u.active && !!inviteToken }));
  }

  private inviteLink(token: string): string {
    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:3001').replace(/\/$/, '');
    return `${webUrl}/criar-cadastro?token=${token}`;
  }

  /** Convida um novo membro por e-mail. Ele define nome e senha pelo link recebido. */
  async create(dto: CreateUserDto, actorId: string) {
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('Já existe um usuário com este e-mail');

    if (dto.role === Role.CRIADOR) {
      throw new BadRequestException('Não é possível criar outro criador. Escolha um perfil de administrador.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const placeholderName = email.split('@')[0];

    const user = await this.prisma.user.create({
      data: {
        name: placeholderName,
        email,
        passwordHash: '', // definido quando a pessoa aceita o convite
        role: dto.role ?? Role.ADMIN,
        active: false,
        inviteToken: token,
        inviteTokenExp: exp,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });

    const link = this.inviteLink(token);
    const sent = await this.mail.sendInvite(email, link);

    await this.prisma.activityLog.create({
      data: { userId: actorId, action: 'USER_INVITE', entity: 'User', entityId: user.id, details: { email } },
    });

    return { user: { ...user, pending: true }, sent, inviteLink: sent ? undefined : link };
  }

  /** Reenvia o convite (gera um novo link) para um membro ainda pendente. */
  async resendInvite(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.active) throw new BadRequestException('Este membro já concluiu o cadastro.');

    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id },
      data: { inviteToken: token, inviteTokenExp: exp },
    });

    const link = this.inviteLink(token);
    const sent = await this.mail.sendInvite(user.email, link);
    await this.prisma.activityLog.create({
      data: { userId: actorId, action: 'USER_INVITE_RESEND', entity: 'User', entityId: id },
    });
    return { sent, inviteLink: sent ? undefined : link };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (dto.role === Role.CRIADOR) {
      throw new BadRequestException('Não é possível promover ninguém a criador.');
    }

    if (user.role === Role.CRIADOR) {
      if (dto.role) {
        throw new BadRequestException('Não é possível alterar o papel do criador');
      }
      if (dto.active === false) {
        throw new BadRequestException('Não é possível desativar o criador');
      }
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
    });

    await this.prisma.activityLog.create({
      data: { userId: actorId, action: 'USER_UPDATE', entity: 'User', entityId: id },
    });

    return updated;
  }

  async remove(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === Role.CRIADOR) {
      throw new BadRequestException('Não é possível excluir o criador');
    }
    if (id === actorId) {
      throw new BadRequestException('Você não pode excluir a si mesmo');
    }

    await this.prisma.user.delete({ where: { id } });
    await this.prisma.activityLog.create({
      data: { userId: actorId, action: 'USER_DELETE', entity: 'User', entityId: id, details: { email: user.email } },
    });

    return { ok: true };
  }
}

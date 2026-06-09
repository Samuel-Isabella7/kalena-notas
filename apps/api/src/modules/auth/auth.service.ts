import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client | null = null;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  private get googleClientId(): string {
    return this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID', '').trim();
  }

  /** Diz ao frontend quais formas de login estão habilitadas. */
  providers() {
    return { google: !!this.googleClientId };
  }

  private issueToken(user: { id: string; email: string; role: string; name: string }) {
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.activityLog.create({ data: { userId: user.id, action: 'LOGIN' } });

    return this.issueToken(user);
  }

  /** Login via Google Identity Services. Só permite e-mails já cadastrados e ativos. */
  async loginWithGoogle(credential: string) {
    const clientId = this.googleClientId;
    if (!clientId) {
      throw new BadRequestException('Login com Google não está habilitado.');
    }

    if (!this.googleClient) this.googleClient = new OAuth2Client(clientId);

    let email: string | undefined;
    let emailVerified: boolean | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken: credential, audience: clientId });
      const payload = ticket.getPayload();
      email = payload?.email?.toLowerCase();
      emailVerified = payload?.email_verified;
    } catch (e: any) {
      this.logger.warn(`Falha ao verificar token Google: ${e.message}`);
      throw new UnauthorizedException('Não foi possível validar o login com Google.');
    }

    if (!email || !emailVerified) {
      throw new UnauthorizedException('Conta Google sem e-mail verificado.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      throw new UnauthorizedException(
        'E-mail não autorizado. Peça ao criador para cadastrar você como membro.',
      );
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.activityLog.create({ data: { userId: user.id, action: 'LOGIN_GOOGLE' } });

    return this.issueToken(user);
  }

  /** Gera um token de redefinição e envia o link por e-mail (ou loga, em modo teste). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Resposta sempre genérica para não revelar quais e-mails existem.
    const generic = { ok: true } as { ok: boolean; devLink?: string };

    if (!user || !user.active) {
      return generic;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExp: exp },
    });

    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:3001').replace(/\/$/, '');
    const link = `${webUrl}/redefinir-senha?token=${token}`;

    const sent = await this.mail.sendPasswordReset(user.email, user.name, link);
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: 'PASSWORD_RESET_REQUEST' },
    });

    // Em modo teste (sem SMTP) devolvemos o link para facilitar o uso interno.
    if (!sent) generic.devLink = link;
    return generic;
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExp || user.resetTokenExp.getTime() < Date.now()) {
      throw new BadRequestException('Link de redefinição inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExp: null },
    });
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: 'PASSWORD_RESET' },
    });

    return { ok: true };
  }

  /** Informações públicas de um convite (para preencher a tela de criação de cadastro). */
  async inviteInfo(token: string) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || !user.inviteTokenExp || user.inviteTokenExp.getTime() < Date.now()) {
      throw new BadRequestException('Convite inválido ou expirado.');
    }
    return { email: user.email };
  }

  /** A pessoa convidada cria o cadastro (nome + senha) e a conta é ativada. */
  async acceptInvite(token: string, name: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || !user.inviteTokenExp || user.inviteTokenExp.getTime() < Date.now()) {
      throw new BadRequestException('Convite inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { name, passwordHash, active: true, inviteToken: null, inviteTokenExp: null },
    });
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: 'INVITE_ACCEPTED' },
    });

    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from = '';

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', '').trim();
    const user = config.get<string>('SMTP_USER', '').trim();
    const pass = config.get<string>('SMTP_PASS', '').trim();
    this.from = config.get<string>('SMTP_FROM', 'Kalena Notas <nao-responda@kalena.com.br>');

    if (host && user && pass) {
      const port = Number(config.get<string>('SMTP_PORT', '587'));
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Envio de e-mail configurado via ${host}.`);
    } else {
      this.logger.warn(
        'SMTP não configurado — e-mails não serão enviados de verdade (o link de redefinição aparece no log).',
      );
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Envia o e-mail de redefinição de senha. Retorna false se SMTP não estiver configurado. */
  async sendPasswordReset(to: string, name: string, link: string): Promise<boolean> {
    const subject = 'Redefinição de senha — Kalena Notas';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#0f172a;">Kalena Notas Fiscais</h2>
        <p>Olá, ${name || ''}.</p>
        <p>Recebemos um pedido para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${link}" style="background:#0f172a; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none;">
            Redefinir senha
          </a>
        </p>
        <p style="font-size:12px; color:#64748b;">
          Se você não solicitou, ignore este e-mail. Este link expira em 1 hora.<br/>
          Caso o botão não funcione, copie e cole no navegador: <br/>${link}
        </p>
      </div>`;

    if (!this.transporter) {
      this.logger.warn(`[MODO TESTE] Link de redefinição para ${to}: ${link}`);
      return false;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, html });
    this.logger.log(`E-mail de redefinição enviado para ${to}.`);
    return true;
  }

  /** Envia o convite para um novo membro criar o cadastro. Retorna false se SMTP não estiver configurado. */
  async sendInvite(to: string, link: string): Promise<boolean> {
    const subject = 'Convite para o Kalena Notas';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#0f172a;">Kalena Notas Fiscais</h2>
        <p>Você foi convidado a acessar o sistema de notas fiscais da Kalena.</p>
        <p>Clique no botão abaixo para criar seu cadastro (nome e senha):</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${link}" style="background:#0f172a; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none;">
            Criar meu cadastro
          </a>
        </p>
        <p style="font-size:12px; color:#64748b;">
          Este convite expira em 7 dias.<br/>
          Caso o botão não funcione, copie e cole no navegador: <br/>${link}
        </p>
      </div>`;

    if (!this.transporter) {
      this.logger.warn(`[MODO TESTE] Link de convite para ${to}: ${link}`);
      return false;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, html });
    this.logger.log(`Convite enviado para ${to}.`);
    return true;
  }
}

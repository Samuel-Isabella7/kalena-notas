import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Garante que exista o usuário CRIADOR no primeiro boot.
 * Útil em hospedagem gratuita, onde não há acesso a terminal para rodar o seed.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async onApplicationBootstrap() {
    try {
      const total = await this.prisma.user.count();
      if (total > 0) return;

      const nome = this.config.get<string>('CRIADOR_NOME', 'Criador');
      const email = (this.config.get<string>('CRIADOR_EMAIL', 'criador@kalena.com.br')).toLowerCase();
      const senha = this.config.get<string>('CRIADOR_SENHA', 'criador123');
      const passwordHash = await bcrypt.hash(senha, 10);

      await this.prisma.user.create({
        data: { name: nome, email, passwordHash, role: Role.CRIADOR },
      });
      this.logger.log(`Criador inicial criado: ${email}`);
    } catch (e: any) {
      this.logger.warn(`Bootstrap do criador ignorado: ${e.message}`);
    }
  }
}

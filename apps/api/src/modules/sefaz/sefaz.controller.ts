import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { SefazService } from './sefaz.service';
import { Roles } from '../../common/decorators/roles.decorator';

// Todos os perfis podem visualizar e sincronizar as notas Recebidas (SEFAZ).
const ALL_ROLES: Role[] = [
  Role.CRIADOR,
  Role.ADMIN,
  Role.ADMIN_SERVICO,
  Role.ADMIN_ICMS,
  Role.BALANCO,
];

@ApiTags('sefaz')
@ApiBearerAuth()
@Controller('sefaz')
@Roles(...ALL_ROLES)
export class SefazController {
  constructor(private readonly sefaz: SefazService) {}

  @Get('status')
  status() {
    return this.sefaz.status();
  }

  @Post('sync')
  sync(@Query('reset') reset?: string) {
    return this.sefaz.sync(reset === 'true' || reset === '1');
  }

  @Get('empresas')
  empresas() {
    return this.sefaz.empresasFiltro();
  }

  @Get('received')
  received(@Query('empresa') empresa?: string) {
    return this.sefaz.listReceived({ empresaCnpj: empresa });
  }

  @Post('manifestar-todas')
  manifestarTodas() {
    return this.sefaz.manifestarTodas();
  }

  @Post('received/:id/manifestar')
  manifestar(@Param('id') id: string) {
    return this.sefaz.manifestarNota(id);
  }

  @Get('received/:id/xml')
  async xml(@Param('id') id: string, @Res() res: Response) {
    const { filename, content } = await this.sefaz.getXml(id);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get('received/:id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { filename, content } = await this.sefaz.getPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}

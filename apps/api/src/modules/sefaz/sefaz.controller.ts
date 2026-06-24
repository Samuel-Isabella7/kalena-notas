import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { SefazService } from './sefaz.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

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

  // Diagnóstico temporário (contagens + cursores), público para depuração.
  @Public()
  @Get('diag')
  diag() {
    return this.sefaz.diag();
  }

  @Post('sync')
  sync(@Query('reset') reset?: string) {
    return this.sefaz.sync(reset === 'true' || reset === '1');
  }

  @Get('sync/progress')
  syncProgress() {
    return this.sefaz.progress();
  }

  @Get('empresas')
  empresas() {
    return this.sefaz.empresasFiltro();
  }

  @Get('received/meta')
  receivedMeta() {
    return this.sefaz.receivedMeta();
  }

  @Get('received')
  received(
    @Query('empresa') empresa?: string,
    @Query('uf') uf?: string,
    @Query('tipo') tipo?: string,
    @Query('mes') mes?: string,
    @Query('emitente') emitente?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.sefaz.listReceived({
      empresaCnpj: empresa,
      uf,
      tipo,
      mes,
      emitente,
      q,
      status,
      sort,
      dir,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('manifestar-todas')
  manifestarTodas() {
    return this.sefaz.manifestarTodas();
  }

  @Post('manifestar-lote')
  manifestarLote(@Body('ids') ids: string[]) {
    return this.sefaz.manifestarLote(ids);
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

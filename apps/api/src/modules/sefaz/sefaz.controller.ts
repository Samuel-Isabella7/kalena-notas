import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { SefazService } from './sefaz.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { allowedKinds } from '../../common/utils/role-scope';

@ApiTags('sefaz')
@ApiBearerAuth()
@Controller('sefaz')
export class SefazController {
  constructor(private readonly sefaz: SefazService) {}

  @Get('status')
  @Roles(Role.CRIADOR, Role.ADMIN, Role.ADMIN_ICMS)
  status() {
    return this.sefaz.status();
  }

  @Post('sync')
  @Roles(Role.CRIADOR, Role.ADMIN, Role.ADMIN_ICMS)
  sync(@Query('reset') reset?: string) {
    return this.sefaz.sync(reset === 'true' || reset === '1');
  }

  @Get('empresas')
  empresas(@CurrentUser() user: AuthUser) {
    return this.sefaz.empresasFiltro(user.role);
  }

  @Get('received')
  received(@CurrentUser() user: AuthUser, @Query('empresa') empresa?: string) {
    return this.sefaz.listReceived({
      kinds: allowedKinds(user.role),
      empresaCnpj: empresa,
    });
  }

  @Get('received/:id/xml')
  async xml(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { filename, content } = await this.sefaz.getXml(id, user.role);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get('received/:id/danfe')
  async danfe(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { filename, content } = await this.sefaz.getDanfe(id, user.role);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(content);
  }
}

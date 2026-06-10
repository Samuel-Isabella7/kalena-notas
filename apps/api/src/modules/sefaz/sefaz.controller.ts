import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
  sync() {
    return this.sefaz.sync();
  }

  @Get('received')
  received(@CurrentUser() user: AuthUser, @Query('empresa') empresa?: string) {
    return this.sefaz.listReceived({
      kinds: allowedKinds(user.role),
      empresaCnpj: empresa,
    });
  }
}

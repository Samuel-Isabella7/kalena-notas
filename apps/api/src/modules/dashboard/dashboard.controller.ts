import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // Visível a todos os perfis autenticados. ?mes=YYYY-MM filtra os cards "(mês)".
  @Get()
  summary(@Query('mes') mes?: string) {
    return this.dashboard.summary(mes);
  }
}

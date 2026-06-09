import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('years')
  years() {
    return this.calendar.availableYears();
  }

  @Get('overview')
  overview(@Query('year') year: string, @CurrentUser() user: AuthUser) {
    const y = Number(year);
    if (!y || y < 2000 || y > 2100) throw new BadRequestException('Ano inválido.');
    return this.calendar.overview(y, user.role);
  }

  @Get('month')
  month(@Query('year') year: string, @Query('month') month: string, @CurrentUser() user: AuthUser) {
    const y = Number(year);
    const m = Number(month);
    if (!y || y < 2000 || y > 2100) throw new BadRequestException('Ano inválido.');
    if (!m || m < 1 || m > 12) throw new BadRequestException('Mês inválido.');
    return this.calendar.month(y, m, user.role);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OmieService } from '../omie/omie.service';
import { DriveService } from '../storage/drive.service';
import { holidaysForYear } from '../../common/utils/business-days';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly omie: OmieService,
    private readonly drive: DriveService,
  ) {}

  @Get('status')
  status() {
    return {
      omie: { accounts: this.omie.configuredAccounts() },
      drive: this.drive.status(),
    };
  }

  @Get('holidays')
  holidays(@Query('year') year: string) {
    const y = Number(year) || new Date().getFullYear();
    return holidaysForYear(y);
  }
}

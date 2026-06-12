import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { OmieService } from '../omie/omie.service';
import { DriveService } from '../storage/drive.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly omie: OmieService,
    private readonly drive: DriveService,
  ) {}

  @Get('status')
  @Roles(Role.CRIADOR)
  status() {
    return {
      omie: { accounts: this.omie.configuredAccounts() },
      drive: this.drive.status(),
    };
  }
}

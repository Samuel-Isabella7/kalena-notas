import { Module } from '@nestjs/common';
import { SefazService } from './sefaz.service';
import { SefazController } from './sefaz.controller';
import { DanfeService } from './danfe.service';

@Module({
  providers: [SefazService, DanfeService],
  controllers: [SefazController],
})
export class SefazModule {}

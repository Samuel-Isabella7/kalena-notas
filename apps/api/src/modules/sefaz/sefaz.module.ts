import { Module } from '@nestjs/common';
import { SefazService } from './sefaz.service';
import { SefazController } from './sefaz.controller';

@Module({
  providers: [SefazService],
  controllers: [SefazController],
})
export class SefazModule {}

import { Global, Module } from '@nestjs/common';
import { OmieService } from './omie.service';
import { OmieController } from './omie.controller';

@Global()
@Module({
  providers: [OmieService],
  controllers: [OmieController],
  exports: [OmieService],
})
export class OmieModule {}

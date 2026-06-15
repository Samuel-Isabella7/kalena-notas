import { Module } from '@nestjs/common';
import { PhysicalNotesService } from './physical-notes.service';
import { PhysicalNotesController } from './physical-notes.controller';

@Module({
  providers: [PhysicalNotesService],
  controllers: [PhysicalNotesController],
})
export class PhysicalNotesModule {}

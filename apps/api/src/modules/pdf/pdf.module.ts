import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { AiExtractionService } from './ai-extraction.service';

@Global()
@Module({
  providers: [PdfService, AiExtractionService],
  exports: [PdfService, AiExtractionService],
})
export class PdfModule {}

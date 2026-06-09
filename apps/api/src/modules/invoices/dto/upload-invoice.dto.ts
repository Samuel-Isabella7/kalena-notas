import { IsEnum, IsOptional, Matches } from 'class-validator';
import { InvoiceKind, OmieAccount } from '@prisma/client';

export class UploadInvoiceDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato YYYY-MM-DD' })
  date: string;

  @IsEnum(InvoiceKind, { message: 'Tipo deve ser SERVICO ou ICMS' })
  kind: InvoiceKind;

  @IsOptional()
  @IsEnum(OmieAccount, { message: 'Conta deve ser SP ou RJ' })
  account?: OmieAccount;
}

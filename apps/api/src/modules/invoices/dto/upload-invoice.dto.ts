import { IsEnum, IsIn, IsOptional, Matches } from 'class-validator';
import { InvoiceKind, InvoiceStatus, OmieAccount } from '@prisma/client';

export class UploadInvoiceDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato YYYY-MM-DD' })
  date: string;

  @IsEnum(InvoiceKind, { message: 'Tipo deve ser SERVICO ou ICMS' })
  kind: InvoiceKind;

  @IsOptional()
  @IsEnum(OmieAccount, { message: 'Conta deve ser SP ou RJ' })
  account?: OmieAccount;

  // Situação inicial ao anexar: "Pendente" ou "Lançado Manual".
  @IsOptional()
  @IsIn([InvoiceStatus.PENDENTE, InvoiceStatus.MANUAL], {
    message: 'Situação deve ser PENDENTE ou MANUAL',
  })
  status?: InvoiceStatus;
}

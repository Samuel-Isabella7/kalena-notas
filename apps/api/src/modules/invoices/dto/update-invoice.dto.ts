import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { OmieAccount } from '@prisma/client';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsEnum(OmieAccount)
  account?: OmieAccount;

  @IsOptional()
  @IsString()
  fornecedorNome?: string;

  @IsOptional()
  @IsString()
  fornecedorDoc?: string;

  @IsOptional()
  @IsString()
  numeroDocumento?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor inválido' })
  @Min(0)
  valor?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data de emissão deve ser YYYY-MM-DD' })
  dataEmissao?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data de vencimento deve ser YYYY-MM-DD' })
  dataVencimento?: string;

  @IsOptional()
  @IsString()
  categoriaCodigo?: string;

  @IsOptional()
  @IsString()
  categoriaDescricao?: string;

  @IsOptional()
  @IsString()
  contaCorrenteId?: string;

  @IsOptional()
  @IsString()
  contaCorrenteDescricao?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

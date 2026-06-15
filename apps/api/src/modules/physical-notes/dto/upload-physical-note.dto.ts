import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadPhysicalNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome da nota.' })
  @MaxLength(200)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}

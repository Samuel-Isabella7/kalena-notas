import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Perfil inválido' })
  role?: Role;
}

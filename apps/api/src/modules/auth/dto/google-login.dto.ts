import { IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  credential: string; // ID token (JWT) retornado pelo Google Identity Services
}

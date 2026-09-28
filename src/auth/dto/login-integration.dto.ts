import { IsJWT } from 'class-validator';

export class LoginIntegrationDto {
  @IsJWT()
  token: string;
}

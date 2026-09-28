import { IsString, Length } from 'class-validator';

export class RedeemDto {
  @IsString()
  @Length(43, 43)
  token: string;
}

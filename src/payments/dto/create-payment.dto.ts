import {
  IsNumber,
  IsPositive,
  IsString,
  IsUppercase,
  Length,
} from 'class-validator';

export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @Length(3, 3)
  @IsUppercase()
  currency: string;
}

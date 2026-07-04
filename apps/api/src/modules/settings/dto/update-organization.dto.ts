import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@shopy/shared';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  baseCurrency?: string;
}

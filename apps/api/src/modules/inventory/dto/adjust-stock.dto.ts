import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

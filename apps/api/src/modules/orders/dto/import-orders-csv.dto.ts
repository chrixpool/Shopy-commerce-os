import { IsString, MinLength } from 'class-validator';

export class ImportOrdersCsvDto {
  @IsString()
  @MinLength(1)
  csv: string;
}

import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ConfirmationAction {
  CONFIRMED = 'CONFIRMED',
  UNREACHABLE = 'UNREACHABLE',
  CANCELLED = 'CANCELLED',
  REFUSED = 'REFUSED',
  CALL_LATER = 'CALL_LATER',
}

export class UpdateConfirmationDto {
  @IsEnum(ConfirmationAction)
  action: ConfirmationAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

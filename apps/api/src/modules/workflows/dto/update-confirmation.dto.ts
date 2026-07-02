import { IsEnum } from 'class-validator';

export enum ConfirmationAction {
  CONFIRMED = 'CONFIRMED',
  UNREACHABLE = 'UNREACHABLE',
  CANCELLED = 'CANCELLED',
}

export class UpdateConfirmationDto {
  @IsEnum(ConfirmationAction)
  action: ConfirmationAction;
}

import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { DRAFT_ACTION_STATUSES } from '@shopy/shared';

export class CreateDraftActionDto {
  @IsString()
  actionType!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class UpdateDraftActionStatusDto {
  @IsIn(DRAFT_ACTION_STATUSES)
  status!: string;
}

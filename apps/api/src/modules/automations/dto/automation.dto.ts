import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { INTEGRATION_PROVIDERS } from '@shopy/shared';

export class CreateAutomationDto {
  @IsString()
  name!: string;

  @IsString()
  triggerType!: string;

  @IsString()
  actionType!: string;

  @IsOptional()
  @IsIn(INTEGRATION_PROVIDERS)
  provider?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, unknown>;
}

export class UpdateAutomationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, unknown>;
}

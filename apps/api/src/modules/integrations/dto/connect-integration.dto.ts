import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { INTEGRATION_MODES } from '@shopy/shared';

export class ConnectIntegrationDto {
  @IsOptional()
  @IsString()
  shopDomain?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  apiVersion?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  instagramBusinessAccountId?: string;

  @IsOptional()
  @IsIn(INTEGRATION_MODES)
  mode?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SyncIntegrationDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

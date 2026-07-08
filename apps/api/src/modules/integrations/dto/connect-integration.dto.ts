import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { INTEGRATION_MODES } from '@shopy/shared';

const SHOPIFY_CONNECTION_METHODS = ['CLIENT_CREDENTIALS', 'ADMIN_TOKEN'] as const;

export class ConnectIntegrationDto {
  @IsOptional()
  @IsIn(SHOPIFY_CONNECTION_METHODS)
  connectionMethod?: string;

  @IsOptional()
  @IsString()
  shopDomain?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  adminAccessToken?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

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

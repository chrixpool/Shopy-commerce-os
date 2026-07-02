import { IsEnum } from 'class-validator';
import { FulfillmentStatus } from '@prisma/client';

export class UpdateFulfillmentDto {
  @IsEnum(FulfillmentStatus)
  status: FulfillmentStatus;
}

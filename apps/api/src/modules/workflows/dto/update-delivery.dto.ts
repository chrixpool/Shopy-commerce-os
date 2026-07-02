import { IsEnum } from 'class-validator';
import { DeliveryStatus } from '@prisma/client';

export class UpdateDeliveryDto {
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}

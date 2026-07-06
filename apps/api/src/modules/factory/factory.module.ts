import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { FactoryController } from './factory.controller';
import { FactoryService } from './factory.service';

@Module({
  imports: [PrismaModule],
  controllers: [FactoryController],
  providers: [FactoryService],
})
export class FactoryModule {}

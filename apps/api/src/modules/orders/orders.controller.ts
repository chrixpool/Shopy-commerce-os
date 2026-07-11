import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OrderStatus } from '@prisma/client';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { CreateOrderDto } from './dto/create-order.dto';
import { ImportOrdersCsvDto } from './dto/import-orders-csv.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@UseGuards(InternalAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List organization orders' })
  list(
    @CurrentUser() user: SessionUser,
    @Query('search') search?: string,
    @Query('status') status?: OrderStatus | 'all',
    @Query('source') source?: string,
    @Query('city') city?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.list(user.organizationId, {
      search,
      status,
      source,
      city,
      dateFrom,
      dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Summarize organization orders across the full filtered dataset' })
  summary(
    @CurrentUser() user: SessionUser,
    @Query('search') search?: string,
    @Query('status') status?: OrderStatus | 'all',
    @Query('source') source?: string,
    @Query('city') city?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.summary(user.organizationId, {
      search,
      status,
      source,
      city,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get secondary order timeline data' })
  getTimeline(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.ordersService.getTimeline(user.organizationId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an organization order by ID' })
  getById(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.ordersService.getById(user.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a manual organization order' })
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.organizationId, user.id, dto);
  }

  @Post('import-csv')
  @ApiOperation({ summary: 'Import manual orders from CSV text' })
  importCsv(@CurrentUser() user: SessionUser, @Body() dto: ImportOrdersCsvDto) {
    return this.ordersService.importCsv(user.organizationId, user.id, dto.csv);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update organization order status' })
  updateStatus(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.organizationId, user.id, id, dto.status);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add an internal order note' })
  addNote(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: { note?: string },
  ) {
    return this.ordersService.addNote(user.organizationId, user.id, id, dto.note ?? '');
  }

  @Delete(':id/smoke')
  @ApiOperation({ summary: 'Delete an isolated smoke-test order' })
  deleteSmoke(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.ordersService.deleteSmokeOrder(user.organizationId, id);
  }
}

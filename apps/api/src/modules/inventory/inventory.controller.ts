import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { InventoryService } from './inventory.service';

@UseGuards(InternalAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('products')
  listProducts(@CurrentUser() user: SessionUser) {
    return this.inventoryService.listProducts(user.organizationId);
  }

  @Post('products')
  createProduct(@CurrentUser() user: SessionUser, @Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(user.organizationId, dto);
  }

  @Patch('products/:id/stock')
  adjustStock(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(user.organizationId, id, dto);
  }
}

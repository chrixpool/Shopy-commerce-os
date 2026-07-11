import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { FactoryService } from './factory.service';

@UseGuards(InternalAuthGuard)
@Controller()
export class FactoryController {
  constructor(private readonly factoryService: FactoryService) {}

  @Get('factory')
  factories(@CurrentUser() user: SessionUser) {
    return this.factoryService.listFactories(user.organizationId);
  }

  @Post('factory')
  createFactory(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.factoryService.createFactory(user.organizationId, body);
  }

  @Patch('factory/:id')
  updateFactory(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.factoryService.updateFactory(user.organizationId, id, body);
  }

  @Post('factory/:id/disable')
  disableFactory(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.factoryService.updateFactory(user.organizationId, id, { active: false });
  }

  @Get('cost-components')
  costComponents(@CurrentUser() user: SessionUser) {
    return this.factoryService.listCostComponents(user.organizationId);
  }

  @Post('cost-components')
  createCostComponent(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.factoryService.createCostComponent(user.organizationId, body);
  }

  @Patch('cost-components/:id')
  updateCostComponent(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.factoryService.updateCostComponent(user.organizationId, id, body);
  }

  @Get('product-costs')
  productCosts(@CurrentUser() user: SessionUser) {
    return this.factoryService.listProductCosts(user.organizationId);
  }

  @Get('product-costs/missing')
  missingProductCosts(
    @CurrentUser() user: SessionUser,
    @Query('search') search?: string,
    @Query('source') source?: string,
  ) {
    return this.factoryService.listMissingCostProducts(user.organizationId, { search, source });
  }

  @Post('product-costs')
  upsertProductCost(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.factoryService.upsertProductCost(user.organizationId, body);
  }

  @Post('product-costs/bulk-complete')
  bulkCompleteProductCosts(
    @CurrentUser() user: SessionUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.factoryService.bulkCompleteProductCosts(user.organizationId, body);
  }

  @Patch('product-costs/:id')
  updateProductCost(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.factoryService.updateProductCost(user.organizationId, id, body);
  }

  @Get('expenses')
  expenses(@CurrentUser() user: SessionUser) {
    return this.factoryService.listExpenses(user.organizationId);
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.factoryService.createExpense(user.organizationId, body);
  }

  @Patch('expenses/:id')
  updateExpense(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.factoryService.updateExpense(user.organizationId, id, body);
  }

  @Get('costing/summary')
  costingSummary(
    @CurrentUser() user: SessionUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.factoryService.summary(user.organizationId, { dateFrom, dateTo });
  }

  @Post('costing/recalculate-order/:orderId')
  recalculateOrder(@CurrentUser() user: SessionUser, @Param('orderId') orderId: string) {
    return this.factoryService.recalculateOrder(user.organizationId, orderId);
  }

  @Post('costing/recalculate-all')
  recalculateAll(@CurrentUser() user: SessionUser) {
    return this.factoryService.recalculateAll(user.organizationId);
  }
}

import { Controller, Post, Body, Headers, Param } from '@nestjs/common';
import { ShopifyService, type ShopifyOrderPayload } from './shopify.service';
import { Public } from '../../core/auth/roles.decorator';

@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

  @Public()
  @Post('webhooks/:organizationId/orders/create')
  async handleOrderCreated(
    @Param('organizationId') organizationId: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Body() payload: ShopifyOrderPayload,
  ) {
    return this.shopifyService.processWebhookOrder(organizationId, shopDomain, payload);
  }
}

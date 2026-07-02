import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AdjustStockDto } from './dto/adjust-stock.dto';
import type { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(organizationId: string) {
    return this.prisma.product.findMany({
      where: { organizationId },
      include: {
        inventoryRecords: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    });
  }

  async createProduct(organizationId: string, dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        organizationId,
        externalId: `manual-${Date.now()}`,
        name: dto.name,
        sku: dto.sku,
        price: dto.price,
        cost: dto.cost,
        stock: dto.stock ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        inventoryRecords:
          dto.stock && dto.stock !== 0
            ? {
                create: {
                  type: 'IN',
                  quantity: dto.stock,
                  reason: 'Initial stock',
                },
              }
            : undefined,
      },
      include: { inventoryRecords: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });

    return product;
  }

  async adjustStock(organizationId: string, id: string, dto: AdjustStockDto) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryRecord.create({
        data: {
          productId: id,
          type: dto.quantity >= 0 ? 'IN' : 'OUT',
          quantity: dto.quantity,
          reason: dto.reason ?? 'Manual adjustment',
        },
      });

      return tx.product.update({
        where: { id },
        data: { stock: { increment: dto.quantity } },
        include: { inventoryRecords: { orderBy: { createdAt: 'desc' }, take: 5 } },
      });
    });
  }
}

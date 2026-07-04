import { z } from 'zod';
import { PlatformCurrencySchema } from './currency';

// ─── AUTH SCHEMAS ───────────────────────────────────────────────────────────

export const SignInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const SignUpSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ─── INVITATION SCHEMAS ─────────────────────────────────────────────────────

export const InviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'CONFIRMER', 'PACKER', 'DELIVERER', 'CAMPAIGN_MANAGER', 'VIEWER']),
});

// ─── ORDER SCHEMAS ──────────────────────────────────────────────────────────

export const CreateOrderSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  customerPhone: z.string().min(1, 'Customer phone is required'),
  customerPhone2: z.string().optional(),
  shippingAddress: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().default('MA'),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().optional(),
        name: z.string().min(1),
        sku: z.string().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().positive(),
      }),
    )
    .min(1, 'At least one item is required'),
  notes: z.string().optional(),
  source: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

export const OrganizationSettingsSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  baseCurrency: PlatformCurrencySchema.optional(),
});

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type SignInInput = z.infer<typeof SignInSchema>;
export type SignUpInput = z.infer<typeof SignUpSchema>;
export type InviteInput = z.infer<typeof InviteSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type OrganizationSettingsInput = z.infer<typeof OrganizationSettingsSchema>;

import { z } from 'zod';

export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'TND',
  'MAD',
  'DZD',
  'CAD',
  'AED',
  'SAR',
] as const;

export type PlatformCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const PlatformCurrencySchema = z.enum(SUPPORTED_CURRENCIES);

export function normalizeCurrencyCode(input: string | null | undefined): PlatformCurrencyCode {
  const value = String(input ?? 'USD')
    .trim()
    .toUpperCase();
  return PlatformCurrencySchema.safeParse(value).success ? (value as PlatformCurrencyCode) : 'USD';
}

export function formatMoney(
  amount: string | number,
  currency: string | null | undefined,
  locale = 'en',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizeCurrencyCode(currency),
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

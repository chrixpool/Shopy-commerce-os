import { formatMoney, normalizeCurrencyCode, SUPPORTED_CURRENCIES } from '@shopy/shared';

export { formatMoney, normalizeCurrencyCode, SUPPORTED_CURRENCIES };

export interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
}

import { PaymentVoucherItem } from '../types';

export const PAYMENT_VOUCHER_VAT_RATE = 0.11;

export const getPaymentVoucherPphRate = (item: Pick<PaymentVoucherItem, 'pphRate' | 'pph23Applied'>): number =>
  item.pphRate ?? (item.pph23Applied ? 0.02 : 0);

export const getPaymentVoucherPphLabel = (rate: number): string => {
  if (rate === 0.02) return 'PPh 2%';
  if (rate === 0.025) return 'PPh 2,5%';
  if (rate === 0.1) return 'PPh 10%';
  return 'Tidak ada';
};

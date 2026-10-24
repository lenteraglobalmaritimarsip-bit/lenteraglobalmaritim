import { PaymentVoucher, PaymentVoucherPaymentRecord } from '../types';

export interface PaymentVoucherPaymentEvent extends PaymentVoucher {
  paymentEventKey: string;
}

const currentPaymentRecord = (voucher: PaymentVoucher): PaymentVoucherPaymentRecord | null => {
  if (voucher.status !== 'PAID' || !voucher.paidAt) return null;
  return {
    voucherNumber: voucher.voucherNumber || '',
    paidBy: voucher.paidBy || '',
    paidAt: voucher.paidAt,
    paidFromBankAccountId: voucher.paidFromBankAccountId,
    bankName: voucher.bankName,
    accountNumber: voucher.accountNumber,
    paymentSurcharge: voucher.paymentSurcharge,
    paymentOtherExpenses: voucher.paymentOtherExpenses,
    paymentDescription: voucher.paymentDescription,
    paymentTotalAmount: voucher.paymentTotalAmount,
    paymentProofDataUrl: voucher.paymentProofDataUrl,
  };
};

export const getPaymentVoucherPaymentEvents = (voucher: PaymentVoucher): PaymentVoucherPaymentEvent[] => {
  const history = (voucher.paymentHistory || []).map((payment, index) => ({
      ...voucher,
      ...payment,
      id: `${voucher.id}:payment:${index}`,
      status: 'PAID' as const,
      paymentEventKey: `${voucher.id}:payment:${index}`,
    }));
  const currentPayment = currentPaymentRecord(voucher);
  if (!currentPayment) return history;
  return [
    ...history,
    {
      ...voucher,
      ...currentPayment,
      paymentEventKey: `${voucher.id}:payment:current`,
    },
  ];
};

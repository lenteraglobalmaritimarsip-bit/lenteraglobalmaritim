import { Currency, JobCall } from '../types';

export interface PrincipalReceiptSummary {
  advanceReceived: number;
  totalReceived: number;
  pendingRefund: number;
}

const roundCurrency = (amount: number, currency: Currency) => currency === 'IDR'
  ? Math.round(amount)
  : Math.round((amount + Number.EPSILON) * 100) / 100;

const convertCurrency = (amount: number, from: Currency, to: Currency, exchangeRate: number) => {
  if (from === to) return amount;
  return from === 'USD' ? amount * exchangeRate : amount / exchangeRate;
};

const getInvoiceCurrency = (job: JobCall): Currency =>
  job.fda?.currency || job.quotation?.epda?.currency || job.currency || 'IDR';

const getExchangeRate = (job: JobCall) => Number(
  job.fda?.exchangeRateUSDToIDR
  || job.quotation?.epda?.exchangeRateUSDToIDR
  || job.exchangeRateUSDToIDR
  || 15800,
);

export const convertPrincipalReceiptAmount = (
  job: JobCall,
  amount: number,
  from: Currency,
  to: Currency,
  exchangeRateUSDToIDR?: number,
) => convertCurrency(amount, from, to, Number(exchangeRateUSDToIDR || getExchangeRate(job)));

export const getPrincipalReceiptSummary = (job: JobCall, currency = getInvoiceCurrency(job)): PrincipalReceiptSummary => {
  const receipts = job.principalReceipts || [];
  const amountInCurrency = (
    receipt: NonNullable<JobCall['principalReceipts']>[number],
    amount: number,
    exchangeRate?: number,
  ) =>
    convertPrincipalReceiptAmount(
      job,
      amount,
      receipt.currency || job.currency || currency,
      currency,
      exchangeRate || receipt.exchangeRateUSDToIDR,
    );
  const netReceiptInCurrency = (receipt: NonNullable<JobCall['principalReceipts']>[number]) =>
    amountInCurrency(receipt, Number(receipt.amount || 0))
    - (receipt.refundStatus === 'PAID'
      ? amountInCurrency(receipt, Number(receipt.refundAmount || 0), receipt.refundExchangeRateUSDToIDR)
      : 0);

  return {
    advanceReceived: roundCurrency(receipts
      .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT' && receipt.invoiceType !== 'FPDA')
      .reduce((total, receipt) => total + netReceiptInCurrency(receipt), 0), currency),
    totalReceived: roundCurrency(receipts.reduce((total, receipt) => total + netReceiptInCurrency(receipt), 0), currency),
    pendingRefund: roundCurrency(receipts
      .filter((receipt) => receipt.refundStatus === 'PENDING')
      .reduce((total, receipt) => total + amountInCurrency(receipt, Number(receipt.refundAmount || 0), receipt.refundExchangeRateUSDToIDR), 0), currency),
  };
};

export const syncPrincipalInvoiceSettlement = (job: JobCall): JobCall => {
  const currency = getInvoiceCurrency(job);
  const exchangeRate = getExchangeRate(job);
  const principalInvoice = job.principalInvoice || {
    invoiceNo: '',
    invoiceDate: '',
    dueDate: '',
    totalAmountUSD: 0,
    totalAmountIDR: 0,
    advanceDeductedUSD: 0,
    advanceDeductedIDR: 0,
    balanceDueUSD: 0,
    balanceDueIDR: 0,
    status: 'DRAFT' as const,
    pdfGenerated: false,
  };
  const savedInvoiceAmount = Number(currency === 'USD'
    ? principalInvoice.totalAmountUSD
    : principalInvoice.totalAmountIDR) || 0;
  const fallbackAmount = Number(job.fda?.finalBilledToPrincipal ?? job.quotation?.epda?.totalAmount ?? 0);
  const fallbackCurrency = job.fda?.currency || job.quotation?.epda?.currency || currency;
  const invoiceAmount = roundCurrency(savedInvoiceAmount > 0
    ? savedInvoiceAmount
    : convertCurrency(fallbackAmount, fallbackCurrency, currency, exchangeRate), currency);
  const { advanceReceived, totalReceived, pendingRefund } = getPrincipalReceiptSummary(job, currency);
  const advanceUSD = roundCurrency(convertCurrency(advanceReceived, currency, 'USD', exchangeRate), 'USD');
  const advanceIDR = roundCurrency(convertCurrency(advanceReceived, currency, 'IDR', exchangeRate), 'IDR');
  const invoiceUSD = roundCurrency(convertCurrency(invoiceAmount, currency, 'USD', exchangeRate), 'USD');
  const invoiceIDR = roundCurrency(convertCurrency(invoiceAmount, currency, 'IDR', exchangeRate), 'IDR');
  const receivedUSD = roundCurrency(convertCurrency(totalReceived, currency, 'USD', exchangeRate), 'USD');
  const receivedIDR = roundCurrency(convertCurrency(totalReceived, currency, 'IDR', exchangeRate), 'IDR');
  const balanceDueUSD = roundCurrency(Math.max(0, invoiceUSD - receivedUSD), 'USD');
  const balanceDueIDR = roundCurrency(Math.max(0, invoiceIDR - receivedIDR), 'IDR');
  const invoiceStatus = principalInvoice.status === 'SETTLED'
    && (balanceDueUSD > 0 || balanceDueIDR > 0 || pendingRefund > 0)
    ? 'ISSUED'
    : principalInvoice.status;
  if (principalInvoice.advanceDeductedUSD === advanceUSD
    && principalInvoice.advanceDeductedIDR === advanceIDR
    && principalInvoice.balanceDueUSD === balanceDueUSD
    && principalInvoice.balanceDueIDR === balanceDueIDR
    && principalInvoice.status === invoiceStatus) return job;

  return {
    ...job,
    principalInvoice: {
      ...principalInvoice,
      advanceDeductedUSD: advanceUSD,
      advanceDeductedIDR: advanceIDR,
      balanceDueUSD,
      balanceDueIDR,
      status: invoiceStatus,
    },
  };
};
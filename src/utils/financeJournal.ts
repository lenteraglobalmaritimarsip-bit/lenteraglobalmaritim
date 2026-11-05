import { ChartOfAccount, FinanceJournalLine, PaymentVoucher } from '../types';

export interface FinanceJournalTotals {
  debit: number;
  credit: number;
  difference: number;
  issues: string[];
}

export const createFinanceJournalLine = (
  overrides: Partial<FinanceJournalLine> = {},
): FinanceJournalLine => ({
  id: crypto.randomUUID(),
  coaId: '',
  memo: '',
  direction: 'DEBIT',
  amount: 0,
  ...overrides,
});

export const getFinanceJournalTotals = (
  lines: FinanceJournalLine[],
  accounts: ChartOfAccount[],
): FinanceJournalTotals => {
  const activeAccountIds = new Set(accounts.filter((account) => account.isActive).map((account) => account.id));
  const issues: string[] = [];
  const lineIds = new Set<string>();
  let debit = 0;
  let credit = 0;

  if (lines.length < 2) issues.push('Jurnal harus memiliki minimal dua baris.');
  lines.forEach((line, index) => {
    const rawAmount = Number(line.amount);
    const amount = Number.isFinite(rawAmount) ? Math.round((rawAmount + Number.EPSILON) * 100) / 100 : 0;
    if (!line.id || lineIds.has(line.id)) issues.push(`Baris ${index + 1}: ID baris jurnal tidak valid atau duplikat.`);
    lineIds.add(line.id);
    if (!line.coaId || !activeAccountIds.has(line.coaId)) issues.push(`Baris ${index + 1}: pilih akun COA aktif.`);
    if (amount <= 0) issues.push(`Baris ${index + 1}: jumlah minimal Rp 0,01.`);
    if (line.direction === 'DEBIT') debit += amount;
    else credit += amount;
  });
  debit = Math.round((debit + Number.EPSILON) * 100) / 100;
  credit = Math.round((credit + Number.EPSILON) * 100) / 100;
  const difference = Math.round((debit - credit + Number.EPSILON) * 100) / 100;
  if (Math.abs(difference) > 0.01) issues.push(`Jurnal belum seimbang: debit ${debit}, kredit ${credit} IDR.`);

  return { debit, credit, difference, issues };
};

export const createPaymentJournalTemplate = (
  voucher: PaymentVoucher,
  bankCoaId: string,
  accounts: ChartOfAccount[],
  surcharge: number,
  otherExpenses: number,
  totalPayment: number,
): FinanceJournalLine[] => {
  const exchangeRate = voucher.currency === 'USD' ? Number(voucher.exchangeRateUSDToIDR) || 0 : 1;
  const lines: FinanceJournalLine[] = [];
  voucher.items.forEach((item) => {
    const amount = Number(item.amount || 0) * exchangeRate;
    const vatAmount = Number(item.vatAmount || 0) * exchangeRate;
    if (amount > 0) lines.push(createFinanceJournalLine({ memo: item.itemService, amount, direction: 'DEBIT' }));
    if (vatAmount > 0) {
      const vatAccount = accounts.find((account) => account.isActive && account.code === 'PT00900');
      lines.push(createFinanceJournalLine({ coaId: vatAccount?.id || '', memo: 'PPN Masukan', amount: vatAmount, direction: 'DEBIT' }));
    }
  });
  if (surcharge > 0) lines.push(createFinanceJournalLine({ memo: 'Surcharge', amount: surcharge * exchangeRate, direction: 'DEBIT' }));
  if (otherExpenses > 0) lines.push(createFinanceJournalLine({ memo: 'Other Expenses', amount: otherExpenses * exchangeRate, direction: 'DEBIT' }));
  const pph23 = voucher.items.reduce((sum, item) => sum + Number(item.pph23Amount || 0), 0) * exchangeRate;
  if (pph23 > 0) {
    const pphAccount = accounts.find((account) => account.isActive && account.code === 'TP00120');
    lines.push(createFinanceJournalLine({ coaId: pphAccount?.id || '', memo: 'Hutang PPh 23', amount: pph23, direction: 'CREDIT' }));
  }
  if (totalPayment > 0) {
    lines.push(createFinanceJournalLine({
      coaId: bankCoaId,
      memo: 'Pembayaran bank',
      amount: totalPayment * exchangeRate,
      direction: 'CREDIT',
    }));
  }
  return lines.length > 0 ? lines : [createFinanceJournalLine(), createFinanceJournalLine({ direction: 'CREDIT' })];
};

export const createReceivableJournalTemplate = (input: {
  bankCoaId: string;
  receivableCoaId: string;
  idrAmount: number;
  usdAmount: number;
  pph23AmountIDR: number;
  exchangeRateUSDToIDR: number;
  accounts: ChartOfAccount[];
}): FinanceJournalLine[] => {
  const cashIdr = Number(input.idrAmount || 0) + Number(input.usdAmount || 0) * Number(input.exchangeRateUSDToIDR || 0);
  const lines: FinanceJournalLine[] = [];
  if (cashIdr > 0) lines.push(createFinanceJournalLine({ coaId: input.bankCoaId, memo: 'Penerimaan bank', amount: cashIdr, direction: 'DEBIT' }));
  if (input.pph23AmountIDR > 0) {
    const taxAccount = input.accounts.find((account) => account.isActive && account.code === 'PT00120');
    lines.push(createFinanceJournalLine({ coaId: taxAccount?.id || '', memo: 'PPh 23 dibayar dimuka', amount: input.pph23AmountIDR, direction: 'DEBIT' }));
  }
  const receivableAmount = cashIdr + Number(input.pph23AmountIDR || 0);
  if (receivableAmount > 0) {
    lines.push(createFinanceJournalLine({ coaId: input.receivableCoaId, memo: 'Pelunasan piutang', amount: receivableAmount, direction: 'CREDIT' }));
  }
  return lines.length > 0 ? lines : [createFinanceJournalLine(), createFinanceJournalLine({ direction: 'CREDIT' })];
};

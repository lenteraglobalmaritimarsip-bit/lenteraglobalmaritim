import { BankAccount, ChartOfAccount, PaymentVoucher } from '../types';

export interface PaymentVoucherJournalLine {
  account: ChartOfAccount;
  memo: string;
  debit: number;
  credit: number;
}

export interface PaymentVoucherJournal {
  currency: string;
  exchangeRate: number;
  lines: PaymentVoucherJournalLine[];
  issues: string[];
}

export const buildPaymentVoucherJournal = (
  voucher: PaymentVoucher,
  chartOfAccounts: ChartOfAccount[],
  bankAccounts: BankAccount[],
): PaymentVoucherJournal => {
  const currency = voucher.currency || 'IDR';
  const exchangeRate = currency === 'USD' ? Number(voucher.exchangeRateUSDToIDR) : 1;
  const activeAccounts = chartOfAccounts.filter((account) => account.isActive);
  const accountsById = new Map(chartOfAccounts.map((account) => [account.id, account]));
  const taxAccount = (code: string) => {
    const matches = activeAccounts.filter((account) => account.code === code);
    return matches.length === 1 ? matches[0] : null;
  };
  const inputVatAccount = taxAccount('PT00900');
  const withholdingTaxAccount = taxAccount('TP00120');
  const issues: string[] = [];
  const lines: PaymentVoucherJournalLine[] = [];
  const addLine = (coaId: string | undefined, memo: string, debit: number, credit: number) => {
    if (debit <= 0 && credit <= 0) return;
    const account = coaId ? accountsById.get(coaId) : undefined;
    if (!account || !account.isActive) {
      issues.push(`${memo}: COA belum dipilih atau tidak aktif`);
      return;
    }
    lines.push({ account, memo, debit, credit });
  };

  const vatAmount = voucher.items.reduce((sum, item) => sum + Number(item.vatAmount || 0), 0);
  const pph23Amount = voucher.items.reduce((sum, item) => sum + Number(item.pph23Amount || 0), 0);
  const surcharge = Number(voucher.paymentSurcharge || 0);
  const otherExpenses = Number(voucher.paymentOtherExpenses || 0);
  voucher.items.forEach((item) => addLine(
    item.coaId,
    `Biaya ${item.itemService || item.jobNumber}`,
    Number(item.amount || 0),
    0,
  ));
  if (vatAmount > 0) {
    if (inputVatAccount) addLine(inputVatAccount.id, 'PPN Masukan', vatAmount, 0);
    else issues.push('COA PT00900 (PPN Masukan) tidak tersedia atau tidak aktif');
  }
  addLine(voucher.paymentSurchargeCoaId, 'Surcharge', surcharge, 0);
  addLine(voucher.paymentOtherExpensesCoaId, 'Other Expenses', otherExpenses, 0);
  if (pph23Amount > 0) {
    if (withholdingTaxAccount) addLine(withholdingTaxAccount.id, 'Hutang PPh 23', 0, pph23Amount);
    else issues.push('COA TP00120 (Hutang PPh 23) tidak tersedia atau tidak aktif');
  }

  const bankAccount = bankAccounts.find((account) => account.id === voucher.paidFromBankAccountId);
  if (!bankAccount) {
    issues.push('Rekening sumber pembayaran tidak ditemukan');
  } else {
    addLine(bankAccount.coaId, `Pembayaran ${bankAccount.bankName} ${bankAccount.accountNumber}`, 0,
      Number(voucher.paymentTotalAmount ?? (
        voucher.items.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0) + surcharge + otherExpenses
      )));
  }
  if (currency === 'USD' && !(exchangeRate > 0)) issues.push('Kurs USD/IDR pada voucher tidak tersedia');

  const roundAmount = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
  const debitTotal = roundAmount(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = roundAmount(lines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(debitTotal - creditTotal) > 0.01) {
    issues.push(`Jurnal tidak seimbang: debit ${debitTotal} ${currency}, kredit ${creditTotal} ${currency}`);
  }

  return { currency, exchangeRate, lines, issues };
};

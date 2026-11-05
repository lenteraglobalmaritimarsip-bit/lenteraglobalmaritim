import { BankAccount, ChartOfAccount } from '../types';

export interface ReceivableJournalInput {
  bankAccountId: string;
  coaId: string;
  idrAmount: number;
  usdAmount: number;
  pph23AmountIDR: number;
  exchangeRateUSDToIDR: number;
}

export interface ReceivableJournalLine {
  account: ChartOfAccount;
  memo: string;
  currency: 'IDR' | 'USD';
  debit: number;
  credit: number;
  exchangeRate: number;
}

export interface ReceivableJournal {
  lines: ReceivableJournalLine[];
  issues: string[];
  debitIdrEquivalent: number;
  creditIdrEquivalent: number;
}

export const buildReceivableJournal = (
  input: ReceivableJournalInput,
  chartOfAccounts: ChartOfAccount[],
  bankAccounts: BankAccount[],
): ReceivableJournal => {
  const issues: string[] = [];
  const lines: ReceivableJournalLine[] = [];
  const accountsById = new Map(chartOfAccounts.map((account) => [account.id, account]));
  const activeAccounts = chartOfAccounts.filter((account) => account.isActive);
  const bankAccount = bankAccounts.find((account) => account.id === input.bankAccountId);
  const bankCoa = bankAccount?.coaId ? accountsById.get(bankAccount.coaId) : undefined;
  const receivableCoa = accountsById.get(input.coaId);
  const exchangeRate = Number(input.exchangeRateUSDToIDR) || 0;
  const idrAmount = Number(input.idrAmount) || 0;
  const usdAmount = Number(input.usdAmount) || 0;
  const pph23AmountIDR = Number(input.pph23AmountIDR) || 0;

  if (!bankAccount) issues.push('Rekening penerima tidak ditemukan');
  if (!bankCoa?.isActive || bankCoa.accountGroup !== 'Asset') {
    issues.push('COA Asset rekening bank belum dipetakan atau tidak aktif');
  }
  if (!receivableCoa?.isActive || receivableCoa.accountGroup !== 'Asset') {
    issues.push('Pilih COA piutang aktif dari kelompok Asset');
  }
  if (usdAmount > 0 && !(exchangeRate > 0)) issues.push('Kurs USD/IDR tidak tersedia');
  const taxAccounts = activeAccounts.filter((account) => account.code === 'PT00120');
  const taxCoa = taxAccounts.length === 1 ? taxAccounts[0] : undefined;
  if (pph23AmountIDR > 0 && (!taxCoa || taxCoa.accountGroup !== 'Asset')) {
    issues.push('COA PT00120 (PPh 23 dibayar dimuka) harus tersedia tepat satu kali dan aktif');
  }

  if (bankCoa?.isActive && bankCoa.accountGroup === 'Asset') {
    if (idrAmount > 0) {
      lines.push({ account: bankCoa, memo: 'Penerimaan bank', currency: 'IDR', debit: idrAmount, credit: 0, exchangeRate: 1 });
    }
    if (usdAmount > 0) {
      lines.push({ account: bankCoa, memo: 'Penerimaan bank', currency: 'USD', debit: usdAmount, credit: 0, exchangeRate });
    }
  }
  if (taxCoa && pph23AmountIDR > 0) {
    lines.push({ account: taxCoa, memo: 'PPh 23 dibayar dimuka', currency: 'IDR', debit: pph23AmountIDR, credit: 0, exchangeRate: 1 });
  }
  if (receivableCoa?.isActive) {
    if (idrAmount + pph23AmountIDR > 0) {
      lines.push({
        account: receivableCoa,
        memo: 'Pelunasan piutang',
        currency: 'IDR',
        debit: 0,
        credit: idrAmount + pph23AmountIDR,
        exchangeRate: 1,
      });
    }
    if (usdAmount > 0) {
      lines.push({
        account: receivableCoa,
        memo: 'Pelunasan piutang',
        currency: 'USD',
        debit: 0,
        credit: usdAmount,
        exchangeRate,
      });
    }
  }

  const debitIdrEquivalent = lines.reduce((sum, line) => sum + line.debit * line.exchangeRate, 0);
  const creditIdrEquivalent = lines.reduce((sum, line) => sum + line.credit * line.exchangeRate, 0);
  const roundAmount = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
  if (Math.abs(roundAmount(debitIdrEquivalent) - roundAmount(creditIdrEquivalent)) > 0.01) {
    issues.push(`Jurnal Receivable tidak seimbang: debit IDR ${roundAmount(debitIdrEquivalent)}, kredit IDR ${roundAmount(creditIdrEquivalent)}`);
  }

  return { lines, issues, debitIdrEquivalent, creditIdrEquivalent };
};

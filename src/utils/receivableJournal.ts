import { BankAccount, ChartOfAccount } from '../types';

export interface ReceivableJournalInput {
  bankAccountId: string;
  coaId: string;
  idrAmount: number;
  usdAmount: number;
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
  const bankAccount = bankAccounts.find((account) => account.id === input.bankAccountId);
  const bankCoa = bankAccount?.coaId ? accountsById.get(bankAccount.coaId) : undefined;
  const receivableCoa = accountsById.get(input.coaId);
  const exchangeRate = Number(input.exchangeRateUSDToIDR) || 0;
  const idrAmount = Number(input.idrAmount) || 0;
  const usdAmount = Number(input.usdAmount) || 0;

  if (!bankAccount) issues.push('Rekening penerima tidak ditemukan');
  if (!bankCoa?.isActive || bankCoa.accountGroup !== 'Asset') {
    issues.push('COA Asset rekening bank belum dipetakan atau tidak aktif');
  }
  if (!receivableCoa?.isActive || receivableCoa.accountGroup !== 'Asset') {
    issues.push('Pilih COA piutang aktif dari kelompok Asset');
  }
  if (usdAmount > 0 && !(exchangeRate > 0)) issues.push('Kurs USD/IDR tidak tersedia');
  if (bankCoa?.isActive && bankCoa.accountGroup === 'Asset') {
    if (idrAmount > 0) {
      lines.push({ account: bankCoa, memo: 'Penerimaan bank', currency: 'IDR', debit: idrAmount, credit: 0, exchangeRate: 1 });
    }
    if (usdAmount > 0) {
      lines.push({ account: bankCoa, memo: 'Penerimaan bank', currency: 'USD', debit: usdAmount, credit: 0, exchangeRate });
    }
  }
  if (receivableCoa?.isActive) {
    if (idrAmount > 0) {
      lines.push({
        account: receivableCoa,
        memo: 'Pelunasan piutang',
        currency: 'IDR',
        debit: 0,
        credit: idrAmount,
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

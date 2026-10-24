import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react';
import { AccountsReceivableEntry, BankAccount, CashBalanceAdjustment, Currency, PaymentVoucher } from '../../types';
import { loadAccountsReceivableHistory } from '../../lib/api';
import { todayISO } from '../../utils/date';
import { getPaymentVoucherPaymentEvents } from '../../utils/paymentVoucherHistory';
import { DateInput } from '../shared/DateInput';

interface CashBalanceViewProps {
  bankAccounts: BankAccount[];
  paymentVouchers: PaymentVoucher[];
  cashBalanceAdjustments: CashBalanceAdjustment[];
}

interface FixedOpeningBalance {
  currency: Currency;
  amount: number;
}

interface DailyTransaction {
  id: string;
  direction: 'IN' | 'OUT';
  reference: string;
  party: string;
  job: string;
  remark: string;
  idrAmount: number;
  usdAmount: number;
  exchangeRate: number;
}

const OPENING_BALANCE_EFFECTIVE_DATE = '2026-10-22';
const FIXED_OPENING_BALANCES: Record<string, FixedOpeningBalance> = {
  '1200055755883': { currency: 'IDR', amount: 300_000_000 },
  '1200055755990': { currency: 'USD', amount: 40_000 },
  '2824121209': { currency: 'IDR', amount: 300_000_000 },
};

const formatAmount = (amount: number, currency: Currency) => new Intl.NumberFormat(
  currency === 'IDR' ? 'id-ID' : 'en-US',
  { style: 'currency', currency, maximumFractionDigits: currency === 'IDR' ? 0 : 2 },
).format(amount || 0);

const paymentTotal = (voucher: PaymentVoucher) => Number(voucher.paymentTotalAmount)
  || Number(voucher.totalPaidAmount || 0) + Number(voucher.paymentSurcharge || 0) + Number(voucher.paymentOtherExpenses || 0);

const transactionDate = (value: string | undefined) => String(value || '').slice(0, 10);
const normalizeAccountNumber = (value: string | undefined) => String(value || '').replace(/\D/g, '');
const getFixedOpeningBalance = (account: BankAccount) =>
  FIXED_OPENING_BALANCES[normalizeAccountNumber(account.accountNumber)];

const entryBelongsToAccount = (entry: AccountsReceivableEntry, account: BankAccount) => {
  const entryAccountNumber = normalizeAccountNumber(entry.accountNumber);
  if (entryAccountNumber) return entryAccountNumber === normalizeAccountNumber(account.accountNumber);
  return entry.bankAccountId === account.id;
};

const toIncomeTransaction = (entry: AccountsReceivableEntry): DailyTransaction => ({
  id: entry.id,
  direction: 'IN',
  reference: entry.invoiceNo || entry.jobId || entry.id,
  party: entry.subjectData === 'PRINCIPAL' ? entry.principalName || 'Principal' : 'Operasional',
  job: [entry.vesselName, entry.jobId].filter(Boolean).join(' / ') || '-',
  remark: entry.remark || '',
  idrAmount: Number(entry.idrAmount) || 0,
  usdAmount: Number(entry.usdAmount) || 0,
  exchangeRate: Number(entry.exchangeRateUSDToIDR) || 0,
});

const toExpenseTransaction = (voucher: PaymentVoucher): DailyTransaction => ({
  id: voucher.id,
  direction: 'OUT',
  reference: voucher.voucherNumber || voucher.requestNumber,
  party: voucher.paidTo || voucher.vendorName || '-',
  job: [...new Set((voucher.items || []).map((item) => item.jobNumber).filter(Boolean))].join(', ') || '-',
  remark: voucher.paymentDescription || '',
  idrAmount: (voucher.currency || 'IDR') === 'IDR' ? paymentTotal(voucher) : 0,
  usdAmount: (voucher.currency || 'IDR') === 'USD' ? paymentTotal(voucher) : 0,
  exchangeRate: Number(voucher.exchangeRateUSDToIDR) || 0,
});

const formatNumber = (amount: number, currency: Currency) => new Intl.NumberFormat(
  currency === 'IDR' ? 'id-ID' : 'en-US',
  { minimumFractionDigits: currency === 'IDR' ? 0 : 2, maximumFractionDigits: currency === 'IDR' ? 0 : 2 },
).format(amount || 0);

export const CashBalanceView: React.FC<CashBalanceViewProps> = ({ bankAccounts, paymentVouchers, cashBalanceAdjustments }) => {
  const [date, setDate] = useState(todayISO());
  const [receivableEntries, setReceivableEntries] = useState<AccountsReceivableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    void loadAccountsReceivableHistory()
      .then((entries) => { if (!cancelled) setReceivableEntries(entries); })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Data pemasukan rekening gagal dimuat.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const balances = useMemo(() => {
    const paymentEvents = paymentVouchers.flatMap(getPaymentVoucherPaymentEvents);
    return bankAccounts.map((account) => {
      const openingBalance = getFixedOpeningBalance(account);
      const currency = account.currency || openingBalance?.currency || 'IDR';
      const accountEntries = receivableEntries.filter((entry) => entryBelongsToAccount(entry, account));
      const incomeTransactions = accountEntries
        .filter((entry) => transactionDate(entry.incomeDate) === date)
        .map(toIncomeTransaction);
      const expenseVouchers = paymentEvents.filter((voucher) =>
        voucher.paidFromBankAccountId === account.id
        && transactionDate(voucher.paidAt) === date);
      const transactions = [
        ...incomeTransactions,
        ...expenseVouchers.map(toExpenseTransaction),
      ].sort((first, second) => first.reference.localeCompare(second.reference));
      const income = incomeTransactions.reduce((sum, transaction) =>
        sum + (currency === 'IDR' ? transaction.idrAmount : transaction.usdAmount), 0);
      const expense = expenseVouchers.reduce((sum, voucher) => {
        const amount = paymentTotal(voucher);
        return sum + ((voucher.currency || 'IDR') === currency ? amount : 0);
      }, 0);
      let opening: number | null = null;

      if (openingBalance && date >= OPENING_BALANCE_EFFECTIVE_DATE) {
        const incomeBeforeDate = accountEntries
          .filter((entry) => transactionDate(entry.incomeDate) >= OPENING_BALANCE_EFFECTIVE_DATE
            && transactionDate(entry.incomeDate) < date)
          .reduce((sum, entry) => sum + (currency === 'IDR'
            ? Number(entry.idrAmount) || 0
            : Number(entry.usdAmount) || 0), 0);
        const expenseBeforeDate = paymentEvents
          .filter((voucher) => voucher.paidFromBankAccountId === account.id
            && (voucher.currency || 'IDR') === currency
            && transactionDate(voucher.paidAt) >= OPENING_BALANCE_EFFECTIVE_DATE
            && transactionDate(voucher.paidAt) < date)
          .reduce((sum, voucher) => sum + paymentTotal(voucher), 0);
        const effectiveAdjustments = cashBalanceAdjustments.filter((adjustment) =>
          adjustment.bankAccountId === account.id
          && adjustment.currency === currency
          && adjustment.effectiveDate <= date);
        const adjustmentTotal = effectiveAdjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0);
        opening = openingBalance.amount + incomeBeforeDate - expenseBeforeDate + adjustmentTotal;
      }

      return {
        account,
        currency,
        opening,
        income,
        expense,
        closing: opening === null ? null : opening + income - expense,
        transactions,
      };
    });
  }, [bankAccounts, cashBalanceAdjustments, date, paymentVouchers, receivableEntries]);

  const inputClass = 'w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500';

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Finance</div>
          <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Saldo Kas</h1>
          <p className="mt-1 text-xs text-slate-500">Penyesuaian saldo awal dari Admin berlaku mulai tanggal efektif. Rincian transaksi mengikuti tanggal yang dipilih.</p>
        </div>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tanggal
          <DateInput value={date} onChange={(value) => setDate(value || todayISO())} inputClassName={inputClass} ariaLabel="Tanggal saldo kas" />
        </label>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {balances.map(({ account, currency, opening, income, expense, closing, transactions }) => (
          <section key={account.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="p-5">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                <span className="rounded-md bg-blue-50 p-2 text-blue-700"><Wallet size={17} /></span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-900">{account.bankName}</h2>
                  <p className="mt-1 truncate text-xs text-slate-600">{account.accountName}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">{account.accountNumber}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Saldo Awal Hari · {currency}</div>
                  <div className="mt-2 whitespace-nowrap font-mono text-sm font-bold text-slate-700">
                    {opening === null ? 'Belum berlaku' : formatAmount(opening, currency)}
                  </div>
                </div>
                <div className="rounded-md bg-emerald-50 p-3">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700"><ArrowDownToLine size={12} /> Pemasukan</div>
                  <div className="mt-2 whitespace-nowrap font-mono text-sm font-bold text-emerald-800">{formatAmount(income, currency)}</div>
                </div>
                <div className="rounded-md bg-rose-50 p-3">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-700"><ArrowUpFromLine size={12} /> Pengeluaran</div>
                  <div className="mt-2 whitespace-nowrap font-mono text-sm font-bold text-rose-800">{formatAmount(expense, currency)}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Saldo Akhir Hari</div>
                  <div className="mt-2 whitespace-nowrap font-mono text-sm font-bold text-slate-700">
                    {closing === null ? 'Belum berlaku' : formatAmount(closing, currency)}
                  </div>
                </div>
              </div>
              {!getFixedOpeningBalance(account) && (
                <p role="status" className="mt-3 text-[11px] font-semibold text-amber-700">
                  Saldo pembuka rekening ini belum ditetapkan oleh IT.
                </p>
              )}
            </div>

            <div className="border-t border-slate-100">
              <div className="flex items-center justify-between gap-2 px-5 py-3">
                <h3 className="text-xs font-black text-slate-800">Rincian transaksi hari berjalan</h3>
                <span className="text-[10px] text-slate-500">{transactions.length} transaksi</span>
              </div>
              {transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-[10px]">
                    <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Jenis / Referensi</th>
                        <th className="px-3 py-2">Pihak / Job</th>
                        <th className="px-3 py-2 text-right">Masuk IDR</th>
                        <th className="px-3 py-2 text-right">Masuk USD</th>
                        <th className="px-3 py-2 text-right">Kurs Masuk</th>
                        <th className="px-3 py-2 text-right">Keluar IDR</th>
                        <th className="px-3 py-2 text-right">Keluar USD</th>
                        <th className="px-3 py-2 text-right">Kurs Keluar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id} className="align-top">
                          <td className="px-3 py-2">
                            <div className={`font-bold ${transaction.direction === 'IN' ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {transaction.direction === 'IN' ? 'Masuk' : 'Keluar'}
                            </div>
                            <div className="mt-0.5 font-mono text-slate-700">{transaction.reference}</div>
                          </td>
                          <td className="max-w-40 px-3 py-2">
                            <div className="truncate font-semibold text-slate-700">{transaction.party}</div>
                            <div className="mt-0.5 truncate text-slate-500">{transaction.job}</div>
                            {transaction.remark && <div className="mt-0.5 truncate text-slate-500">{transaction.remark}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {transaction.idrAmount ? formatNumber(transaction.idrAmount, 'IDR') : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {transaction.usdAmount ? formatNumber(transaction.usdAmount, 'USD') : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {transaction.direction === 'IN' && transaction.usdAmount && transaction.exchangeRate
                              ? formatNumber(transaction.exchangeRate, 'IDR')
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {transaction.direction === 'OUT' && transaction.idrAmount
                              ? formatNumber(transaction.idrAmount, 'IDR')
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {transaction.direction === 'OUT' && transaction.usdAmount
                              ? formatNumber(transaction.usdAmount, 'USD')
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">
                            {transaction.direction === 'OUT' && transaction.usdAmount && transaction.exchangeRate
                              ? formatNumber(transaction.exchangeRate, 'IDR')
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 pb-4 text-[11px] text-slate-500">Belum ada transaksi pada tanggal ini.</div>
              )}
            </div>
          </section>
        ))}
      </div>

      {!isLoading && bankAccounts.length === 0 && (
        <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada rekening Bank di Master Data.</div>
      )}
      {isLoading && <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat transaksi rekening…</div>}
    </div>
  );
};

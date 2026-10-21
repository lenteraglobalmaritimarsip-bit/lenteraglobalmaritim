import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react';
import { AccountsReceivableEntry, BankAccount, PaymentVoucher } from '../../types';
import { loadAccountsReceivableHistory } from '../../lib/api';
import { todayISO } from '../../utils/date';
import { DateInput } from '../shared/DateInput';

interface CashBalanceViewProps {
  bankAccounts: BankAccount[];
  paymentVouchers: PaymentVoucher[];
}

const formatIDR = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(amount || 0);

const paymentTotal = (voucher: PaymentVoucher) => Number(voucher.paymentTotalAmount)
  || Number(voucher.totalPaidAmount || 0) + Number(voucher.paymentSurcharge || 0) + Number(voucher.paymentOtherExpenses || 0);

const isSameDate = (value: string | undefined, date: string) => String(value || '').slice(0, 10) === date;

export const CashBalanceView: React.FC<CashBalanceViewProps> = ({ bankAccounts, paymentVouchers }) => {
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

  const balances = useMemo(() => bankAccounts.map((account) => {
    const income = receivableEntries
      .filter((entry) => entry.bankAccountId === account.id && isSameDate(entry.incomeDate, date))
      .reduce((sum, entry) => sum
        + (Number(entry.idrAmount) || 0)
        + (Number(entry.usdAmount) || 0) * (Number(entry.exchangeRateUSDToIDR) || 0), 0);
    const expense = paymentVouchers
      .filter((voucher) => voucher.status === 'PAID'
        && voucher.paidFromBankAccountId === account.id
        && isSameDate(voucher.paidAt, date))
      .reduce((sum, voucher) => {
        const amount = paymentTotal(voucher);
        const rate = Number(voucher.exchangeRateUSDToIDR) || 0;
        return sum + ((voucher.currency || 'IDR') === 'USD' ? amount * rate : amount);
      }, 0);
    return { account, income, expense };
  }), [bankAccounts, date, paymentVouchers, receivableEntries]);

  const inputClass = 'w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500';

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Finance</div>
          <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Saldo Kas</h1>
        </div>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tanggal
          <DateInput value={date} onChange={(value) => setDate(value || todayISO())} inputClassName={inputClass} ariaLabel="Tanggal saldo kas" />
        </label>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {balances.map(({ account, income, expense }) => (
          <section key={account.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Saldo Awal Hari</div>
                <div className="mt-2 font-mono text-sm font-bold text-slate-700">-</div>
              </div>
              <div className="rounded-md bg-emerald-50 p-3">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700"><ArrowDownToLine size={12} /> Pemasukan</div>
                <div className="mt-2 whitespace-nowrap font-mono text-sm font-bold text-emerald-800">{formatIDR(income)}</div>
              </div>
              <div className="rounded-md bg-rose-50 p-3">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-700"><ArrowUpFromLine size={12} /> Pengeluaran</div>
                <div className="mt-2 whitespace-nowrap font-mono text-sm font-bold text-rose-800">{formatIDR(expense)}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Saldo Akhir Hari</div>
                <div className="mt-2 font-mono text-sm font-bold text-slate-700">-</div>
              </div>
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
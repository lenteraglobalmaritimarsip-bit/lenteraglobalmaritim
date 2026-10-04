import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { PaymentVoucher } from '../../types';

interface AccountsPayableViewProps {
  paymentVouchers: PaymentVoucher[];
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const formatDate = (value: string) => {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const AccountsPayableView: React.FC<AccountsPayableViewProps> = ({ paymentVouchers }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const vouchers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...paymentVouchers]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .filter((voucher) => !query || [
        voucher.requestNumber,
        voucher.vendorName,
        voucher.paidTo,
        voucher.requestBy,
        voucher.bankName,
        voucher.accountNumber,
        ...voucher.items.flatMap((item) => [item.jobNumber, item.customerName, item.itemService]),
      ].join(' ').toLowerCase().includes(query));
  }, [paymentVouchers, searchQuery]);

  const totalOutstanding = vouchers.reduce((sum, voucher) => sum + (voucher.totalPaidAmount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Finance</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Accounts Payable</h1>
            <p className="text-xs text-slate-500">Data pengajuan pembayaran ke vendor dari Request Payment (Payment Voucher).</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-right">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
              <div className="text-[10px] font-bold uppercase text-slate-500">Jumlah Pengajuan</div>
              <div className="font-mono text-lg font-black text-slate-900">{vouchers.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
              <div className="text-[10px] font-bold uppercase text-slate-500">Total Paid Amount</div>
              <div className="font-mono text-lg font-black text-slate-900">{money(totalOutstanding)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor request, vendor, JOB, customer..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-violet-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-10 p-3.5" />
                <th className="p-3.5">No</th>
                <th className="p-3.5">Request Number</th>
                <th className="p-3.5">Request Date</th>
                <th className="p-3.5">Info JOB</th>
                <th className="p-3.5">Vendor Name</th>
                <th className="p-3.5">Paid To</th>
                <th className="p-3.5">Bank / A/c Number</th>
                <th className="p-3.5">Request By</th>
                <th className="p-3.5 text-right">Paid Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vouchers.map((voucher, index) => {
                const expanded = expandedId === voucher.id;
                return (
                  <React.Fragment key={voucher.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expanded ? null : voucher.id)}>
                      <td className="p-3.5 text-slate-500">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                      <td className="p-3.5 font-mono font-bold text-slate-900">{voucher.requestNumber}</td>
                      <td className="p-3.5 text-slate-700">{formatDate(voucher.requestDate)}</td>
                      <td className="p-3.5">
                        <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">
                          {voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional'}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">{voucher.vendorName}</td>
                      <td className="p-3.5 text-slate-700">{voucher.paidTo || '-'}</td>
                      <td className="p-3.5 text-slate-700">
                        <div>{voucher.bankName || '-'}</div>
                        <div className="font-mono text-[11px] text-slate-500">{voucher.accountNumber || '-'}</div>
                      </td>
                      <td className="p-3.5 text-slate-700">{voucher.requestBy}</td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900">{money(voucher.totalPaidAmount)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/60">
                        <td />
                        <td colSpan={9} className="p-3.5">
                          <table className="w-full text-left text-[11px]">
                            <thead className="text-[10px] uppercase text-slate-500">
                              <tr>
                                <th className="p-2">No</th>
                                <th className="p-2">JOB Number</th>
                                <th className="p-2">Customer</th>
                                <th className="p-2">Item Service</th>
                                <th className="p-2 text-right">Amount</th>
                                <th className="p-2 text-right">Vat</th>
                                <th className="p-2 text-right">Total</th>
                                <th className="p-2 text-right">PPH 23 (1%)</th>
                                <th className="p-2 text-right">PPH 21 (2%)</th>
                                <th className="p-2 text-right">Paid Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {voucher.items.map((item, itemIndex) => (
                                <tr key={item.id}>
                                  <td className="p-2 font-mono text-slate-500">{itemIndex + 1}</td>
                                  <td className="p-2">{item.jobNumber}</td>
                                  <td className="p-2">{item.customerName}</td>
                                  <td className="p-2">{item.itemService}</td>
                                  <td className="p-2 text-right font-mono">{money(item.amount)}</td>
                                  <td className="p-2 text-right font-mono">{money(item.vatAmount)}</td>
                                  <td className="p-2 text-right font-mono">{money(item.total)}</td>
                                  <td className="p-2 text-right font-mono">{money(item.pph23Amount)}</td>
                                  <td className="p-2 text-right font-mono">{money(item.pph21Amount)}</td>
                                  <td className="p-2 text-right font-mono font-bold">{money(item.paidAmount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {vouchers.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-slate-400">Belum ada data pengajuan pembayaran.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

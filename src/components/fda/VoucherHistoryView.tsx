import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { PaymentVoucher } from '../../types';

interface VoucherHistoryViewProps {
  paymentVouchers: PaymentVoucher[];
}

type StatusFilter = 'ALL' | 'PROCESS' | 'APPROVED' | 'REJECTED';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const formatDate = (value: string) => {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusGroup = (voucher: PaymentVoucher): Exclude<StatusFilter, 'ALL'> => {
  if (voucher.status === 'APPROVED' || voucher.status === 'PAID') return 'APPROVED';
  if (voucher.status === 'REJECTED') return 'REJECTED';
  return 'PROCESS';
};

const badges = {
  PROCESS: { label: 'Send to Finance', className: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Ditolak', className: 'bg-rose-50 text-rose-700' },
};

export const VoucherHistoryView: React.FC<VoucherHistoryViewProps> = ({ paymentVouchers }) => {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    PROCESS: paymentVouchers.filter((v) => statusGroup(v) === 'PROCESS').length,
    APPROVED: paymentVouchers.filter((v) => statusGroup(v) === 'APPROVED').length,
    REJECTED: paymentVouchers.filter((v) => statusGroup(v) === 'REJECTED').length,
  }), [paymentVouchers]);

  const vouchers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...paymentVouchers]
      .filter((voucher) => filter === 'ALL' || statusGroup(voucher) === filter)
      .filter((voucher) => !query || [voucher.requestNumber, voucher.vendorName, voucher.paidTo, voucher.requestBy]
        .join(' ').toLowerCase().includes(query))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [paymentVouchers, filter, searchQuery]);

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: `Semua (${paymentVouchers.length})` },
    { key: 'APPROVED', label: `Disetujui (${counts.APPROVED})` },
    { key: 'REJECTED', label: `Ditolak (${counts.REJECTED})` },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Request Payment</div>
        <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">History</h1>
        <p className="text-xs text-slate-500">Monitoring pengajuan voucher beserta status persetujuan Manager.</p>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${filter === tab.key ? 'border-slate-300 bg-slate-200 text-slate-800' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nomor / vendor..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs lg:w-64"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-10 p-3" />
              <th className="p-3">No</th>
              <th className="p-3">Request Number</th>
              <th className="p-3">Request Date</th>
              <th className="p-3">Info JOB / JOB Number</th>
              <th className="p-3">Vendor / Paid To</th>
              <th className="p-3">Request By</th>
              <th className="p-3 text-right">Paid Amount</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vouchers.length === 0 && (
              <tr><td colSpan={9} className="p-10 text-center text-slate-400">Belum ada pengajuan voucher.</td></tr>
            )}
            {vouchers.map((voucher, index) => {
              const group = statusGroup(voucher);
              const badge = badges[group];
              const expanded = expandedId === voucher.id;
              return (
                <React.Fragment key={voucher.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expanded ? null : voucher.id)}>
                    <td className="p-3 text-slate-500">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="p-3 font-mono text-slate-500">{index + 1}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">{voucher.requestNumber}</td>
                    <td className="p-3 text-slate-700">{formatDate(voucher.requestDate)}</td>
                    <td className="p-3 text-slate-700">
                      <div>{voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional'}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{[...new Set(voucher.items.map((item) => item.jobNumber.trim()).filter(Boolean))].join(', ') || '-'}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{voucher.vendorName}</div>
                      <div className="text-slate-500">{voucher.paidTo}</div>
                    </td>
                    <td className="p-3 text-slate-700">{voucher.requestBy}</td>
                    <td className="p-3 text-right font-mono font-black text-slate-900">{money(voucher.totalPaidAmount)}</td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>
                      {group === 'REJECTED' && voucher.managerNote && (
                        <div className="mt-1 max-w-[220px] text-[10px] text-rose-600">Alasan: {voucher.managerNote}</div>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={8} className="p-3">
                        <div className="mb-2 text-[11px] text-slate-600">
                          Bank: <b>{voucher.bankName || '-'}</b> · A/c: <b className="font-mono">{voucher.accountNumber || '-'}</b>
                          {voucher.reviewedBy && <> · Direview oleh: <b>{voucher.reviewedBy}</b></>}
                        </div>
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="p-2">No</th><th className="p-2">JOB Number</th><th className="p-2">{voucher.jobInfo === 'JOB_VESSEL' ? 'Vessel name' : 'Customer'}</th><th className="p-2">Item Service</th>
                              <th className="p-2 text-right">Amount</th><th className="p-2 text-right">Vat</th><th className="p-2 text-right">Total</th>
                              <th className="p-2 text-right">PPH 23</th><th className="p-2 text-right">PPH 21</th><th className="p-2 text-right">Paid Amount</th>
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
          </tbody>
        </table>
      </div>
    </div>
  );
};

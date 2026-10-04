import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { PaymentVoucher } from '../../types';
import { db } from '../../db/storage';

interface VoucherApprovalViewProps {
  paymentVouchers: PaymentVoucher[];
  reviewer: string;
}

type Filter = 'PENDING_MANAGER' | 'ALL';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const formatDate = (value: string) => {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const voucherStatusBadge = (status?: PaymentVoucher['status']) => {
  switch (status) {
    case 'APPROVED': return { label: 'Disetujui - Menunggu Pembayaran', className: 'bg-sky-50 text-sky-700' };
    case 'REJECTED': return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700' };
    case 'PAID': return { label: 'Dibayar', className: 'bg-emerald-50 text-emerald-700' };
    default: return { label: 'Menunggu Persetujuan', className: 'bg-amber-50 text-amber-700' };
  }
};

export const VoucherApprovalView: React.FC<VoucherApprovalViewProps> = ({ paymentVouchers, reviewer }) => {
  const [filter, setFilter] = useState<Filter>('PENDING_MANAGER');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const vouchers = useMemo(
    () => [...paymentVouchers]
      .filter((voucher) => filter === 'ALL' || (voucher.status || 'PENDING_MANAGER') === 'PENDING_MANAGER')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [paymentVouchers, filter],
  );
  const pendingCount = paymentVouchers.filter((voucher) => (voucher.status || 'PENDING_MANAGER') === 'PENDING_MANAGER').length;

  const approve = async (voucher: PaymentVoucher) => {
    setError('');
    try {
      await db.reviewPaymentVoucher(voucher.id, 'APPROVED', reviewer);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Gagal menyetujui voucher.');
    }
  };

  const reject = async (voucher: PaymentVoucher) => {
    setError('');
    try {
      await db.reviewPaymentVoucher(voucher.id, 'REJECTED', reviewer, note);
      setRejectingId(null);
      setNote('');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Gagal menolak voucher.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Operations Manager</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Voucher Approval</h1>
            <p className="text-xs text-slate-500">Setujui pengajuan Payment Voucher dari FDA. Yang disetujui diteruskan ke Finance; yang ditolak kembali ke FDA untuk diedit.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setFilter('PENDING_MANAGER')} className={`rounded-xl border px-3 py-2 text-xs font-bold ${filter === 'PENDING_MANAGER' ? 'border-slate-300 bg-slate-200 text-slate-800' : 'border-slate-200 bg-white text-slate-700'}`}>
              Menunggu ({pendingCount})
            </button>
            <button type="button" onClick={() => setFilter('ALL')} className={`rounded-xl border px-3 py-2 text-xs font-bold ${filter === 'ALL' ? 'border-slate-300 bg-slate-200 text-slate-800' : 'border-slate-200 bg-white text-slate-700'}`}>
              Semua
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-10 p-3" />
              <th className="p-3">Request Number</th>
              <th className="p-3">Request Date</th>
              <th className="p-3">Info JOB</th>
              <th className="p-3">Vendor / Paid To</th>
              <th className="p-3">Request By</th>
              <th className="p-3 text-right">Paid Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vouchers.length === 0 && (
              <tr><td colSpan={9} className="p-10 text-center text-slate-400">Tidak ada voucher.</td></tr>
            )}
            {vouchers.map((voucher) => {
              const expanded = expandedId === voucher.id;
              const badge = voucherStatusBadge(voucher.status);
              const pending = (voucher.status || 'PENDING_MANAGER') === 'PENDING_MANAGER';
              return (
                <React.Fragment key={voucher.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expanded ? null : voucher.id)}>
                    <td className="p-3 text-slate-500">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">{voucher.requestNumber}</td>
                    <td className="p-3 text-slate-700">{formatDate(voucher.requestDate)}</td>
                    <td className="p-3 text-slate-700">{voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional'}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{voucher.vendorName}</div>
                      <div className="text-slate-500">{voucher.paidTo}</div>
                    </td>
                    <td className="p-3 text-slate-700">{voucher.requestBy}</td>
                    <td className="p-3 text-right font-mono font-black text-slate-900">{money(voucher.totalPaidAmount)}</td>
                    <td className="p-3"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span></td>
                    <td className="p-3 text-center" onClick={(event) => event.stopPropagation()}>
                      {pending && (
                        <div className="flex justify-center gap-1.5">
                          <button type="button" onClick={() => approve(voucher)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">
                            <Check className="h-3.5 w-3.5" /> Setujui
                          </button>
                          <button type="button" onClick={() => { setRejectingId(voucher.id); setNote(''); setError(''); }} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700">
                            <X className="h-3.5 w-3.5" /> Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {rejectingId === voucher.id && (
                    <tr className="bg-rose-50/50">
                      <td />
                      <td colSpan={8} className="p-3">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            autoFocus
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Alasan penolakan (wajib)"
                            className="flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                          />
                          <button type="button" onClick={() => reject(voucher)} className="rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-700">Kirim Penolakan</button>
                          <button type="button" onClick={() => setRejectingId(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700">Batal</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {expanded && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={8} className="p-3">
                        <div className="mb-2 text-[11px] text-slate-600">
                          Bank: <b>{voucher.bankName || '-'}</b> · A/c: <b className="font-mono">{voucher.accountNumber || '-'}</b>
                          {voucher.managerNote && <> · Catatan Manager: <b>{voucher.managerNote}</b></>}
                        </div>
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="p-2">No</th><th className="p-2">JOB Number</th><th className="p-2">Customer</th><th className="p-2">Item Service</th>
                              <th className="p-2 text-right">Amount</th><th className="p-2 text-right">Vat</th><th className="p-2 text-right">Total</th>
                              <th className="p-2 text-right">PPH 23</th><th className="p-2 text-right">PPH 21</th><th className="p-2 text-right">Paid Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {voucher.items.map((item, index) => (
                              <tr key={item.id}>
                                <td className="p-2 font-mono text-slate-500">{index + 1}</td>
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

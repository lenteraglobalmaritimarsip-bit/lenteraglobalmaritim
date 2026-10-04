import React, { useMemo, useState } from 'react';
import { Eye, Pencil, Search } from 'lucide-react';
import { JobCall, PaymentVoucher, VendorPartner } from '../../types';
import { PaymentVoucherView } from './PaymentVoucherView';
import { printPaymentVoucher } from '../../utils/voucherPrint';
import { voucherStatusBadge } from '../manager/VoucherApprovalView';

interface EditVoucherViewProps {
  jobCalls: JobCall[];
  vendorPartners: VendorPartner[];
  paymentVouchers: PaymentVoucher[];
  requestBy: string;
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const formatDate = (value: string) => {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const EditVoucherView: React.FC<EditVoucherViewProps> = ({ jobCalls, vendorPartners, paymentVouchers, requestBy }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [printError, setPrintError] = useState('');

  const handleView = (voucher: PaymentVoucher) => {
    setPrintError(printPaymentVoucher({ ...voucher, checkerName: requestBy, signerName: voucher.reviewedBy, paidBy: voucher.paidBy }) || '');
  };

  const editing = paymentVouchers.find((voucher) => voucher.id === editingId);

  const vouchers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...paymentVouchers]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .filter((voucher) => !query || [voucher.requestNumber, voucher.vendorName, voucher.paidTo, voucher.requestBy]
        .join(' ').toLowerCase().includes(query));
  }, [paymentVouchers, searchQuery]);

  if (editing) {
    return (
      <PaymentVoucherView
        key={editing.id}
        voucher={editing}
        jobCalls={jobCalls}
        vendorPartners={vendorPartners}
        requestBy={editing.requestBy || requestBy}
        onDataSaved={() => setEditingId(null)}
        onCancelEdit={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Request Payment</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Edit Voucher</h1>
            <p className="text-xs text-slate-500">Voucher yang sudah disimpan. Hanya voucher yang menunggu persetujuan atau ditolak Manager yang dapat diedit; setelah diedit, voucher yang ditolak dikirim ulang ke Manager.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nomor / vendor..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs sm:w-64"
            />
          </div>
        </div>
      </div>

      {printError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{printError}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-3">No</th>
              <th className="p-3">Request Number</th>
              <th className="p-3">Request Date</th>
              <th className="p-3">Info JOB / JOB Number</th>
              <th className="p-3">Vendor Name</th>
              <th className="p-3">Paid To</th>
              <th className="p-3">Request By</th>
              <th className="p-3 text-right">Paid Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vouchers.length === 0 && (
              <tr><td colSpan={10} className="p-10 text-center text-slate-400">Belum ada voucher tersimpan.</td></tr>
            )}
            {vouchers.map((voucher, index) => (
              <tr key={voucher.id} className="hover:bg-slate-50">
                <td className="p-3 text-slate-500">{index + 1}</td>
                <td className="p-3 font-mono font-bold text-slate-900">{voucher.requestNumber}</td>
                <td className="p-3 text-slate-600">{formatDate(voucher.requestDate)}</td>
                <td className="p-3 text-slate-600">
                  <div>{voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional'}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{[...new Set(voucher.items.map((item) => item.jobNumber.trim()).filter(Boolean))].join(', ') || '-'}</div>
                </td>
                <td className="p-3 font-semibold text-slate-800">{voucher.vendorName}</td>
                <td className="p-3 text-slate-600">{voucher.paidTo}</td>
                <td className="p-3 text-slate-600">{voucher.requestBy}</td>
                <td className="p-3 text-right font-mono font-bold text-slate-900">{money(voucher.totalPaidAmount)}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${voucherStatusBadge(voucher.status).className}`}>{voucherStatusBadge(voucher.status).label}</span>
                  {voucher.status === 'REJECTED' && voucher.managerNote && (
                    <div className="mt-1 max-w-[220px] text-[10px] text-rose-600">Alasan: {voucher.managerNote}</div>
                  )}
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleView(voucher)}
                    className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-600"
                    title="Lihat Cetak / PDF"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  {(!voucher.status || voucher.status === 'PENDING_MANAGER' || voucher.status === 'REJECTED') && (
                  <button
                    type="button"
                    onClick={() => setEditingId(voucher.id)}
                    className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title="Edit voucher"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

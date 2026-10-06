import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Eye, Search } from 'lucide-react';
import { BankAccount, PaymentVoucher } from '../../types';
import { db } from '../../db/storage';
import { printPaymentVoucher } from '../../utils/voucherPrint';

interface AccountsPayableViewProps {
  paymentVouchers: PaymentVoucher[];
  payer: string;
  bankAccounts?: BankAccount[];
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const formatDate = (value: string) => {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const todayIso = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (value: string) => {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const AccountsPayableView: React.FC<AccountsPayableViewProps> = ({ paymentVouchers, payer, bankAccounts = [] }) => {
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentFormVoucherId, setPaymentFormVoucherId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState<string>(() => todayIso());
  const paymentDatePickerRef = useRef<HTMLInputElement | null>(null);
  const [manualSurcharge, setManualSurcharge] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [selectedBankId, setSelectedBankId] = useState<string>('');

  const paymentFormVoucher = useMemo(
    () => paymentVouchers.find((voucher) => voucher.id === paymentFormVoucherId) || null,
    [paymentFormVoucherId, paymentVouchers],
  );

  useEffect(() => {
    if (!paymentFormVoucher) return;
    setPaymentDate(todayIso());
    setManualSurcharge('');
    setPaymentDescription(`Payment voucher ${paymentFormVoucher.requestNumber}`);
    setSelectedBankId(bankAccounts[0]?.id || '');
  }, [paymentFormVoucher, bankAccounts]);

  const selectedBank = bankAccounts.find((account) => account.id === selectedBankId) || bankAccounts[0] || null;

  const itemTotals = useMemo(() => {
    if (!paymentFormVoucher) {
      return { total: 0, pph23: 0, pph21: 0, surcharge: 0, totalPayment: 0 };
    }

    const total = Number(paymentFormVoucher.totalPaidAmount || 0);
    const pph23 = -(paymentFormVoucher.items.reduce((sum, item) => sum + Number(item.pph23Amount || 0), 0));
    const pph21 = -(paymentFormVoucher.items.reduce((sum, item) => sum + Number(item.pph21Amount || 0), 0));
    const surcharge = Number(manualSurcharge || 0);
    const totalPayment = total + pph23 + pph21;

    return { total, pph23, pph21, surcharge, totalPayment };
  }, [manualSurcharge, paymentFormVoucher]);

  const voucherNumber = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const counter = Math.max(1, paymentVouchers.length + 1);
    return `PVJKT-${String(counter).padStart(4, '0')}-${month}${year}`;
  }, [paymentVouchers.length]);

  const handlePay = async (voucher: PaymentVoucher) => {
    if (!window.confirm(`Tandai voucher ${voucher.requestNumber} sebagai sudah dibayar?`)) return;
    setError('');
    try {
      await db.payPaymentVoucher(voucher.id, payer);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'Gagal memproses pembayaran.');
    }
  };

  const openPaymentDatePicker = () => {
    paymentDatePickerRef.current?.showPicker?.();
    paymentDatePickerRef.current?.click();
  };

  const handleOpenInvoiceView = () => {
    if (!paymentFormVoucher) return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      setError('Popup diblokir; buka kembali dan lanjutkan dengan form ini.');
      return;
    }

    const body = `
      <html>
        <head>
          <title>INVOICE VOUCHER</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
            .totals { width: 100%; max-width: 320px; margin-left: auto; margin-top: 16px; }
            .row { display: flex; justify-content: space-between; padding: 6px 0; }
          </style>
        </head>
        <body>
          <h1>INVOICE VOUCHER</h1>
          <div class="meta">
            <div><b>Voucher Number</b><br />${voucherNumber}</div>
            <div><b>Payment Date</b><br />${formatDisplayDate(paymentDate)}</div>
            <div><b>Vendor</b><br />${paymentFormVoucher.vendorName}</div>
            <div><b>Request Number</b><br />${paymentFormVoucher.requestNumber}</div>
          </div>
          <p><b>Description</b><br />${paymentDescription || paymentFormVoucher.requestNumber}</p>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Customer</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${paymentFormVoucher.items.map((item) => `
                <tr>
                  <td>${item.itemService}</td>
                  <td>${item.customerName}</td>
                  <td>${money(item.paidAmount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totals">
            <div class="row"><span>Total</span><strong>${money(itemTotals.total)}</strong></div>
            <div class="row"><span>Subcharge</span><strong>${money(itemTotals.surcharge)}</strong></div>
            <div class="row"><span>PPH 23</span><strong>${money(itemTotals.pph23)}</strong></div>
            <div class="row"><span>PPH 21</span><strong>${money(itemTotals.pph21)}</strong></div>
            <div class="row"><span><b>Total Payment</b></span><strong><b>${money(itemTotals.totalPayment)}</b></strong></div>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(body);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const vouchers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return paymentVouchers
      .filter((voucher) => voucher.status === 'APPROVED' || voucher.status === 'PAID')
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
      {paymentFormVoucher && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Payment Voucher</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">INVOICE VOUCHER</h2>
            </div>
            <button
              type="button"
              onClick={() => setPaymentFormVoucherId(null)}
              className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200"
            >
              Kembali
            </button>
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Request by</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{paymentFormVoucher.requestBy || payer}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overdue date</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{formatDate(paymentFormVoucher.requestDate)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Checking by</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{paymentFormVoucher.reviewedBy || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Voucher Number</div>
                <div className="mt-2 font-mono text-sm font-bold text-slate-900">{voucherNumber}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Vendor</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{paymentFormVoucher.vendorName}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Bank</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{selectedBank?.bankName || paymentFormVoucher.bankName || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">A/C Number</div>
                <div className="mt-2 font-mono text-sm font-semibold text-slate-800">{selectedBank?.accountNumber || paymentFormVoucher.accountNumber || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Payment Date</div>
                <div className="relative mt-2">
                  <input
                    type="text"
                    readOnly
                    value={formatDisplayDate(paymentDate)}
                    onClick={openPaymentDatePicker}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-800 outline-none transition focus:border-violet-400"
                  />
                  <button
                    type="button"
                    onClick={openPaymentDatePicker}
                    aria-label="Pilih tanggal pembayaran"
                    title="Pilih tanggal pembayaran"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                  <input
                    ref={paymentDatePickerRef}
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value || todayIso())}
                    aria-label="Pilih tanggal pembayaran"
                    className="pointer-events-none absolute h-px w-px opacity-0"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="p-3">No</th>
                      <th className="p-3">Job Number</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Item</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">VAT</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">PPH 23</th>
                      <th className="p-3 text-right">PPH 21</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paymentFormVoucher.items.map((item, index) => (
                      <tr key={item.id} className="bg-white hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-500">{index + 1}</td>
                        <td className="p-3 text-slate-800">{item.jobNumber}</td>
                        <td className="p-3 text-slate-800">{item.customerName}</td>
                        <td className="p-3 text-slate-800">{item.itemService}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{money(item.amount)}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{money(item.vatAmount)}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{money(item.total)}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{money(item.pph23Amount)}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{money(item.pph21Amount)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{money(item.paidAmount)}</td>
                        <td className="p-3 text-right">
                          <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">{item.pph21Applied ? 'Paid' : 'Unpaid'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Manual surcharge
                  <input
                    type="number"
                    placeholder="Masukkan nominal"
                    value={manualSurcharge}
                    onChange={(e) => setManualSurcharge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-400"
                  />
                </label>

                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Description
                  <input
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-400"
                  />
                </label>
              </div>

              <div className="border-t border-slate-200 bg-white p-4">
                <div className="ml-auto max-w-sm space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span className="font-mono font-semibold">{money(itemTotals.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Surcharge</span>
                    <span className="font-mono font-semibold">{money(itemTotals.surcharge)}</span>
                  </div>
                  <div className="flex items-center justify-between text-rose-600">
                    <span>PPH 23</span>
                    <span className="font-mono font-semibold">{money(itemTotals.pph23)}</span>
                  </div>
                  <div className="flex items-center justify-between text-rose-600">
                    <span>PPH 21</span>
                    <span className="font-mono font-semibold">{money(itemTotals.pph21)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-900">
                    <span>Total Payment</span>
                    <span className="font-mono">{money(itemTotals.totalPayment)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Pilih Rekening Pembayaran</div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Options Used
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400"
                  >
                    <option value="">Pilih Rekening...</option>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.bankName}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Payment Method
                  <input value="Bank Transfer" readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" />
                </label>

                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Bank
                  <input value={selectedBank?.bankName || ''} readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" />
                </label>

                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  A/C Name
                  <input value={selectedBank?.accountName || ''} readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" />
                </label>

                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  A/C Number
                  <input value={selectedBank?.accountNumber || ''} readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-800" />
                </label>

                <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Branch
                  <input value={selectedBank?.branch || ''} readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
              <button type="button" onClick={handleOpenInvoiceView} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100">
                Cetak / PDF
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!paymentFormVoucher) return;
                  if (!window.confirm(`Tandai voucher ${paymentFormVoucher.requestNumber} sebagai sudah dibayar?`)) return;
                  setError('');
                  try {
                    await db.payPaymentVoucher(paymentFormVoucher.id, payer);
                    setPaymentFormVoucherId(null);
                  } catch (payError) {
                    setError(payError instanceof Error ? payError.message : 'Gagal memproses pembayaran.');
                  }
                }}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Konfirmasi Proses
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Finance</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Accounts Payable</h1>
            <p className="text-xs text-slate-500">Pengajuan pembayaran vendor yang sudah disetujui Manager.</p>
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

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor request, vendor, JOB, customer..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
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
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-center">Aksi</th>
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
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
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
                      <td className="p-3.5">
                        {voucher.status === 'PAID' ? (
                          <div>
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Dibayar</span>
                            <div className="mt-1 text-[10px] text-slate-500">{voucher.paidAt ? formatDate(voucher.paidAt) : ''}</div>
                          </div>
                        ) : (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Menunggu Pembayaran</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {voucher.status === 'APPROVED' && (
                            <button type="button" onClick={() => setPaymentFormVoucherId(voucher.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">
                              Bayar
                            </button>
                          )}
                          <button type="button" title="Lihat Voucher (Cetak/PDF)" onClick={() => setError(printPaymentVoucher({ ...voucher, signerName: voucher.reviewedBy, paidBy: voucher.paidBy || payer, includeFinancePrintDetails: true }) || '')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600">
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/60">
                        <td />
                        <td colSpan={11} className="p-3.5">
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
                <tr><td colSpan={13} className="p-6 text-center text-slate-400">Belum ada data pengajuan pembayaran.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Eye, Receipt, Search } from 'lucide-react';
import { BankAccount, PaymentVoucher } from '../../types';
import { db } from '../../db/storage';
import { printPaymentReceipt, printPaymentVoucher } from '../../utils/voucherPrint';

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
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      setError('Popup diblokir; buka kembali dan lanjutkan dengan form ini.');
      return;
    }

    const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const senderBank = selectedBank || null;
    const items = paymentFormVoucher.items.map((item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.jobNumber)}</td>
        <td>${escapeHtml(item.customerName)}</td>
        <td>${escapeHtml(item.itemService)}</td>
        <td class="amount">${money(item.amount)}</td>
        <td class="amount">${money(item.vatAmount)}</td>
        <td class="amount">${money(item.total)}</td>
        <td class="amount">${money(item.pph23Amount)}</td>
        <td class="amount">${money(item.pph21Amount)}</td>
        <td class="amount">${money(item.paidAmount)}</td>
      </tr>
    `).join('');
    const body = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Payment Voucher ${escapeHtml(paymentFormVoucher.requestNumber)}</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; color: #172033; font-size: 11px; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #315db2; padding-bottom: 12px; }
            .brand { display: flex; align-items: center; gap: 12px; }
            .logo { width: 68px; height: 54px; object-fit: contain; }
            .company { color: #3562a8; font-size: 18px; font-weight: 700; }
            .tagline { color: #64748b; font-size: 10px; margin-top: 4px; }
            .doc-type { color: #315db2; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-align: right; }
            h1 { color: #172033; font-size: 20px; margin: 20px 0 4px; text-align: center; }
            .subtitle { color: #64748b; font-size: 10px; margin-bottom: 18px; text-align: center; }
            .meta { border-collapse: collapse; width: 100%; }
            .meta td { padding: 5px 7px; vertical-align: top; }
            .meta .label { color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; width: 17%; }
            .meta .value { font-weight: 600; width: 33%; }
            .description { background: #f1f5f9; border-left: 3px solid #315db2; margin-top: 12px; padding: 9px 11px; }
            .section-title { color: #315db2; font-size: 10px; font-weight: 700; letter-spacing: .5px; margin: 18px 0 7px; text-transform: uppercase; }
            table.items { border-collapse: collapse; margin-top: 8px; table-layout: fixed; width: 100%; }
            .items th, .items td { border: 1px solid #cbd5e1; padding: 3px 2px; overflow-wrap: anywhere; }
            .items th { background: #e8ecf2; color: #334155; font-size: 6px; text-align: center; text-transform: uppercase; }
            .items td { font-size: 7px; }
            .items th:nth-child(1), .items td:nth-child(1) { width: 3%; }
            .items th:nth-child(2), .items td:nth-child(2) { width: 9%; }
            .items th:nth-child(3), .items td:nth-child(3) { width: 14%; }
            .items th:nth-child(4), .items td:nth-child(4) { width: 20%; }
            .items th:nth-child(n+5), .items td:nth-child(n+5) { width: 9%; }
            .center { text-align: center; }.amount { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
            .muted { color: #64748b; font-size: 8px; }
            .lower { display: flex; gap: 18px; margin-top: 15px; }
            .bank { background: #f8fafc; border: 1px solid #cbd5e1; flex: 1; padding: 10px; }
            .bank-title { color: #315db2; font-size: 9px; font-weight: 700; margin-bottom: 7px; text-transform: uppercase; }
            .bank-line { margin: 4px 0; }.bank-line b { display: inline-block; min-width: 82px; }
            .totals { border-collapse: collapse; width: 42%; }
            .totals td { border-bottom: 1px solid #e2e8f0; padding: 5px 3px; }
            .totals td:last-child { font-variant-numeric: tabular-nums; text-align: right; }
            .totals .grand td { background: #182a50; border: 0; color: #fff; font-size: 11px; font-weight: 700; padding: 8px 6px; }
            .signatures { border-collapse: collapse; margin-top: 24px; page-break-inside: avoid; table-layout: fixed; width: 100%; }
            .signatures th, .signatures td { border: 1px solid #94a3b8; text-align: center; width: 33.33%; }
            .signatures th { background: #f1f5f9; color: #334155; font-size: 9px; height: 26px; padding: 6px; text-transform: uppercase; }
            .signatures .signature-space td { height: 72px; padding: 6px; vertical-align: bottom; }
            .signature-line { border-top: 1px solid #64748b; display: block; margin: 0 auto 3px; width: 72%; }
            .signatures .name td { font-size: 9px; font-weight: 600; height: 26px; padding: 6px; }
            .watermark { bottom: 5mm; color: #94a3b8; font-size: 8px; left: 0; position: fixed; right: 0; text-align: center; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <header class="header">
            <div class="brand"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="Logo PT Lentera Global Maritim" /><div><div class="company">PT Lentera Global Maritim</div><div class="tagline">Seamless Agent, Global Reach</div></div></div>
            <div class="doc-type">FINANCE<br />ACCOUNTS PAYABLE</div>
          </header>
          <h1>PAYMENT VOUCHER</h1>
          <div class="subtitle">Dokumen permohonan pembayaran vendor</div>
          <table class="meta"><tbody>
            <tr><td class="label">Voucher Number</td><td class="value">${escapeHtml(voucherNumber)}</td><td class="label">Request Number</td><td class="value">${escapeHtml(paymentFormVoucher.requestNumber)}</td></tr>
            <tr><td class="label">Payment Date</td><td class="value">${escapeHtml(formatDisplayDate(paymentDate))}</td><td class="label">Vendor</td><td class="value">${escapeHtml(paymentFormVoucher.vendorName)}</td></tr>
            <tr><td class="label">Paid To</td><td class="value">${escapeHtml(paymentFormVoucher.paidTo || '-')}</td><td class="label">Bank</td><td class="value">${escapeHtml(paymentFormVoucher.bankName || '-')}</td></tr>
            <tr><td class="label">Request By</td><td class="value">${escapeHtml(paymentFormVoucher.requestBy || payer)}</td><td class="label">A/C Number</td><td class="value">${escapeHtml(paymentFormVoucher.accountNumber || '-')}</td></tr>
          </tbody></table>
          <div class="description"><b>Description:</b> ${escapeHtml(paymentDescription || paymentFormVoucher.requestNumber)}</div>
          <div class="section-title">Rincian Pembayaran</div>
          <table class="items"><thead><tr><th>No</th><th>JOB Number</th><th>${paymentFormVoucher.jobInfo === 'JOB_VESSEL' ? 'Vessel Name' : 'Customer'}</th><th>Item Service</th><th>Amount</th><th>VAT (11%)</th><th>Total</th><th>PPH 23 (2%)</th><th>PPH 21 (5%)</th><th>Paid Amount</th></tr></thead><tbody>${items}</tbody></table>
          <div class="lower">
            <section class="bank"><div class="bank-title">Bank Pengirim</div>
              <div class="bank-line"><b>Bank</b> ${escapeHtml(senderBank?.bankName || '-')}</div>
              <div class="bank-line"><b>Nama Rekening</b> ${escapeHtml(senderBank?.accountName || '-')}</div>
              <div class="bank-line"><b>No. Rekening</b> ${escapeHtml(senderBank?.accountNumber || '-')}</div>
              <div class="bank-line"><b>Cabang</b> ${escapeHtml(senderBank?.branch || '-')}</div>
            </section>
            <table class="totals"><tbody>
              <tr><td>Total</td><td>${money(itemTotals.total)}</td></tr>
              <tr><td>Subcharge</td><td>${money(itemTotals.surcharge)}</td></tr>
              <tr><td>PPH 23</td><td>${money(itemTotals.pph23)}</td></tr>
              <tr><td>PPH 21</td><td>${money(itemTotals.pph21)}</td></tr>
              <tr class="grand"><td>Total Payment</td><td>${money(itemTotals.totalPayment)}</td></tr>
            </tbody></table>
          </div>
          <table class="signatures"><thead><tr><th>Maker</th><th>Checker</th><th>Signer</th></tr></thead><tbody>
            <tr class="signature-space"><td><span class="signature-line"></span></td><td><span class="signature-line"></span></td><td><span class="signature-line"></span></td></tr>
            <tr class="name"><td>${escapeHtml(paymentFormVoucher.requestBy || payer)}</td><td>${escapeHtml(paymentFormVoucher.reviewedBy || '-')}</td><td>${escapeHtml(payer || '-')}</td></tr>
          </tbody></table>
          <div class="watermark">Dokumen asli dicetak dari sistem resmi PT Lentera Global Maritim.</div>
        </body>
      </html>
    `;
    printWindow.document.write(body);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
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
                          {voucher.status === 'PAID' && (
                            <button type="button" title="Cetak Kwitansi Pembayaran" aria-label={`Cetak kwitansi ${voucher.requestNumber}`} onClick={() => setError(printPaymentReceipt(voucher) || '')} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700">
                              <Receipt size={16} />
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

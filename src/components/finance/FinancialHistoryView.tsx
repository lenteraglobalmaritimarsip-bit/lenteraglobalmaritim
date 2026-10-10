import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { PaymentVoucher } from '../../types';

interface FinancialHistoryViewProps {
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

const formatDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const dateInputValue = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
};

const parseDateInput = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return '';
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return '';
  return `${year}-${month}-${day}`;
};

const sumItems = (voucher: PaymentVoucher) => {
  const items = voucher.items || [];
  const sum = (pick: (item: PaymentVoucher['items'][number]) => number) =>
    items.reduce((total, item) => total + (pick(item) || 0), 0);
  return {
    amount: sum((item) => item.amount),
    vat: sum((item) => item.vatAmount),
    total: sum((item) => item.total),
    pph23: sum((item) => item.pph23Amount),
    paid: voucher.totalPaidAmount ?? sum((item) => item.paidAmount),
  };
};

export const FinancialHistoryView: React.FC<FinancialHistoryViewProps> = ({ paymentVouchers }) => {
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const startDatePickerRef = useRef<HTMLInputElement>(null);
  const endDatePickerRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const startPaidDate = parseDateInput(startDateInput);
  const endPaidDate = parseDateInput(endDateInput);
  const invalidDateInput = Boolean((startDateInput && !startPaidDate) || (endDateInput && !endPaidDate));
  const invalidDateRange = Boolean(startPaidDate && endPaidDate && startPaidDate > endPaidDate);
  const invalidFilter = invalidDateInput || invalidDateRange;
  const updateScrollButtons = () => {
    const element = tableScrollRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 0);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  };
  const openDatePicker = (picker: HTMLInputElement | null) => {
    const datePicker = picker as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (datePicker?.showPicker) datePicker.showPicker();
    else datePicker?.click();
  };

  const rows = useMemo(
    () => invalidFilter ? [] : paymentVouchers
      .filter((voucher) => voucher.status === 'PAID' && Boolean(voucher.paidAt))
      .filter((voucher) => {
        const paidDate = String(voucher.paidAt).slice(0, 10);
        return (!startPaidDate || paidDate >= startPaidDate) && (!endPaidDate || paidDate <= endPaidDate);
      })
      .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)) || b.requestNumber.localeCompare(a.requestNumber))
      .map((voucher) => ({ voucher, sums: sumItems(voucher) })),
    [paymentVouchers, startPaidDate, endPaidDate, invalidFilter],
  );

  useEffect(() => {
    const element = tableScrollRef.current;
    if (!element) return;
    updateScrollButtons();
    element.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      element.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [rows.length]);

  const grand = rows.reduce(
    (acc, { sums }) => ({
      amount: acc.amount + sums.amount,
      vat: acc.vat + sums.vat,
      total: acc.total + sums.total,
      pph23: acc.pph23 + sums.pph23,
      paid: acc.paid + sums.paid,
    }),
    { amount: 0, vat: 0, total: 0, pph23: 0, paid: 0 },
  );

  const handleDownload = async () => {
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet('Laporan Keuangan');
    summary.addRow(['No', 'Voucher Number', 'Request Number', 'Date Request', 'Date Paid', 'Info JOB', 'Vendor Name', 'Paid To', 'Bank', 'A/C Number', 'Request By', 'Amount', 'PPN (VAT)', 'Total', 'PPH 23', 'Paid Amount']);
    rows.forEach(({ voucher, sums }, index) => {
      summary.addRow([
        index + 1, voucher.voucherNumber || '-', voucher.requestNumber, String(voucher.requestDate).slice(0, 10), voucher.paidAt ? String(voucher.paidAt).slice(0, 10) : '-',
        voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional',
        voucher.vendorName, voucher.paidTo, voucher.bankName, voucher.accountNumber, voucher.requestBy,
        sums.amount, sums.vat, sums.total, sums.pph23, sums.paid,
      ]);
    });
    summary.addRow(['', '', '', '', '', '', '', '', '', '', 'TOTAL', grand.amount, grand.vat, grand.total, grand.pph23, grand.paid]);

    const detail = workbook.addWorksheet('Detail Item');
    detail.addRow(['Voucher Number', 'Request Number', 'Date Request', 'Date Paid', 'Vendor Name', 'JOB Number', 'Customer', 'Item Service', 'Amount', 'PPN (VAT)', 'Total', 'PPH 23', 'Paid Amount']);
    rows.forEach(({ voucher }) => {
      (voucher.items || []).forEach((item) => {
        detail.addRow([
          voucher.voucherNumber || '-', voucher.requestNumber, String(voucher.requestDate).slice(0, 10), voucher.paidAt ? String(voucher.paidAt).slice(0, 10) : '-', voucher.vendorName,
          item.jobNumber, item.customerName, item.itemService,
          item.amount, item.vatAmount, item.total, item.pph23Amount, item.paidAmount,
        ]);
      });
    });

    [summary, detail].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => { column.width = 18; });
    });
    summary.lastRow!.font = { bold: true };
    summary.getColumn(12).numFmt = summary.getColumn(13).numFmt = summary.getColumn(14).numFmt =
      summary.getColumn(15).numFmt = summary.getColumn(16).numFmt = '#,##0.00';
    [9, 10, 11, 12, 13, 14].forEach((col) => { detail.getColumn(col).numFmt = '#,##0.00'; });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateRange = startPaidDate || endPaidDate
      ? `${startPaidDate || 'awal'}-${endPaidDate || 'akhir'}`
      : 'semua-tanggal';
    link.download = `history-laporan-keuangan-${dateRange}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500';
  const num = 'px-3 py-2 text-right font-mono text-xs';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Finance</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">History Laporan Keuangan</h1>
            <p className="text-xs text-slate-500">Rincian PPN dan PPH 23 per pengajuan pembayaran.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              START
              <span className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white pr-1">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  maxLength={10}
                  value={startDateInput}
                  onChange={(event) => setStartDateInput(formatDateInput(event.target.value))}
                  className="min-w-0 rounded-xl bg-transparent px-3 py-2 text-xs font-semibold normal-case text-slate-700 outline-none"
                />
                <input
                  ref={startDatePickerRef}
                  type="date"
                  value={startPaidDate}
                  onChange={(event) => setStartDateInput(dateInputValue(event.target.value))}
                  aria-label="Pilih tanggal awal"
                  tabIndex={-1}
                  className="pointer-events-none absolute h-px w-px opacity-0"
                />
                <button type="button" onClick={() => openDatePicker(startDatePickerRef.current)} aria-label="Buka kalender tanggal awal" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                  <CalendarDays size={15} />
                </button>
              </span>
            </label>
            <label className="relative grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              END
              <span className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white pr-1">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  maxLength={10}
                  value={endDateInput}
                  onChange={(event) => setEndDateInput(formatDateInput(event.target.value))}
                  className="min-w-0 rounded-xl bg-transparent px-3 py-2 text-xs font-semibold normal-case text-slate-700 outline-none"
                />
                <input
                  ref={endDatePickerRef}
                  type="date"
                  value={endPaidDate}
                  onChange={(event) => setEndDateInput(dateInputValue(event.target.value))}
                  aria-label="Pilih tanggal akhir"
                  tabIndex={-1}
                  className="pointer-events-none absolute h-px w-px opacity-0"
                />
                <button type="button" onClick={() => openDatePicker(endDatePickerRef.current)} aria-label="Buka kalender tanggal akhir" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                  <CalendarDays size={15} />
                </button>
              </span>
            </label>
            <button
              type="button"
              onClick={handleDownload}
              disabled={rows.length === 0 || invalidFilter}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={14} /> Download Excel
            </button>
          </div>
        </div>
        {invalidDateInput && <p className="mt-3 text-xs font-semibold text-rose-600">Tanggal harus valid dengan format dd/mm/yyyy.</p>}
        {!invalidDateInput && invalidDateRange && <p className="mt-3 text-xs font-semibold text-rose-600">START harus sebelum atau sama dengan END.</p>}
      </div>

      <style>{`.finance-history-scroll{scrollbar-width:none;-ms-overflow-style:none}.finance-history-scroll::-webkit-scrollbar{display:none}`}</style>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex justify-end gap-1 border-b border-slate-100 px-3 py-2">
          <button
            type="button"
            title="Kolom sebelumnya"
            aria-label="Geser tabel ke kiri"
            disabled={!canScrollLeft}
            onClick={() => tableScrollRef.current?.scrollBy({ left: -420, behavior: 'smooth' })}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            title="Kolom berikutnya"
            aria-label="Geser tabel ke kanan"
            disabled={!canScrollRight}
            onClick={() => tableScrollRef.current?.scrollBy({ left: 420, behavior: 'smooth' })}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div ref={tableScrollRef} onScroll={updateScrollButtons} className="finance-history-scroll overflow-x-auto">
        <table className="w-full min-w-[1450px] text-left">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={th}>No</th>
              <th className={th}>Voucher Number</th>
              <th className={th}>Request Number</th>
              <th className={th}>Date Request</th>
              <th className={th}>Date Paid</th>
              <th className={th}>Vendor / Paid To</th>
              <th className={th}>Bank / A/C</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={`${th} text-right`}>PPN</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={`${th} text-right`}>PPH 23</th>
              <th className={`${th} text-right`}>Paid Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-xs text-slate-400">Belum ada transaksi dibayar pada rentang tanggal ini.</td></tr>
            )}
            {rows.map(({ voucher, sums }, index) => (
              <tr key={voucher.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs text-slate-500">{index + 1}</td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-slate-900">{voucher.voucherNumber || '-'}</td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-slate-900">{voucher.requestNumber}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{formatDate(voucher.requestDate)}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{formatDate(voucher.paidAt || '')}</td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  <div className="font-bold">{voucher.vendorName}</div>
                  <div className="text-slate-500">{voucher.paidTo}</div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  <div>{voucher.bankName}</div>
                  <div className="font-mono text-slate-500">{voucher.accountNumber}</div>
                </td>
                <td className={num}>{money(sums.amount)}</td>
                <td className={num}>{money(sums.vat)}</td>
                <td className={num}>{money(sums.total)}</td>
                <td className={num}>{money(sums.pph23)}</td>
                <td className={`${num} font-black text-slate-900`}>{money(sums.paid)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Total</td>
                <td className={`${num} font-bold`}>{money(grand.amount)}</td>
                <td className={`${num} font-bold`}>{money(grand.vat)}</td>
                <td className={`${num} font-bold`}>{money(grand.total)}</td>
                <td className={`${num} font-bold`}>{money(grand.pph23)}</td>
                <td className={`${num} font-black text-slate-900`}>{money(grand.paid)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
};

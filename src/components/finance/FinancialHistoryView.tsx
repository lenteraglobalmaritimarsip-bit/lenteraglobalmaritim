import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
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

const monthLabel = (key: string) => {
  const date = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
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
    pph21: sum((item) => item.pph21Amount),
    paid: voucher.totalPaidAmount ?? sum((item) => item.paidAmount),
  };
};

export const FinancialHistoryView: React.FC<FinancialHistoryViewProps> = ({ paymentVouchers }) => {
  const [month, setMonth] = useState('ALL');

  const months = useMemo(
    () => Array.from(new Set(paymentVouchers.map((voucher) => String(voucher.requestDate).slice(0, 7)).filter(Boolean))).sort().reverse(),
    [paymentVouchers],
  );

  const rows = useMemo(
    () => [...paymentVouchers]
      .filter((voucher) => month === 'ALL' || String(voucher.requestDate).slice(0, 7) === month)
      .sort((a, b) => String(b.requestDate).localeCompare(String(a.requestDate)) || b.requestNumber.localeCompare(a.requestNumber))
      .map((voucher) => ({ voucher, sums: sumItems(voucher) })),
    [paymentVouchers, month],
  );

  const grand = rows.reduce(
    (acc, { sums }) => ({
      amount: acc.amount + sums.amount,
      vat: acc.vat + sums.vat,
      total: acc.total + sums.total,
      pph23: acc.pph23 + sums.pph23,
      pph21: acc.pph21 + sums.pph21,
      paid: acc.paid + sums.paid,
    }),
    { amount: 0, vat: 0, total: 0, pph23: 0, pph21: 0, paid: 0 },
  );

  const handleDownload = async () => {
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet('Laporan Keuangan');
    summary.addRow(['No', 'Request Number', 'Request Date', 'Info JOB', 'Vendor Name', 'Paid To', 'Bank', 'A/C Number', 'Request By', 'Amount', 'PPN (VAT)', 'Total', 'PPH 23', 'PPH 21', 'Paid Amount']);
    rows.forEach(({ voucher, sums }, index) => {
      summary.addRow([
        index + 1, voucher.requestNumber, String(voucher.requestDate).slice(0, 10),
        voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional',
        voucher.vendorName, voucher.paidTo, voucher.bankName, voucher.accountNumber, voucher.requestBy,
        sums.amount, sums.vat, sums.total, sums.pph23, sums.pph21, sums.paid,
      ]);
    });
    summary.addRow(['', '', '', '', '', '', '', '', 'TOTAL', grand.amount, grand.vat, grand.total, grand.pph23, grand.pph21, grand.paid]);

    const detail = workbook.addWorksheet('Detail Item');
    detail.addRow(['Request Number', 'Request Date', 'Vendor Name', 'JOB Number', 'Customer', 'Item Service', 'Amount', 'PPN (VAT)', 'Total', 'PPH 23', 'PPH 21', 'Paid Amount']);
    rows.forEach(({ voucher }) => {
      (voucher.items || []).forEach((item) => {
        detail.addRow([
          voucher.requestNumber, String(voucher.requestDate).slice(0, 10), voucher.vendorName,
          item.jobNumber, item.customerName, item.itemService,
          item.amount, item.vatAmount, item.total, item.pph23Amount, item.pph21Amount, item.paidAmount,
        ]);
      });
    });

    [summary, detail].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => { column.width = 18; });
    });
    summary.lastRow!.font = { bold: true };
    summary.getColumn(10).numFmt = summary.getColumn(11).numFmt = summary.getColumn(12).numFmt =
      summary.getColumn(13).numFmt = summary.getColumn(14).numFmt = summary.getColumn(15).numFmt = '#,##0.00';
    [7, 8, 9, 10, 11, 12].forEach((col) => { detail.getColumn(col).numFmt = '#,##0.00'; });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `history-laporan-keuangan-${month === 'ALL' ? 'semua-bulan' : month}.xlsx`;
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
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Finance</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">History Laporan Keuangan</h1>
            <p className="text-xs text-slate-500">Rincian PPN dan PPH per pengajuan pembayaran.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="ALL">Semua Bulan</option>
              {months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
            </select>
            <button
              type="button"
              onClick={handleDownload}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={14} /> Download Excel
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] text-left">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={th}>No</th>
              <th className={th}>Request Number</th>
              <th className={th}>Date</th>
              <th className={th}>Vendor / Paid To</th>
              <th className={th}>Bank / A/C</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={`${th} text-right`}>PPN</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={`${th} text-right`}>PPH 23</th>
              <th className={`${th} text-right`}>PPH 21</th>
              <th className={`${th} text-right`}>Paid Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-10 text-center text-xs text-slate-400">Belum ada data pada periode ini.</td></tr>
            )}
            {rows.map(({ voucher, sums }, index) => (
              <tr key={voucher.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs text-slate-500">{index + 1}</td>
                <td className="px-3 py-2 font-mono text-xs font-bold text-slate-900">{voucher.requestNumber}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{formatDate(voucher.requestDate)}</td>
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
                <td className={num}>{money(sums.pph21)}</td>
                <td className={`${num} font-black text-slate-900`}>{money(sums.paid)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Total</td>
                <td className={`${num} font-bold`}>{money(grand.amount)}</td>
                <td className={`${num} font-bold`}>{money(grand.vat)}</td>
                <td className={`${num} font-bold`}>{money(grand.total)}</td>
                <td className={`${num} font-bold`}>{money(grand.pph23)}</td>
                <td className={`${num} font-bold`}>{money(grand.pph21)}</td>
                <td className={`${num} font-black text-slate-900`}>{money(grand.paid)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

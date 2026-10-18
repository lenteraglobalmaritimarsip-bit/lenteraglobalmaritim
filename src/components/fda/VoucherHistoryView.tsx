import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Printer, Search } from 'lucide-react';
import ExcelJS from 'exceljs';
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
  PROCESS: { label: 'Terkirim ke Manager', className: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Ditolak', className: 'bg-rose-50 text-rose-700' },
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const VoucherHistoryView: React.FC<VoucherHistoryViewProps> = ({ paymentVouchers }) => {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate);

  const counts = useMemo(() => ({
    PROCESS: paymentVouchers.filter((v) => statusGroup(v) === 'PROCESS').length,
    APPROVED: paymentVouchers.filter((v) => statusGroup(v) === 'APPROVED').length,
    REJECTED: paymentVouchers.filter((v) => statusGroup(v) === 'REJECTED').length,
  }), [paymentVouchers]);

  const vouchers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (invalidDateRange ? [] : [...paymentVouchers])
      .filter((voucher) => filter === 'ALL' || statusGroup(voucher) === filter)
      .filter((voucher) => {
        const requestDate = String(voucher.requestDate || '').slice(0, 10);
        return (!startDate || requestDate >= startDate) && (!endDate || requestDate <= endDate);
      })
      .filter((voucher) => !query || [voucher.requestNumber, voucher.vendorName, voucher.paidTo, voucher.requestBy]
        .join(' ').toLowerCase().includes(query))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [paymentVouchers, filter, searchQuery, startDate, endDate, invalidDateRange]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(vouchers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageGroupStart = Math.floor((currentPage - 1) / 10) * 10 + 1;
  const pageGroupEnd = Math.min(pageGroupStart + 9, pageCount);
  const paginatedVouchers = vouchers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: `Semua (${paymentVouchers.length})` },
    { key: 'APPROVED', label: `Disetujui (${counts.APPROVED})` },
    { key: 'REJECTED', label: `Ditolak (${counts.REJECTED})` },
  ];

  const handleDownload = async () => {
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet('History Request');
    summary.addRow(['No', 'Request Number', 'Request Date', 'Info JOB', 'JOB Number', 'Vendor', 'Paid To', 'Request By', 'Paid Amount', 'Status']);
    vouchers.forEach((voucher, index) => summary.addRow([
      index + 1,
      voucher.requestNumber,
      String(voucher.requestDate || '').slice(0, 10),
      voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional',
      [...new Set((voucher.items || []).map((item) => item.jobNumber.trim()).filter(Boolean))].join(', ') || '-',
      voucher.vendorName,
      voucher.paidTo,
      voucher.requestBy,
      voucher.totalPaidAmount,
      badges[statusGroup(voucher)].label,
    ]));
    const details = workbook.addWorksheet('Detail Item');
    details.addRow(['Request Number', 'JOB Number', 'Customer / Vessel', 'Item Service', 'Amount', 'VAT', 'Total', 'PPH 23', 'Paid Amount']);
    vouchers.forEach((voucher) => (voucher.items || []).forEach((item) => details.addRow([
      voucher.requestNumber, item.jobNumber, item.customerName, item.itemService,
      item.amount, item.vatAmount, item.total, item.pph23Amount, item.paidAmount,
    ])));
    [summary, details].forEach((worksheet) => {
      worksheet.getRow(1).font = { bold: true };
      worksheet.columns.forEach((column) => { column.width = 18; });
    });
    [9].forEach((column) => { summary.getColumn(column).numFmt = '#,##0.00'; });
    [5, 6, 7, 8, 9].forEach((column) => { details.getColumn(column).numFmt = '#,##0.00'; });
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `history-request-payment-${startDate || 'awal'}-${endDate || 'akhir'}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const summaryRows = vouchers.map((voucher) => `<tr><td>${escapeHtml(voucher.requestNumber)}</td><td>${escapeHtml(formatDate(voucher.requestDate))}</td><td>${voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional'}</td><td>${escapeHtml([...new Set((voucher.items || []).map((item) => item.jobNumber.trim()).filter(Boolean))].join(', ') || '-')}</td><td>${escapeHtml(voucher.vendorName)}</td><td>${escapeHtml(voucher.paidTo)}</td><td>${escapeHtml(voucher.requestBy)}</td><td>${escapeHtml(money(voucher.totalPaidAmount))}</td><td>${escapeHtml(badges[statusGroup(voucher)].label)}</td></tr>`).join('');
    const detailRows = vouchers.flatMap((voucher) => (voucher.items || []).map((item) => `<tr><td>${escapeHtml(voucher.requestNumber)}</td><td>${escapeHtml(item.jobNumber)}</td><td>${escapeHtml(item.customerName)}</td><td>${escapeHtml(item.itemService)}</td><td>${escapeHtml(money(item.amount))}</td><td>${escapeHtml(money(item.vatAmount))}</td><td>${escapeHtml(money(item.total))}</td><td>${escapeHtml(money(item.pph23Amount))}</td><td>${escapeHtml(money(item.paidAmount))}</td></tr>`)).join('');
    const range = `${startDate || 'Awal'} - ${endDate || 'Akhir'}`;
    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>History Request Payment</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;margin:0}h1{font-size:18px;margin:0 0 4px}h2{font-size:12px;margin:18px 0 6px}p{font-size:10px;color:#64748b;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#eef3f9;text-align:left;padding:5px;border:1px solid #d5deea}td{padding:5px;border:1px solid #dfe6ef;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even){background:#fafcff}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>History Request Payment</h1><p>Periode Request Date: ${escapeHtml(range)} · ${vouchers.length} voucher</p><table><thead><tr><th>Request Number</th><th>Request Date</th><th>Info JOB</th><th>JOB Number</th><th>Vendor</th><th>Paid To</th><th>Request By</th><th>Paid Amount</th><th>Status</th></tr></thead><tbody>${summaryRows || '<tr><td colspan="9">Tidak ada data pada periode ini.</td></tr>'}</tbody></table><h2>Detail Item</h2><table><thead><tr><th>Request Number</th><th>JOB Number</th><th>Customer / Vessel</th><th>Item Service</th><th>Amount</th><th>VAT</th><th>Total</th><th>PPH 23</th><th>Paid Amount</th></tr></thead><tbody>${detailRows || '<tr><td colspan="9">Tidak ada rincian item.</td></tr>'}</tbody></table><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    printWindow.document.close();
  };

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
                onClick={() => {
                  setFilter(tab.key);
                  setPage(1);
                  setExpandedId(null);
                }}
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
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
                setExpandedId(null);
              }}
              placeholder="Cari nomor / vendor..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs lg:w-64"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">START
              <input type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); setExpandedId(null); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold normal-case text-slate-700" />
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">END
              <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); setExpandedId(null); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold normal-case text-slate-700" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleDownload()} disabled={!vouchers.length || invalidDateRange} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Download size={14} /> Download Excel</button>
            <button type="button" onClick={handlePrint} disabled={invalidDateRange} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer size={14} /> Cetak / PDF</button>
          </div>
          {invalidDateRange && <p role="alert" className="w-full text-xs font-semibold text-rose-600">START harus sebelum atau sama dengan END.</p>}
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
            {paginatedVouchers.map((voucher, index) => {
              const group = statusGroup(voucher);
              const badge = badges[group];
              const expanded = expandedId === voucher.id;
              return (
                <React.Fragment key={voucher.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expanded ? null : voucher.id)}>
                    <td className="p-3 text-slate-500">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="p-3 font-mono text-slate-500">{(currentPage - 1) * pageSize + index + 1}</td>
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
                              <th className="p-2 text-right">PPH 23</th><th className="p-2 text-right">Paid Amount</th>
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
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => {
            setPage((value) => Math.max(1, value - 1));
            setExpandedId(null);
          }}
          disabled={currentPage === 1}
          className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>
        {Array.from({ length: pageGroupEnd - pageGroupStart + 1 }, (_, index) => pageGroupStart + index).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => {
              setPage(pageNumber);
              setExpandedId(null);
            }}
            aria-current={currentPage === pageNumber ? 'page' : undefined}
            className={`rounded border px-3 py-1.5 text-xs ${
              currentPage === pageNumber
                ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setPage((value) => Math.min(pageCount, value + 1));
            setExpandedId(null);
          }}
          disabled={currentPage === pageCount}
          className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

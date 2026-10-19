import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Ship, TrendingUp, Wallet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { JobCall, PaymentVoucher, User } from '../../types';
import { isInquiryDateInRange } from '../../utils/date';
import { InquiryDateRangePicker, InquiryDateRange } from '../shared/InquiryDateRangePicker';
import { ApprovedSalesPdaTotal, listApprovedFdaPdaTotals } from '../../lib/api';

interface ManagementVesselViewProps {
  jobCalls: JobCall[];
  users: User[];
  paymentVouchers: PaymentVoucher[];
}

interface ManagementRow {
  job: JobCall;
  branch: string;
  status: string;
  billedIDR: number;
  vendorCostIDR: number;
  netProfitIDR: number;
}

const formatIDR = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

const getExchangeRate = (job: JobCall) =>
  Number(job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800);

const getBilledToPrincipalIDR = (job: JobCall, fpdaTotalIDR: number) => {
  const rate = getExchangeRate(job);
  const billed = Number(job.fda?.finalBilledToPrincipal || 0);
  if (billed > 0) {
    return ((job.fda?.currency || job.currency) === 'USD' ? billed * rate : billed) + fpdaTotalIDR;
  }

  const invoice = job.principalInvoice;
  if (Number(invoice?.totalAmountIDR || 0) > 0) return Number(invoice.totalAmountIDR) + fpdaTotalIDR;
  if (Number(invoice?.totalAmountUSD || 0) > 0) return Number(invoice.totalAmountUSD) * rate + fpdaTotalIDR;
  return fpdaTotalIDR;
};

const getBranch = (job: JobCall, users: User[]) => {
  const inquiry = job.inquiry;
  const user = users.find((item) =>
    item.id === inquiry?.createdByUserId
    || item.name === inquiry?.createdBy
    || item.username === inquiry?.createdBy
  );
  return user?.branch || inquiry?.createdByBranch || 'Head Office';
};

const getJobPosition = (job: JobCall) => {
  if (job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') return 'Closed';
  if (job.fda?.approvalStatus === 'SUBMITTED' && !job.fda.fdaApproved) return 'Menunggu Approval FDA Manager';
  if (job.fda?.fdaApproved || job.fda?.approvalStatus === 'APPROVED') return 'Finance - Invoice / AP / AR';
  if (job.fda?.approvalStatus === 'REJECTED') return 'Revisi FDA oleh FDA';
  if (job.managerApproval?.status === 'APPROVED') return 'FDA - Amount';
  if (job.managerApproval?.status === 'REJECTED') return 'Revisi Quotation oleh Sales';
  if (job.quotation?.epda?.status === 'SUBMITTED') return 'Menunggu Approval Quotation';

  const stageLabels: Record<JobCall['currentStage'], string> = {
    INQUIRY: 'Inquiry',
    QUOTATION: 'Quotation EPDA',
    MANAGER_APPROVAL: 'Manager Approval',
    OPERATIONAL: 'Operasional',
    FDA: 'Finalisasi FDA',
    AP_AR: 'Finance - AP / AR',
    PRINCIPAL_INVOICE: 'Invoice Principal',
    CLOSED: 'Closed',
  };
  return stageLabels[job.currentStage] || job.status.replace(/_/g, ' ');
};

export const ManagementVesselView: React.FC<ManagementVesselViewProps> = ({ jobCalls, users, paymentVouchers }) => {
  const [dateRange, setDateRange] = useState<InquiryDateRange>({ from: '', to: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState('');
  const [approvedFpdaTotals, setApprovedFpdaTotals] = useState<ApprovedSalesPdaTotal[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listApprovedFdaPdaTotals()
      .then((totals) => { if (!cancelled) setApprovedFpdaTotals(totals); })
      .catch((error) => console.error('Approved FPDA totals failed to load:', error));
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo<ManagementRow[]>(() => {
    const keyword = search.trim().toLocaleLowerCase();
    const approvedVendorCosts = new Map<string, number>();
    const approvedFpdaTotalsByJob = new Map<string, number>(approvedFpdaTotals.map((fpda): [string, number] => [
      fpda.jobId,
      fpda.currency === 'USD' ? fpda.total * fpda.exchangeRate : fpda.total,
    ]));
    paymentVouchers.forEach((voucher) => {
      if (
        voucher.jobInfo !== 'JOB_VESSEL'
        || (voucher.status !== 'APPROVED' && voucher.status !== 'PAID')
      ) return;
      voucher.items.forEach((item) => {
        const jobId = item.jobNumber.trim();
        if (!jobId) return;
        approvedVendorCosts.set(
          jobId,
          (approvedVendorCosts.get(jobId) || 0) + Number(item.paidAmount || 0),
        );
      });
    });

    return jobCalls
      .filter((job) => {
        if (!isInquiryDateInRange(job.inquiry?.date, dateRange.from, dateRange.to)) return false;
        if (!keyword) return true;
        const branch = getBranch(job, users);
        return [job.jobId, job.vesselName, branch].some((value) =>
          String(value || '').toLocaleLowerCase().includes(keyword),
        );
      })
      .sort((first, second) => second.jobId.localeCompare(first.jobId, undefined, { numeric: true }))
      .map((job) => {
        const fdaApproved = Boolean(job.fda?.fdaApproved || job.fda?.approvalStatus === 'APPROVED');
        const fpdaTotalIDR = fdaApproved ? approvedFpdaTotalsByJob.get(job.jobId) || 0 : 0;
        const billedIDR = getBilledToPrincipalIDR(job, fpdaTotalIDR);
        const vendorCostIDR = approvedVendorCosts.get(job.jobId) || 0;
        return {
          job,
          branch: getBranch(job, users),
          status: getJobPosition(job),
          billedIDR,
          vendorCostIDR,
          netProfitIDR: billedIDR - vendorCostIDR,
        };
      });
  }, [approvedFpdaTotals, dateRange, jobCalls, paymentVouchers, search, users]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageGroupStart = Math.floor((currentPage - 1) / 10) * 10 + 1;
  const pageGroupEnd = Math.min(pageGroupStart + 9, pageCount);
  const paginatedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totals = rows.reduce(
    (result, row) => ({
      billedIDR: result.billedIDR + row.billedIDR,
      vendorCostIDR: result.vendorCostIDR + row.vendorCostIDR,
      netProfitIDR: result.netProfitIDR + row.netProfitIDR,
    }),
    { billedIDR: 0, vendorCostIDR: 0, netProfitIDR: 0 },
  );

  const handleDownload = async () => {
    setDownloadError('');
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Management Vessel');
      sheet.addRow(['No', 'Job Vessel', 'Branch', 'Status', 'Tagihan Principal (FDA)', 'Biaya Vendor Riil', 'Net Profit Margin']);
      rows.forEach((row, index) => {
        sheet.addRow([
          index + 1,
          `${row.job.jobId} - ${row.job.vesselName}`,
          row.branch,
          row.status,
          row.billedIDR,
          row.vendorCostIDR,
          row.netProfitIDR,
        ]);
      });
      sheet.addRow(['', '', '', 'TOTAL', totals.billedIDR, totals.vendorCostIDR, totals.netProfitIDR]);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
      sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
      sheet.autoFilter = { from: 'A1', to: `G${Math.max(1, rows.length + 1)}` };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      [8, 30, 22, 34, 25, 25, 25].forEach((width, index) => {
        sheet.getColumn(index + 1).width = width;
      });
      [5, 6, 7].forEach((column) => {
        sheet.getColumn(column).numFmt = '"Rp" #,##0;[Red]-"Rp" #,##0';
      });
      sheet.lastRow!.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `management-vessel-${dateRange.from || 'awal'}-${dateRange.to || 'akhir'}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Management Vessel Excel export failed:', error);
      setDownloadError('Gagal membuat file Excel. Silakan coba lagi.');
    }
  };

  const cards = [
    { label: 'Total Tagihan ke Principal (FDA)', value: totals.billedIDR, icon: Wallet, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Total Biaya Vendor Riil (Modal)', value: totals.vendorCostIDR, icon: Ship, tone: 'text-amber-700 bg-amber-50' },
    { label: 'Net Profit Margin', value: totals.netProfitIDR, icon: TrendingUp, tone: totals.netProfitIDR < 0 ? 'text-rose-700 bg-rose-50' : 'text-emerald-700 bg-emerald-50' },
  ];

  const th = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500';
  const td = 'px-4 py-3 text-xs text-slate-700';
  const amount = 'px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800';

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Manager Operations</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Management Vessel</h1>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Cari job, vessel, branch..."
                className="w-64 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-blue-400"
              />
            </label>
            <InquiryDateRangePicker
              value={dateRange}
              onChange={(value) => {
                setDateRange(value);
                setPage(1);
              }}
              className="w-full sm:w-auto"
              variant="light"
            />
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} /> Download Excel
            </button>
          </div>
        </div>
        {downloadError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{downloadError}</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-lg font-black text-slate-900">{formatIDR(value)}</p>
              </div>
              <span className={`rounded-xl p-2 ${tone}`}><Icon size={18} /></span>
            </div>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Detail Rincian</h2>
          <p className="mt-1 text-xs text-slate-500">{rows.length} Job/Vessel sesuai filter. Tagihan dikonversi ke IDR dengan kurs FDA/job; biaya vendor adalah Paid Amount voucher JOB Vessel yang disetujui dan belum dibayar.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={th}>No</th>
                <th className={th}>Job Vessel</th>
                <th className={th}>Branch</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Tagihan Principal (FDA)</th>
                <th className={`${th} text-right`}>Biaya Vendor Riil (Modal)</th>
                <th className={`${th} text-right`}>Net Profit Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-slate-400">Tidak ada data untuk pencarian atau periode ini.</td></tr>
              )}
              {paginatedRows.map((row, index) => (
                <tr key={row.job.jobId} className="hover:bg-slate-50/70">
                  <td className={td}>{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className={td}>
                    <div className="font-semibold text-slate-900">{row.job.jobId}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{row.job.vesselName}</div>
                  </td>
                  <td className={td}>{row.branch}</td>
                  <td className={td}>
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                      {row.status}
                    </span>
                  </td>
                  <td className={amount}>{formatIDR(row.billedIDR)}</td>
                  <td className={amount}>{formatIDR(row.vendorCostIDR)}</td>
                  <td className={`${amount} ${row.netProfitIDR < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatIDR(row.netProfitIDR)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td className={`${td} font-bold`} colSpan={4}>TOTAL</td>
                  <td className={`${amount} font-black`}>{formatIDR(totals.billedIDR)}</td>
                  <td className={`${amount} font-black`}>{formatIDR(totals.vendorCostIDR)}</td>
                  <td className={`${amount} font-black ${totals.netProfitIDR < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatIDR(totals.netProfitIDR)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </section>
        <div className="mt-3 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>
          {Array.from({ length: pageGroupEnd - pageGroupStart + 1 }, (_, index) => pageGroupStart + index).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => setPage(pageNumber)}
              aria-current={currentPage === pageNumber ? 'page' : undefined}
              className={`rounded border px-3 py-1.5 text-xs ${
                currentPage === pageNumber
                  ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-300'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage === pageCount}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
    </div>
  );
};

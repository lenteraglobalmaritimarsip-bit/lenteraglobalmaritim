import React, { useMemo, useState } from 'react';
import { Download, Search, Ship, TrendingUp, Wallet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { JobCall, PaymentVoucher, User } from '../../types';

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

const monthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const getExchangeRate = (job: JobCall) =>
  Number(job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800);

const getBilledToPrincipalIDR = (job: JobCall) => {
  const rate = getExchangeRate(job);
  const billed = Number(job.fda?.finalBilledToPrincipal || 0);
  if (billed > 0) {
    return (job.fda?.currency || job.currency) === 'USD' ? billed * rate : billed;
  }

  const invoice = job.principalInvoice;
  if (Number(invoice?.totalAmountIDR || 0) > 0) return Number(invoice.totalAmountIDR);
  if (Number(invoice?.totalAmountUSD || 0) > 0) return Number(invoice.totalAmountUSD) * rate;
  return 0;
};

const getBranch = (job: JobCall, users: User[]) => {
  const inquiry = job.inquiry;
  const user = users.find((item) =>
    item.id === inquiry?.createdByUserId
    || item.name === inquiry?.createdBy
    || item.username === inquiry?.createdBy
  );
  return user?.branch || inquiry?.createdByBranch || inquiry?.createdByBranchCode || 'Head Office';
};

const getJobPosition = (job: JobCall) => {
  if (job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') return 'Closed';
  if (job.fda?.approvalStatus === 'SUBMITTED' && !job.fda.fdaApproved) return 'Menunggu Approval FDA Manager';
  if (job.fda?.fdaApproved || job.fda?.approvalStatus === 'APPROVED') return 'Finance - Invoice / AP / AR';
  if (job.fda?.approvalStatus === 'REJECTED') return 'Revisi FDA oleh FDA';
  if (job.managerApproval?.status === 'APPROVED') return 'FDA - Actual Cost';
  if (job.managerApproval?.status === 'REJECTED') return 'Revisi Quotation oleh Sales';
  if (job.quotation?.epda?.status === 'SUBMITTED') return 'Menunggu Approval Quotation';

  const stageLabels: Record<JobCall['currentStage'], string> = {
    INQUIRY: 'Inquiry',
    QUOTATION: 'Quotation EPDA / PDA',
    MANAGER_APPROVAL: 'Manager Approval',
    OPERATIONAL: 'Operasional',
    ACTUAL_COST: 'Actual Cost',
    FDA: 'Finalisasi FDA',
    AP_AR: 'Finance - AP / AR',
    PRINCIPAL_INVOICE: 'Invoice Principal',
    CLOSED: 'Closed',
  };
  return stageLabels[job.currentStage] || job.status.replace(/_/g, ' ');
};

export const ManagementVesselView: React.FC<ManagementVesselViewProps> = ({ jobCalls, users, paymentVouchers }) => {
  const [month, setMonth] = useState('ALL');
  const [search, setSearch] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const months = useMemo(
    () => Array.from(new Set(
      jobCalls
        .map((job) => String(job.inquiry?.date || job.createdAt || '').slice(0, 7))
        .filter((value) => /^\d{4}-\d{2}$/.test(value)),
    )).sort().reverse(),
    [jobCalls],
  );

  const rows = useMemo<ManagementRow[]>(() => {
    const keyword = search.trim().toLocaleLowerCase();
    const approvedVendorCosts = new Map<string, number>();
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
        const dateMonth = String(job.inquiry?.date || job.createdAt || '').slice(0, 7);
        if (month !== 'ALL' && dateMonth !== month) return false;
        if (!keyword) return true;
        const branch = getBranch(job, users);
        return [job.jobId, job.vesselName, branch].some((value) =>
          String(value || '').toLocaleLowerCase().includes(keyword),
        );
      })
      .sort((first, second) =>
        String(second.inquiry?.date || second.createdAt || '').localeCompare(
          String(first.inquiry?.date || first.createdAt || ''),
        ),
      )
      .map((job) => {
        const billedIDR = getBilledToPrincipalIDR(job);
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
  }, [jobCalls, month, paymentVouchers, search, users]);

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
      link.download = `management-vessel-${month === 'ALL' ? 'semua-bulan' : month}.xlsx`;
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari job, vessel, branch..."
                className="w-64 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-blue-400"
              />
            </label>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              aria-label="Filter bulan"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="ALL">Semua Bulan</option>
              {months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
            </select>
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
              {rows.map((row, index) => (
                <tr key={row.job.jobId} className="hover:bg-slate-50/70">
                  <td className={td}>{index + 1}</td>
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
    </div>
  );
};

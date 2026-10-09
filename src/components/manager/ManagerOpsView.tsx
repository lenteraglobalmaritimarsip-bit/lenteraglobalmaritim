import React, { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Download,
  Ship,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  AlertTriangle,
  Building,
  DollarSign,
  Search,
} from 'lucide-react';
import { JobCall, ActiveTab, ExpensesItem, FixTariff, Vessel } from '../../types';
import { db } from '../../db/storage';
import { formatDateDisplay } from '../../utils/date';
import { formatCostCategoryLabel } from '../../utils/costCategories';
import { QuotesEPDAView } from '../sales/QuotesEPDAView';
import { FDAView } from '../fda/FDAView';

interface ManagerOpsViewProps {
  initialTab?: 'DASHBOARD' | 'QUOTES_VIEW' | 'APPROVAL';
  jobCalls: JobCall[];
  vessels?: Vessel[];
  users?: Array<{ id?: string; name?: string; branch?: string; username?: string; role?: string }>;
  fixTariffs: FixTariff[];
  expensesItems: ExpensesItem[];
  onSelectJob: (jobId: string) => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const ManagerOpsView: React.FC<ManagerOpsViewProps> = ({
  initialTab = 'DASHBOARD',
  jobCalls,
  vessels = [],
  users = [],
  fixTariffs,
  expensesItems,
  onSelectJob,
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'DASHBOARD' | 'QUOTES_VIEW' | 'APPROVAL'>(initialTab);
  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);
  const [search, setSearch] = useState('');
  const [reviewMonth, setReviewMonth] = useState('ALL');
  const [approvalNotes, setApprovalNotes] = useState<{ [key: string]: string }>({});
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [expandedDetailJobId, setExpandedDetailJobId] = useState<string | null>(null);
  const [expandedFDAApprovalJobId, setExpandedFDAApprovalJobId] = useState<string | null>(null);
  const [expandedQuoteDetail, setExpandedQuoteDetail] = useState<string | null>(null);

  const pendingApprovals = jobCalls.filter(
    (j) =>
      j.managerApproval.status !== 'APPROVED' &&
      j.quotation.epda.status === 'SUBMITTED'
  );
  const pendingFDAApprovals = jobCalls.filter((job) => job.fda?.approvalStatus === 'SUBMITTED' && !job.fda.fdaApproved);

  const approvedOrClosedJobs = jobCalls.filter((j) => j.managerApproval.status === 'APPROVED' || j.currentStage === 'CLOSED');
  const approvedFDAJobs = jobCalls.filter((job) => Boolean(job.fda?.fdaApproved || job.fda?.approvalStatus === 'APPROVED'));
  const isClosedJob = (job: JobCall) => job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED';
  const totalPrincipalBilledIDR = approvedFDAJobs.reduce((sum, job) => {
    const billed = job.fda?.finalBilledToPrincipal
      || job.principalInvoice?.totalAmountUSD
      || job.quotation?.pda?.totalSellRate
      || job.quotation?.epda?.totalSellRate
      || 0;
    const currency = job.fda?.currency || job.currency || 'IDR';
    const rate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    return sum + Math.round(currency === 'USD' ? billed * rate : billed);
  }, 0);
  const totalOutstandingIDR = approvedFDAJobs.reduce((sum, job) => {
    if (isClosedJob(job)) return sum;
    const billed = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || 0;
    const billedCurrency = job.fda?.currency || job.currency || 'IDR';
    const rate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    const billedIDR = billedCurrency === 'USD' ? billed * rate : billed;
    const receivedIDR = (job.principalReceipts || []).reduce((receiptSum, receipt) => {
      const receiptCurrency = receipt.currency || job.currency || 'IDR';
      return receiptSum + (receiptCurrency === 'USD' ? receipt.amount * rate : receipt.amount);
    }, 0);
    return sum + Math.max(0, billedIDR - receivedIDR);
  }, 0);
  const totalReceivedIDR = approvedFDAJobs.reduce((sum, job) => {
    const rate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    return sum + (job.principalReceipts || []).reduce((receiptSum, receipt) => {
      const receiptCurrency = receipt.currency || job.currency || 'IDR';
      return receiptSum + (receiptCurrency === 'USD' ? receipt.amount * rate : receipt.amount);
    }, 0);
  }, 0);
  const summaryCards = [
    { label: 'System Users', value: String(users.length), detail: 'Akun aktif dalam portal', tone: 'cyan' },
    { label: 'Sales Pipeline', value: `${jobCalls.filter((j) => j.quotation.epda.status === 'APPROVED' || j.quotation.pda.status === 'APPROVED').length} Jobs`, detail: 'Quote yang siap diproses', tone: 'amber' },
    { label: 'FDA Approved', value: `${approvedFDAJobs.length} Jobs`, detail: 'Final disbursement account', tone: 'emerald' },
    { label: 'Finance Outstanding', value: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalOutstandingIDR), detail: 'Belum diterima dari principal', tone: 'rose' },
  ];

  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const formatEPDAAmount = (val: number, currency: 'IDR' | 'USD' = 'USD') =>
    new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    }).format(val);
  const totalRevenuePipelineIDR = jobCalls.reduce((sum, job) => {
    if (job.managerApproval?.status !== 'APPROVED' || job.quotation?.epda?.status !== 'APPROVED') return sum;
    const amount = job.quotation?.epda?.totalBuyRate ?? job.quotation?.epda?.totalSellRate ?? 0;
    const currency = job.quotation?.epda?.currency || job.currency || 'IDR';
    const rate = job.quotation.epda.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    const normalizedAmount = currency === 'USD'
      ? Math.round((amount + Number.EPSILON) * 100) / 100
      : amount;
    return sum + (currency === 'USD' ? normalizedAmount * rate : normalizedAmount);
  }, 0);

  const formatEPDACategory = (category: string) => formatCostCategoryLabel(category);

  const resolveCreatedByMeta = (job: JobCall) => {
    const createdByUserId = job.inquiry?.createdByUserId;
    const createdByName = job.inquiry?.createdBy || '';
    const directMatch = users.find((u) => u.id === createdByUserId || u.name === createdByName || u.username === createdByName || createdByName.includes(u.name || ''));
    return {
      user: directMatch?.name || createdByName || 'Unknown User',
      branch: directMatch?.branch || job.inquiry?.createdByBranch || 'Head Office',
    };
  };

  const handleApprove = (jobId: string) => {
    const notes = approvalNotes[jobId] || 'Disetujui untuk pelaksanaan operasional kapal.';
    const result = db.approveJobQuote(jobId, 'Capt. Bambang Suryo (Manager Ops)', notes);
    setActionSuccess(result ? `Job ${jobId} berhasil disetujui! Status beralih ke FDA.` : 'Approval ditolak: EPDA harus SUBMITTED terlebih dahulu.');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleReject = (jobId: string) => {
    const notes = approvalNotes[jobId] || 'Margin komersial tidak mencukupi / revisi buy rate vendor.';
    db.rejectJobQuote(jobId, 'Capt. Bambang Suryo (Manager Ops)', notes);
    setActionSuccess(`Job ${jobId} dikembalikan ke Sales untuk revisi penawaran.`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleApproveFDA = (jobId: string) => {
    const notes = approvalNotes[`${jobId}:FDA`] || 'FDA disetujui untuk diteruskan ke Finance.';
    const result = db.approveFDA(jobId, 'Capt. Bambang Suryo (Manager Ops)', notes);
    setActionSuccess(result ? `FDA ${jobId} disetujui dan diteruskan ke Finance.` : 'Approval FDA gagal. Pastikan FDA sudah dikirim oleh tim FDA.');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleRejectFDA = (jobId: string) => {
    const notes = approvalNotes[`${jobId}:FDA`] || 'FDA dikembalikan ke FDA untuk revisi.';
    const result = db.rejectFDA(jobId, 'Capt. Bambang Suryo (Manager Ops)', notes);
    setActionSuccess(result ? `FDA ${jobId} dikembalikan ke tim FDA untuk revisi.` : 'FDA tidak dapat dikembalikan karena statusnya bukan SUBMITTED.');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const reviewMonths: string[] = Array.from(new Set<string>(jobCalls.map((job) => (job.inquiry?.date || '').slice(0, 7)).filter(Boolean))).sort().reverse();
  const filteredReviewJobs = jobCalls.filter((job) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = [job.jobId, job.vesselName, job.customerName, job.portName, job.quotation.epda.quoteNo, job.inquiry?.inquiryNo || '', job.inquiry?.createdBy || '']
      .join(' ').toLowerCase().includes(query);
    return matchesSearch && (reviewMonth === 'ALL' || (job.inquiry?.date || '').startsWith(reviewMonth));
  });
  const formatReviewMonth = (value: string) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(`${value}-01T00:00:00`));

  const downloadReviewReport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Quotes Review');
    const headers = [
      'Job Vessel', 'Tanggal Inquiry', 'Vessel', 'Customer', 'Port', 'No EPDA', 'No FDA', 'Branch',
      'ETA', 'ETD', 'GRT', 'Created By', 'Status', 'Total EPDA (USD)', 'Total EPDA (IDR)',
      'Total FDA (USD)', 'Total FDA (IDR)',
    ];
    const lastColumn = String.fromCharCode(64 + headers.length);

    worksheet.mergeCells(`A1:${lastColumn}1`);
    worksheet.getCell('A1').value = 'LAPORAN QUOTES REVIEW';
    worksheet.mergeCells(`A2:${lastColumn}2`);
    worksheet.getCell('A2').value = `Periode: ${reviewMonth === 'ALL' ? 'Semua Bulan' : formatReviewMonth(reviewMonth)}`;
    worksheet.addRow([]);
    worksheet.addRow(headers);
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];

    const headerRow = worksheet.getRow(4);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A5F' } };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    worksheet.autoFilter = { from: 'A4', to: `${lastColumn}${Math.max(4, filteredReviewJobs.length + 4)}` };
    worksheet.columns = [
      { width: 20 }, { width: 16 }, { width: 24 }, { width: 28 }, { width: 20 }, { width: 24 },
      { width: 24 }, { width: 22 }, { width: 21 }, { width: 21 }, { width: 14 }, { width: 28 },
      { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 },
    ];

    filteredReviewJobs.forEach((job) => {
      const creator = resolveCreatedByMeta(job);
      const vessel = vessels.find((item) => item.id === job.vesselId);
      const epdaTotals: Record<'USD' | 'IDR', number> = { USD: 0, IDR: 0 };
      job.quotation.epda.items.forEach((item) => {
        epdaTotals[item.currency || job.quotation.epda.currency] += Number(item.totalSellRate || 0);
      });
      const fdaTotals: Record<'USD' | 'IDR', number> = { USD: 0, IDR: 0 };
      (job.actualCosts || []).forEach((item) => {
        fdaTotals[item.currency || job.fda?.currency || job.currency] += Number(item.amount || 0);
      });

      worksheet.addRow([
        job.jobId,
        formatDateDisplay(job.inquiry?.date),
        job.vesselName,
        job.customerName,
        job.portName,
        job.quotation.epda.quoteNo || '-',
        job.fda?.fdaNo || '-',
        creator.branch,
        formatDateDisplay(job.eta, true),
        formatDateDisplay(job.etd, true),
        vessel?.grt ?? '-',
        creator.user,
        job.status,
        epdaTotals.USD,
        epdaTotals.IDR,
        fdaTotals.USD,
        fdaTotals.IDR,
      ]);
    });

    [14, 16].forEach((column) => { worksheet.getColumn(column).numFmt = '"$"#,##0.00'; });
    [15, 17].forEach((column) => { worksheet.getColumn(column).numFmt = '"Rp" #,##0'; });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quotes-review-${reviewMonth === 'ALL' ? 'semua-bulan' : reviewMonth}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionSuccess('Laporan Quotes Review gagal dibuat. Silakan coba lagi.');
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Operational Management & Governance</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            MANAGER OPS PORTAL
          </h1>
          <p className="text-xs text-slate-400">
            Approval dokumen penawaran (EPDA/PDA), monitoring operasional kapal, dan validasi margin
          </p>
        </div>

      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {subTab === 'DASHBOARD' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                style={{
                  background: card.tone === 'cyan'
                    ? 'linear-gradient(135deg,#0e9bb5,#128da5)'
                    : card.tone === 'amber'
                    ? 'linear-gradient(135deg,#f59e0b,#ee8c00)'
                    : card.tone === 'emerald'
                    ? 'linear-gradient(135deg,#11866f,#0f7a67)'
                    : 'linear-gradient(135deg,#e85d75,#d94662)',
                  borderRadius: 13,
                  padding: '15px 16px',
                  color: '#fff',
                  minHeight: 128,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 8px 16px rgba(26,78,140,.12)',
                }}
              >
                <div style={{ position: 'absolute', right: -24, top: -22, width: 110, height: 110, border: '1px solid rgba(255,255,255,.18)', borderRadius: '50%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, opacity: .78, fontWeight: 850, letterSpacing: '.05em' }}>{card.detail}</span>
                  <span style={{ background: '#fff', color: card.tone === 'amber' ? '#d67b00' : '#1670bd', borderRadius: 999, padding: '4px 9px', fontSize: 9, fontWeight: 850 }}>{card.label}</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 11, lineHeight: 1 }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300 mb-3">Admin & Sales Snapshot</h2>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400">User accounts</span>
                  <span className="font-mono font-bold text-cyan-300">{users.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400">Approved quotes</span>
                  <span className="font-mono font-bold text-amber-300">{approvedOrClosedJobs.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400">Total revenue pipeline</span>
                  <span className="font-mono font-bold text-emerald-300">{formatEPDAAmount(totalRevenuePipelineIDR, 'IDR')}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300 mb-3">FDA & Finance Snapshot</h2>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400">FDA approved</span>
                  <span className="font-mono font-bold text-emerald-300">{approvedFDAJobs.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400">Principal billed</span>
                  <span className="font-mono font-bold text-cyan-300">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalPrincipalBilledIDR)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400">Cash-in / received</span>
                  <span className="font-mono font-bold text-emerald-300">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalReceivedIDR)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Calls Overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-4">
              Monitoring Operasional Kapal & Status Port Stay
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">Job ID</th>
                    <th className="p-3">Vessel</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Pelabuhan / Dermaga</th>
                    <th className="p-3">ETA - ETD</th>
                    <th className="p-3">Tahap Berjalan</th>
                    <th className="p-3">Approval Manager</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {jobCalls.map((j) => (
                    <tr key={j.jobId} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-cyan-400">{j.jobId}</td>
                      <td className="p-3">
                        <span className="font-bold text-white block">{j.vesselName}</span>
                        <span className="text-[11px] text-slate-400">{j.customerName}</span>
                      </td>
                      <td className="p-3 text-slate-300">
                        {resolveCreatedByMeta(j).branch}
                      </td>
                      <td className="p-3">
                        <span className="text-slate-200 block">{j.portName}</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {j.operationalData.berthZone || 'Anchorage Waiting'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {formatDateDisplay(j.eta)} - {formatDateDisplay(j.etd)}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-amber-400 border border-slate-700">
                          {j.currentStage}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            j.managerApproval.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : j.managerApproval.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {j.managerApproval.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            onSelectJob(j.jobId);
                            onNavigate('ACTIVE_VESSEL_CALLS');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold"
                        >
                          Detail Lifecycle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* QUOTES VIEW TAB */}
      {subTab === 'QUOTES_VIEW' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nomor Vessel Call, kapal, customer, port..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <select value={reviewMonth} onChange={(event) => setReviewMonth(event.target.value)} className="sales-filter-control">
                <option value="ALL">Semua Bulan</option>
                {reviewMonths.map((month) => <option key={month} value={month}>{formatReviewMonth(month)}</option>)}
              </select>
              <span className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">{filteredReviewJobs.length} Vessel Call</span>
              <button type="button" onClick={() => void downloadReviewReport()} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                <Download className="h-4 w-4" /> Unduh Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
            <table className="min-w-[1100px] w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 text-center">No</th>
                  <th className="p-3">Job Vessel</th>
                  <th className="p-3">Vessel</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Port</th>
                  <th className="p-3">No EPDA</th>
                  <th className="p-3">Branch</th>
                  <th className="p-3">Created By</th>
                  <th className="p-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredReviewJobs.map((job, index) => {
                    const creator = resolveCreatedByMeta(job);
                    const epdaKey = `${job.jobId}:EPDA`;
                    const fdaKey = `${job.jobId}:FDA`;
                    const closingKey = `${job.jobId}:CLOSING`;
                    const epdaOpen = expandedQuoteDetail === epdaKey;
                    const fdaOpen = expandedQuoteDetail === fdaKey;
                    const closingOpen = expandedQuoteDetail === closingKey;
                    const closingCurrency = (job.fda?.currency || job.actualCosts?.[0]?.currency || job.quotation?.epda?.currency || job.currency || 'IDR') as 'USD' | 'IDR';
                    const closingRate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
                    const convertClosingAmount = (amount: number, currency?: 'USD' | 'IDR') => {
                      const sourceCurrency = currency || closingCurrency;
                      if (sourceCurrency === closingCurrency) return amount;
                      return sourceCurrency === 'USD' ? amount * closingRate : amount / closingRate;
                    };
                    const closingAR = job.fda?.finalBilledToPrincipal
                      || job.principalInvoice?.totalAmountUSD
                      || (job.ar || []).reduce((sum, item) => sum + convertClosingAmount(item.requestedAmount || 0, item.currency), 0);
                    const closingReceipts = job.principalReceipts || [];
                    const closingAdvance = closingReceipts
                      .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT')
                      .reduce((sum, receipt) => sum + convertClosingAmount(receipt.amount || 0, receipt.currency), 0);
                    const closingInvoiceReceived = closingReceipts
                      .filter((receipt) => receipt.paymentType === 'INVOICE')
                      .reduce((sum, receipt) => sum + convertClosingAmount(receipt.amount || 0, receipt.currency), 0);
                    const closingReceived = closingAdvance + closingInvoiceReceived;
                    const closingBalance = Math.max(0, closingAR - closingReceived);
                    const jobIsClosed = isClosedJob(job);
                    return (
                      <React.Fragment key={job.jobId}>
                        <tr className="hover:bg-slate-800/40 align-middle">
                          <td className="p-3 text-center font-mono text-slate-400">{index + 1}</td>
                          <td className="p-3 font-mono font-bold text-cyan-400">{job.jobId}</td>
                          <td className="p-3 font-bold text-white">{job.vesselName}</td>
                          <td className="p-3 text-slate-300">{job.customerName}</td>
                          <td className="p-3 text-slate-300">{job.portName}</td>
                          <td className="p-3 font-mono text-cyan-300">{job.quotation.epda.quoteNo || '-'}</td>
                          <td className="p-3 text-slate-300">{creator.branch}</td>
                          <td className="p-3 text-slate-300">{creator.user}</td>
                          <td className="p-3">
                            <div className="flex justify-center gap-2">
                              <button type="button" onClick={() => setExpandedQuoteDetail(epdaOpen ? null : epdaKey)} className={`rounded-lg p-2 ${epdaOpen ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-300 hover:text-cyan-300'}`} title="Lihat entry EPDA" aria-label="Lihat entry EPDA"><Eye className="h-4 w-4" /></button>
                              <button type="button" onClick={() => setExpandedQuoteDetail(fdaOpen ? null : fdaKey)} className={`rounded-lg p-2 ${fdaOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300 hover:text-emerald-300'}`} title="Lihat entry FDA" aria-label="Lihat entry FDA"><Eye className="h-4 w-4" /></button>
                              <button type="button" onClick={() => setExpandedQuoteDetail(closingOpen ? null : closingKey)} className={`rounded-lg p-2 ${closingOpen ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-300 hover:text-purple-300'}`} title="Lihat ringkasan closing" aria-label="Lihat ringkasan closing"><CheckCircle2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                        {epdaOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                              <QuotesEPDAView
                                job={job}
                                vessels={vessels}
                                onSelectJob={onSelectJob}
                                allJobs={jobCalls}
                                users={users}
                                fixTariffs={fixTariffs}
                                expensesItems={expensesItems}
                                printPreviewOnly
                              />
                            </div>
                          </td></tr>
                        )}
                        {fdaOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                              <FDAView
                                initialTab="APPROVAL"
                                printPreviewOnly
                                jobCalls={jobCalls}
                                vessels={vessels}
                                activeJob={job}
                                fixTariffs={fixTariffs}
                                expensesItems={expensesItems}
                                onSelectJob={onSelectJob}
                                onNavigate={onNavigate}
                              />
                            </div>
                          </td></tr>
                        )}
                        {closingOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <span className="rounded border border-purple-500/30 bg-slate-950 px-2 py-0.5 text-xs font-mono font-bold text-purple-400">CLOSING STAGE • {job.jobId}</span>
                                  <h3 className="mt-1 text-lg font-black text-white">Laporan Keuangan & Final Voyage Closing</h3>
                                </div>
                                <button type="button" onClick={() => setExpandedQuoteDetail(null)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">Tutup</button>
                              </div>

                              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-5 font-mono text-xs">
                                <div className="flex justify-between border-b border-slate-800 pb-2"><span className="text-slate-400">Total Ditagihkan (AR)</span><span className="font-bold text-cyan-300">{formatEPDAAmount(closingAR, closingCurrency)}</span></div>
                                <div className="flex justify-between border-b border-slate-800 pb-2"><span className="text-slate-400">Advance Payment</span><span className="font-bold text-amber-300">{formatEPDAAmount(closingAdvance, closingCurrency)}</span></div>
                                <div className="flex justify-between border-b border-slate-800 pb-2"><span className="text-slate-400">Total Diterima (Received)</span><span className="font-bold text-emerald-300">{formatEPDAAmount(closingReceived, closingCurrency)}</span></div>
                                <div className="flex justify-between pt-1 text-sm font-bold"><span className="text-rose-300">Sisa Saldo Belum Bayar</span><span className="text-rose-300">{formatEPDAAmount(closingBalance, closingCurrency)}</span></div>
                              </div>

                              <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-4 sm:flex-row">
                                <div className="text-xs text-slate-400">Status Pekerjaan: <strong className="font-mono uppercase text-white">{jobIsClosed ? 'CLOSED' : job.status}</strong>{jobIsClosed && <span className="ml-2 font-semibold text-emerald-400">(Telah ditutup secara finansial)</span>}</div>
                                {jobIsClosed ? (
                                  <div className="flex items-center gap-2 rounded-xl border border-purple-800/60 bg-purple-950/60 px-4 py-2 text-xs font-bold text-purple-300"><CheckCircle2 className="h-4 w-4 text-purple-400"/><span>Job ID {job.jobId} Selesai & Terarsip</span></div>
                                ) : (
                                  <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300">Belum ditutup secara finansial</span>
                                )}
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* APPROVAL TAB */}
      {subTab === 'APPROVAL' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">
              Antrian Approval Dokumen EPDA
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Manager Ops melakukan review EPDA, kelayakan biaya, dan margin sebelum diteruskan ke FDA.
            </p>

            {pendingApprovals.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800/80">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">Semua Dokumen Telah Di-Review!</p>
                <p className="text-xs text-slate-400 mt-1">
                  Tidak ada permohonan approval penawaran yang tertunda saat ini.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApprovals.map((job) => (
                  <div
                    key={job.jobId}
                    className="p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-indigo-500/50 transition space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-900 px-2 py-0.5 rounded">
                            {job.jobId}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {job.quotation.pda.quoteNo}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white font-mono mt-1">
                          {job.vesselName} • {job.customerName}
                        </h4>
                      </div>

                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className={`rounded-lg border p-2 ${job.quotation.epda.status === 'SUBMITTED' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>EPDA: <b>{job.quotation.epda.status}</b></div>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-slate-500">Pelabuhan:</span> {job.portName} •{' '}
                        <span className="text-slate-500">ETA:</span> {formatDateDisplay(job.eta, true)}
                      </div>
                      <button
                        onClick={() => {
                          const next = expandedDetailJobId === job.jobId ? null : job.jobId;
                          setExpandedDetailJobId(next);
                          onSelectJob(job.jobId);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 underline font-semibold"
                      >
                        {expandedDetailJobId === job.jobId ? 'Tutup EPDA' : 'Lihat EPDA Cetak/PDF'}
                      </button>
                    </div>
 
                    {expandedDetailJobId === job.jobId && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <QuotesEPDAView
                          job={job}
                          vessels={vessels}
                          onSelectJob={onSelectJob}
                          allJobs={jobCalls}
                          users={[]}
                          fixTariffs={fixTariffs}
                          expensesItems={expensesItems}
                          printPreviewOnly
                        />
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                      <input
                        type="text"
                        placeholder="Catatan persetujuan / instruksi operasional..."
                        value={approvalNotes[job.jobId] || ''}
                        onChange={(e) =>
                          setApprovalNotes({ ...approvalNotes, [job.jobId]: e.target.value })
                        }
                        className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handleReject(job.jobId)}
                          className="flex-1 sm:flex-initial px-3.5 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Reject / Revisi</span>
                        </button>
                        <button
                          onClick={() => handleApprove(job.jobId)}
                          className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-900/30 transition flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve Dokumen</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-white">Antrian Approval FDA</h2>
              <p className="mt-1 text-xs text-slate-400">Review Final Disbursement Account sebelum diteruskan ke Finance.</p>
            </div>

            {pendingFDAApprovals.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
                <p className="text-sm font-bold text-white">Tidak ada FDA menunggu approval</p>
              </div>
            ) : pendingFDAApprovals.map((job) => {
              const currency = job.fda.currency || job.actualCosts?.[0]?.currency || job.currency || 'USD';
              const actualCostTotal = job.fda.totalActualCost || job.actualCosts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
              return (
                <div key={`${job.jobId}:FDA-APPROVAL`} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-col justify-between gap-2 border-b border-slate-800 pb-3 sm:flex-row sm:items-center">
                    <div>
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-cyan-400">{job.jobId}</span>
                      <h3 className="mt-1 text-base font-bold text-white">{job.vesselName} • {job.customerName}</h3>
                      <p className="mt-1 text-xs text-slate-400">Dikirim oleh {job.fda.submittedBy || 'FDA'}{job.fda.submittedAt ? ` • ${formatDateDisplay(job.fda.submittedAt, true)}` : ''}</p>
                    </div>
                    <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">MENUNGGU APPROVAL</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><span className="text-slate-400">No. FDA</span><strong className="mt-1 block font-mono text-cyan-300">{job.fda.fdaNo || '-'}</strong></div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><span className="text-slate-400">Total Actual Cost</span><strong className="mt-1 block font-mono text-white">{formatEPDAAmount(actualCostTotal, currency)}</strong></div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><span className="text-slate-400">Tagihan Principal</span><strong className="mt-1 block font-mono text-emerald-300">{formatEPDAAmount(job.fda.finalBilledToPrincipal || 0, currency)}</strong></div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedFDAApprovalJobId(expandedFDAApprovalJobId === job.jobId ? null : job.jobId);
                        onSelectJob(job.jobId);
                      }}
                      className="text-xs font-semibold text-emerald-300 underline hover:text-emerald-200"
                    >
                      {expandedFDAApprovalJobId === job.jobId ? 'Tutup FDA' : 'Lihat FDA Cetak/PDF'}
                    </button>
                    {expandedFDAApprovalJobId === job.jobId && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <FDAView
                          initialTab="APPROVAL"
                          printPreviewOnly
                          jobCalls={jobCalls}
                          vessels={vessels}
                          activeJob={job}
                          onSelectJob={onSelectJob}
                          fixTariffs={fixTariffs}
                          expensesItems={expensesItems}
                          onNavigate={onNavigate}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row">
                    <input type="text" placeholder="Catatan approval / revisi FDA..." value={approvalNotes[`${job.jobId}:FDA`] || ''} onChange={(event) => setApprovalNotes({ ...approvalNotes, [`${job.jobId}:FDA`]: event.target.value })} className="w-full flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none" />
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <button type="button" onClick={() => handleRejectFDA(job.jobId)} className="flex-1 rounded-lg border border-rose-500/30 bg-rose-600/20 px-3.5 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-600/30 sm:flex-initial"><XCircle className="mr-1 inline h-4 w-4"/>Reject / Revisi</button>
                      <button type="button" onClick={() => handleApproveFDA(job.jobId)} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-indigo-500 sm:flex-initial"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Approve & Kirim ke Finance</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

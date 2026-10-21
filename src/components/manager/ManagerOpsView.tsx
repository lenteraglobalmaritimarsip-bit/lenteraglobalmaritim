import React, { useEffect, useRef, useState } from 'react';
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
  Printer,
} from 'lucide-react';
import { JobCall, ActiveTab, ExpensesItem, FixTariff, Vessel } from '../../types';
import { db } from '../../db/storage';
import { formatDateDisplay, formatInquiryDate, formatInquiryDateRange, isInquiryDateInRange } from '../../utils/date';
import { formatCostCategoryLabel } from '../../utils/costCategories';
import { getPrincipalReceiptSummary } from '../../utils/principalInvoice';
import { InquiryDateRangePicker, InquiryDateRange } from '../shared/InquiryDateRangePicker';
import { QuotesEPDAView } from '../sales/QuotesEPDAView';
import { createPdaPreviewHtml } from '../sales/CrewPDAView';
import { FDAView } from '../fda/FDAView';
import { ApprovedSalesPdaTotal, getManagerPdaDraft, listApprovedFdaPdaTotals, listApprovedSalesPdaTotals, listPendingPdaDrafts, PdaDocumentType, PdaDraft, reviewPdaDraft } from '../../lib/api';

interface ManagerOpsViewProps {
  initialTab?: 'DASHBOARD' | 'QUOTES_VIEW' | 'APPROVAL';
  jobCalls: JobCall[];
  approverName: string;
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
  approverName,
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
  useEffect(() => {
    if (subTab !== 'APPROVAL') return;
    let cancelled = false;
    setPdaApprovalLoading(true);
    setPdaApprovalError('');
    void listPendingPdaDrafts()
      .then((drafts) => { if (!cancelled) setPendingPdaDrafts(drafts); })
      .catch((error: unknown) => {
        if (!cancelled) setPdaApprovalError(error instanceof Error ? error.message : 'Antrian approval PDA gagal dimuat.');
      })
      .finally(() => { if (!cancelled) setPdaApprovalLoading(false); });
    return () => { cancelled = true; };
  }, [subTab]);
  const [search, setSearch] = useState('');
  const [reviewDateRange, setReviewDateRange] = useState<InquiryDateRange>({ from: '', to: '' });
  const [reviewPage, setReviewPage] = useState(1);
  const [dashboardPage, setDashboardPage] = useState(1);
  const [approvalNotes, setApprovalNotes] = useState<{ [key: string]: string }>({});
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pendingPdaDrafts, setPendingPdaDrafts] = useState<PdaDraft[]>([]);
  const [approvedSalesPdaTotals, setApprovedSalesPdaTotals] = useState<{ jobId: string; currency: 'IDR' | 'USD'; exchangeRate: number; total: number }[]>([]);
  const [approvedFpdaTotals, setApprovedFpdaTotals] = useState<ApprovedSalesPdaTotal[]>([]);
  const [pdaApprovalError, setPdaApprovalError] = useState('');
  const [pdaApprovalLoading, setPdaApprovalLoading] = useState(false);
  const [reviewingPdaJobId, setReviewingPdaJobId] = useState<string | null>(null);
  const [expandedDetailJobId, setExpandedDetailJobId] = useState<string | null>(null);
  const [expandedPdaApprovalJobId, setExpandedPdaApprovalJobId] = useState<string | null>(null);
  const [expandedFDAApprovalJobId, setExpandedFDAApprovalJobId] = useState<string | null>(null);
  const [expandedQuoteDetail, setExpandedQuoteDetail] = useState<string | null>(null);
  const [quoteReviewDocument, setQuoteReviewDocument] = useState<'EPDA' | 'PDA'>('EPDA');
  const [fdaReviewDocument, setFdaReviewDocument] = useState<'FDA' | 'FPDA'>('FDA');
  const [managerPdaPreview, setManagerPdaPreview] = useState<{ key: string; loading: boolean; draft: PdaDraft | null; error: string } | null>(null);
  const managerPdaPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const managerActorName = `${approverName.trim()} (Manager Ops)`;

  const loadManagerPdaPreview = async (jobId: string, pdaType: PdaDocumentType) => {
    const key = `${jobId}:${pdaType}`;
    setManagerPdaPreview({ key, loading: true, draft: null, error: '' });
    try {
      const draft = await getManagerPdaDraft(jobId, pdaType);
      setManagerPdaPreview((current) => current?.key === key
        ? { key, loading: false, draft, error: '' }
        : current);
    } catch (error) {
      setManagerPdaPreview((current) => current?.key === key
        ? { key, loading: false, draft: null, error: error instanceof Error ? error.message : 'Preview PDA gagal dimuat.' }
        : current);
    }
  };

  const renderManagerPdaPreview = (job: JobCall, pdaType: PdaDocumentType) => {
    const key = `${job.jobId}:${pdaType}`;
    const preview = managerPdaPreview?.key === key ? managerPdaPreview : null;
    if (!preview || preview.loading) {
      return <div role="status" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">Memuat preview {pdaType === 'FDA' ? 'FPDA' : 'PDA'}...</div>;
    }
    if (preview.error) {
      return <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">{preview.error}</div>;
    }
    if (!preview.draft) {
      return <div role="status" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">Dokumen {pdaType === 'FDA' ? 'FPDA' : 'PDA'} belum tersedia untuk Job ini.</div>;
    }

    const draft = preview.draft;
    const title = pdaType === 'FDA' ? `Preview FPDA ${draft.pdaNo}` : `Preview PDA ${draft.pdaNo}`;
    const srcDoc = createPdaPreviewHtml(
      job,
      draft.items,
      draft.currency,
      draft.pdaNo,
      draft.pdaType,
      draft.itemDraft.pph23Applied,
      draft.itemDraft.globalVatApplied,
      { createdAt: draft.createdAt, eta: draft.eta, etd: draft.etd, etaRemarks: draft.etaRemarks, etdRemarks: draft.etdRemarks },
    );
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button type="button" onClick={() => managerPdaPreviewFrameRef.current?.contentWindow?.print()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600">
            <Printer className="h-4 w-4" /> Cetak / Simpan PDF
          </button>
        </div>
        <iframe
          ref={managerPdaPreviewFrameRef}
          title={title}
          srcDoc={srcDoc}
          className="h-[72vh] min-h-[520px] w-full rounded border border-slate-700 bg-white"
        />
      </div>
    );
  };

  const pendingApprovals = jobCalls.filter(
    (j) =>
      j.managerApproval.status !== 'APPROVED' &&
      j.quotation.epda.status === 'SUBMITTED'
  );
  const pendingFDAApprovals = jobCalls.filter((job) => job.fda?.approvalStatus === 'SUBMITTED' && !job.fda.fdaApproved);

  const approvedOrClosedJobs = jobCalls.filter((j) => j.managerApproval.status === 'APPROVED' || j.currentStage === 'CLOSED');
  const approvedFDAJobs = jobCalls.filter((job) => Boolean(job.fda?.fdaApproved || job.fda?.approvalStatus === 'APPROVED'));
  const isClosedJob = (job: JobCall) => job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED';
  const approvedFpdaTotalIDR = approvedFpdaTotals.reduce((sum, fpda) => {
    if (!approvedFDAJobs.some((job) => job.jobId === fpda.jobId)) return sum;
    return sum + (fpda.currency === 'USD' ? fpda.total * fpda.exchangeRate : fpda.total);
  }, 0);
  const totalPrincipalBilledIDR = approvedFDAJobs.reduce((sum, job) => {
    const billed = job.fda?.finalBilledToPrincipal
      || job.principalInvoice?.totalAmountUSD
      || job.quotation?.epda?.totalAmount
      || 0;
    const currency = job.fda?.currency || job.currency || 'IDR';
    const rate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    return sum + Math.round(currency === 'USD' ? billed * rate : billed);
  }, 0) + approvedFpdaTotalIDR;
  const totalOutstandingIDR = approvedFDAJobs.reduce((sum, job) => {
    if (isClosedJob(job)) return sum;
    const billed = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || 0;
    const billedCurrency = job.fda?.currency || job.currency || 'IDR';
    const rate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    const billedIDR = billedCurrency === 'USD' ? billed * rate : billed;
    const receivedIDR = getPrincipalReceiptSummary(job, 'IDR').totalReceived;
    return sum + Math.max(0, billedIDR - receivedIDR);
  }, 0);
  const totalReceivedIDR = approvedFDAJobs.reduce((sum, job) => {
    const rate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    return sum + getPrincipalReceiptSummary(job, 'IDR').totalReceived;
  }, 0);
  const summaryCards = [
    { label: 'System Users', value: String(users.length), detail: 'Akun aktif dalam portal', tone: 'cyan' },
    { label: 'Sales Pipeline', value: String(jobCalls.filter((j) => j.quotation.epda.status === 'APPROVED').length), detail: 'Quote yang siap diproses', tone: 'amber' },
    { label: 'FDA Approved', value: String(approvedFDAJobs.length), detail: 'Final disbursement account', tone: 'emerald' },
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
  const getEpdaGrandTotal = (job: JobCall) => {
    const quote = job.quotation.epda;
    const items = quote.items || [];
    const categories = items.reduce<Array<{ category: string; items: typeof items }>>((groups, item) => {
      const category = item.category || '';
      const existing = groups.find((group) => group.category === category);
      if (existing) existing.items.push(item);
      else groups.push({ category, items: [item] });
      return groups;
    }, []);
    const roundCurrency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
    const vat = categories.reduce((sum, group) => {
      if (quote.globalVatApplied) return sum;
      return sum + group.items.reduce((categorySum, item) => (
        categorySum + (item.vatApplied ? roundCurrency(item.amount * 0.11) : 0)
      ), 0);
    }, 0);
    const baseAmount = Number(quote.totalAmount || 0);
    const pph23Applied = quote.pph23Applied ?? items.some((item) => item.pph23Applied);
    const pph23 = pph23Applied
      ? categories.reduce((sum, group) => {
          if (!group.items.some((item) => item.vatApplied)) return sum;
          const categoryTotal = group.items.reduce((categorySum, item) => categorySum + item.amount, 0);
          return sum + roundCurrency(categoryTotal * 0.02);
        }, 0)
      : 0;
    const globalVat = quote.globalVatApplied ? roundCurrency(baseAmount * 0.11) : 0;
    return roundCurrency(baseAmount + vat + globalVat - pph23);
  };
  const totalRevenuePipelineIDR = jobCalls.reduce((sum, job) => {
    if (job.managerApproval?.status !== 'APPROVED' || job.quotation?.epda?.status !== 'APPROVED') return sum;
    const amount = getEpdaGrandTotal(job);
    const currency = job.quotation?.epda?.currency || job.currency || 'IDR';
    const rate = job.quotation.epda.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
    const normalizedAmount = currency === 'USD'
      ? Math.round((amount + Number.EPSILON) * 100) / 100
      : amount;
    return sum + (currency === 'USD' ? normalizedAmount * rate : normalizedAmount);
  }, 0);
  const visibleJobIds = new Set(jobCalls.map((job) => job.jobId));
  const totalApprovedPdaIDR = approvedSalesPdaTotals.reduce((sum, pda) => {
    if (!visibleJobIds.has(pda.jobId)) return sum;
    const normalizedAmount = pda.currency === 'USD'
      ? Math.round((pda.total + Number.EPSILON) * 100) / 100
      : pda.total;
    return sum + (pda.currency === 'USD' ? normalizedAmount * pda.exchangeRate : normalizedAmount);
  }, 0);
  const totalRevenuePipelineWithPdaIDR = totalRevenuePipelineIDR + totalApprovedPdaIDR;

  useEffect(() => {
    let cancelled = false;
    void listApprovedSalesPdaTotals()
      .then((totals) => { if (!cancelled) setApprovedSalesPdaTotals(totals); })
      .catch((error: unknown) => console.error('Approved Sales PDA totals failed to load:', error));
    void listApprovedFdaPdaTotals()
      .then((totals) => { if (!cancelled) setApprovedFpdaTotals(totals); })
      .catch((error: unknown) => console.error('Approved FPDA totals failed to load:', error));
    return () => { cancelled = true; };
  }, []);

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
    const result = db.approveJobQuote(jobId, managerActorName, notes);
    setActionSuccess(result ? `Job ${jobId} berhasil disetujui! Status beralih ke FDA.` : 'Approval ditolak: EPDA harus SUBMITTED terlebih dahulu.');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleReject = (jobId: string) => {
    const notes = approvalNotes[jobId] || 'Margin komersial tidak mencukupi / revisi buy rate vendor.';
    db.rejectJobQuote(jobId, managerActorName, notes);
    setActionSuccess(`Job ${jobId} dikembalikan ke Sales untuk revisi penawaran.`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleApproveFDA = (jobId: string) => {
    const notes = approvalNotes[`${jobId}:FDA`] || 'FDA disetujui untuk diteruskan ke Finance.';
    const result = db.approveFDA(jobId, managerActorName, notes);
    setActionSuccess(result ? `FDA ${jobId} disetujui dan diteruskan ke Finance.` : 'Approval FDA gagal. Pastikan FDA sudah dikirim oleh tim FDA.');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleRejectFDA = (jobId: string) => {
    const notes = approvalNotes[`${jobId}:FDA`] || 'FDA dikembalikan ke FDA untuk revisi.';
    const result = db.rejectFDA(jobId, managerActorName, notes);
    setActionSuccess(result ? `FDA ${jobId} dikembalikan ke tim FDA untuk revisi.` : 'FDA tidak dapat dikembalikan karena statusnya bukan SUBMITTED.');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleReviewPda = async (draft: PdaDraft, decision: 'APPROVED' | 'REVISION_REQUIRED') => {
    setReviewingPdaJobId(draft.jobId);
    setPdaApprovalError('');
    try {
      const notes = approvalNotes[`${draft.jobId}:PDA`]?.trim()
        || (decision === 'REVISION_REQUIRED' ? 'Mohon periksa dan lakukan revisi pada PDA.' : '');
      await reviewPdaDraft(draft.jobId, decision, notes, draft.pdaType);
      setPendingPdaDrafts((current) => current.filter((item) => item.jobId !== draft.jobId));
      setActionSuccess(decision === 'APPROVED'
        ? `PDA ${draft.pdaNo} disetujui.`
        : `PDA ${draft.pdaNo} dikembalikan ke Sales untuk revisi.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (error) {
      setPdaApprovalError(error instanceof Error ? error.message : 'Review PDA gagal disimpan.');
    } finally {
      setReviewingPdaJobId(null);
    }
  };

  const filteredReviewJobs = jobCalls.filter((job) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = [job.jobId, job.vesselName, job.customerName, job.portName, job.quotation.epda.quoteNo, job.inquiry?.inquiryNo || '', job.inquiry?.createdBy || '']
      .join(' ').toLowerCase().includes(query);
    return matchesSearch && isInquiryDateInRange(job.inquiry?.date, reviewDateRange.from, reviewDateRange.to);
  }).sort((first, second) => second.jobId.localeCompare(first.jobId, undefined, { numeric: true }));
  const reviewPageSize = 10;
  const reviewPageCount = Math.max(1, Math.ceil(filteredReviewJobs.length / reviewPageSize));
  const currentReviewPage = Math.min(reviewPage, reviewPageCount);
  const reviewPageGroupStart = Math.floor((currentReviewPage - 1) / 10) * 10 + 1;
  const reviewPageGroupEnd = Math.min(reviewPageGroupStart + 9, reviewPageCount);
  const paginatedReviewJobs = filteredReviewJobs.slice(
    (currentReviewPage - 1) * reviewPageSize,
    currentReviewPage * reviewPageSize
  );
  const dashboardPageSize = 10;
  const dashboardPageCount = Math.max(1, Math.ceil(jobCalls.length / dashboardPageSize));
  const currentDashboardPage = Math.min(dashboardPage, dashboardPageCount);
  const dashboardPageGroupStart = Math.floor((currentDashboardPage - 1) / 10) * 10 + 1;
  const dashboardPageGroupEnd = Math.min(dashboardPageGroupStart + 9, dashboardPageCount);
  const paginatedDashboardJobs = jobCalls.slice(
    (currentDashboardPage - 1) * dashboardPageSize,
    currentDashboardPage * dashboardPageSize
  );
  const reviewDateRangeLabel = formatInquiryDateRange(reviewDateRange.from, reviewDateRange.to);

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
    worksheet.getCell('A2').value = `Periode: ${reviewDateRangeLabel}`;
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
        epdaTotals[item.currency || job.quotation.epda.currency] += Number(item.amount || 0);
      });
      const fdaTotals: Record<'USD' | 'IDR', number> = { USD: 0, IDR: 0 };
      if (job.fda?.finalBilledToPrincipal) {
        fdaTotals[job.fda.currency || job.currency] += Number(job.fda.finalBilledToPrincipal);
      }

      worksheet.addRow([
        job.jobId,
        formatInquiryDate(job.inquiry?.date),
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
      link.download = `quotes-review-${reviewDateRange.from || 'awal'}-${reviewDateRange.to || 'akhir'}.xlsx`;
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
            Approval dokumen penawaran EPDA, monitoring operasional kapal, dan validasi margin
          </p>
        </div>

      </div>

      {actionSuccess && (
        <div role="status" className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
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
                  <span className="text-slate-400">Total EPDA + PDA approved</span>
                  <span className="font-mono font-bold text-emerald-300">{formatEPDAAmount(totalRevenuePipelineWithPdaIDR, 'IDR')}</span>
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
                    <th className="p-3 text-center">Job ID</th>
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
                  {paginatedDashboardJobs.map((j) => (
                    <tr key={j.jobId} className="hover:bg-slate-800/40">
                      <td className="p-3 text-center font-mono font-bold text-cyan-400">{j.jobId}</td>
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
                          {j.operationalData.berthZoneName || 'Anchorage Waiting'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {formatDateDisplay(j.eta, true)} - {formatDateDisplay(j.etd, true)}
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
            <div className="mt-3 flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => setDashboardPage((page) => Math.max(1, page - 1))}
                disabled={currentDashboardPage === 1}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              {Array.from(
                { length: dashboardPageGroupEnd - dashboardPageGroupStart + 1 },
                (_, index) => dashboardPageGroupStart + index
              ).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setDashboardPage(page)}
                  aria-current={currentDashboardPage === page ? 'page' : undefined}
                  className={`rounded border px-3 py-1.5 text-xs ${
                    currentDashboardPage === page
                      ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-300'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDashboardPage((page) => Math.min(dashboardPageCount, page + 1))}
                disabled={currentDashboardPage === dashboardPageCount}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUOTES VIEW TAB */}
      {subTab === 'QUOTES_VIEW' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="relative w-full min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nomor Vessel Call, kapal, customer, port..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setReviewPage(1);
                  setExpandedQuoteDetail(null);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-2 sm:justify-end">
              <InquiryDateRangePicker
                value={reviewDateRange}
                onChange={(value) => {
                  setReviewDateRange(value);
                  setReviewPage(1);
                  setExpandedQuoteDetail(null);
                }}
                className="w-full sm:w-auto"
              />
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
                  <th className="p-3 text-center">Job Vessel</th>
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
                {paginatedReviewJobs.map((job, index) => {
                    const creator = resolveCreatedByMeta(job);
                    const epdaKey = `${job.jobId}:EPDA`;
                    const fdaKey = `${job.jobId}:FDA`;
                    const closingKey = `${job.jobId}:CLOSING`;
                    const epdaOpen = expandedQuoteDetail === epdaKey;
                    const fdaOpen = expandedQuoteDetail === fdaKey;
                    const closingOpen = expandedQuoteDetail === closingKey;
                    const closingCurrency = (job.fda?.currency || job.quotation?.epda?.currency || job.currency || 'IDR') as 'USD' | 'IDR';
                    const closingRate = job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800;
                    const convertClosingAmount = (amount: number, currency?: 'USD' | 'IDR') => {
                      const sourceCurrency = currency || closingCurrency;
                      if (sourceCurrency === closingCurrency) return amount;
                      return sourceCurrency === 'USD' ? amount * closingRate : amount / closingRate;
                    };
                    const closingAR = job.fda?.finalBilledToPrincipal
                      || job.principalInvoice?.totalAmountUSD
                      || (job.ar || []).reduce((sum, item) => sum + convertClosingAmount(item.requestedAmount || 0, item.currency), 0);
                    const closingReceipts = getPrincipalReceiptSummary(job, closingCurrency);
                    const closingAdvance = closingReceipts.advanceReceived;
                    const closingInvoiceReceived = closingReceipts.totalReceived - closingAdvance;
                    const closingReceived = closingReceipts.totalReceived;
                    const closingBalance = Math.max(0, closingAR - closingReceived);
                    const jobIsClosed = isClosedJob(job);
                    return (
                      <React.Fragment key={job.jobId}>
                        <tr className="hover:bg-slate-800/40 align-middle">
                          <td className="p-3 text-center font-mono text-slate-400">{(currentReviewPage - 1) * reviewPageSize + index + 1}</td>
                          <td className="p-3 text-center font-mono font-bold text-cyan-400">{job.jobId}</td>
                          <td className="p-3 font-bold text-white">{job.vesselName}</td>
                          <td className="p-3 text-slate-300">{job.customerName}</td>
                          <td className="p-3 text-slate-300">{job.portName}</td>
                          <td className="p-3 font-mono text-cyan-300">{job.quotation.epda.quoteNo || '-'}</td>
                          <td className="p-3 text-slate-300">{creator.branch}</td>
                          <td className="p-3 text-slate-300">{creator.user}</td>
                          <td className="p-3">
                            <div className="flex justify-center gap-2">
                              <button type="button" onClick={() => { setQuoteReviewDocument('EPDA'); setExpandedQuoteDetail(epdaOpen ? null : epdaKey); }} className={`rounded-lg p-2 ${epdaOpen ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-300 hover:text-cyan-300'}`} title="Lihat entry EPDA / PDA" aria-label="Lihat entry EPDA / PDA"><Eye className="h-4 w-4" /></button>
                              <button type="button" onClick={() => { setFdaReviewDocument('FDA'); setExpandedQuoteDetail(fdaOpen ? null : fdaKey); }} className={`rounded-lg p-2 ${fdaOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300 hover:text-emerald-300'}`} title="Lihat entry FDA / FPDA" aria-label="Lihat entry FDA / FPDA"><Eye className="h-4 w-4" /></button>
                              <button type="button" onClick={() => setExpandedQuoteDetail(closingOpen ? null : closingKey)} className={`rounded-lg p-2 ${closingOpen ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-300 hover:text-purple-300'}`} title="Lihat ringkasan closing" aria-label="Lihat ringkasan closing"><CheckCircle2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                        {epdaOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="space-y-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                              <div role="tablist" aria-label="Dokumen Sales" className="inline-flex gap-1 rounded-xl border border-emerald-100 bg-white p-1 shadow-sm">
                                <button type="button" role="tab" aria-selected={quoteReviewDocument === 'EPDA'} onClick={() => setQuoteReviewDocument('EPDA')} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${quoteReviewDocument === 'EPDA' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-emerald-700'}`}>EPDA</button>
                                <button type="button" role="tab" aria-selected={quoteReviewDocument === 'PDA'} onClick={() => { setQuoteReviewDocument('PDA'); void loadManagerPdaPreview(job.jobId, 'SALES'); }} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${quoteReviewDocument === 'PDA' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-emerald-700'}`}>PDA</button>
                              </div>
                              {quoteReviewDocument === 'EPDA' ? (
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
                              ) : renderManagerPdaPreview(job, 'SALES')}
                            </div>
                          </td></tr>
                        )}
                        {fdaOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="space-y-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3">
                              <div role="tablist" aria-label="Dokumen FDA" className="inline-flex gap-1 rounded-xl border border-emerald-100 bg-white p-1 shadow-sm">
                                <button type="button" role="tab" aria-selected={fdaReviewDocument === 'FDA'} onClick={() => setFdaReviewDocument('FDA')} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${fdaReviewDocument === 'FDA' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-emerald-700'}`}>FDA</button>
                                <button type="button" role="tab" aria-selected={fdaReviewDocument === 'FPDA'} onClick={() => { setFdaReviewDocument('FPDA'); void loadManagerPdaPreview(job.jobId, 'FDA'); }} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${fdaReviewDocument === 'FPDA' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-emerald-700'}`}>FPDA</button>
                              </div>
                              {fdaReviewDocument === 'FDA' ? (
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
                              ) : renderManagerPdaPreview(job, 'FDA')}
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
          <div className="mt-3 flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => {
                setReviewPage((page) => Math.max(1, page - 1));
                setExpandedQuoteDetail(null);
              }}
              disabled={currentReviewPage === 1}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
            {Array.from(
              { length: reviewPageGroupEnd - reviewPageGroupStart + 1 },
              (_, index) => reviewPageGroupStart + index
            ).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => {
                  setReviewPage(page);
                  setExpandedQuoteDetail(null);
                }}
                aria-current={currentReviewPage === page ? 'page' : undefined}
                className={`rounded border px-3 py-1.5 text-xs ${
                  currentReviewPage === page
                    ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-300'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setReviewPage((page) => Math.min(reviewPageCount, page + 1));
                setExpandedQuoteDetail(null);
              }}
              disabled={currentReviewPage === reviewPageCount}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* APPROVAL TAB */}
      {subTab === 'APPROVAL' && (
        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-white">Antrian Approval PDA Crew</h2>
              <p className="mt-1 text-xs text-slate-400">Periksa rincian PDA sebelum menyetujui atau mengembalikannya ke Sales.</p>
            </div>
            {pdaApprovalError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{pdaApprovalError}</div>}
            {pdaApprovalLoading ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-400">Memuat antrean PDA...</div>
            ) : pendingPdaDrafts.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
                <p className="text-sm font-bold text-white">Tidak ada permohonan approval yang tertunda saat ini.</p>
              </div>
            ) : pendingPdaDrafts.map((draft) => {
              const job = jobCalls.find((item) => item.jobId === draft.jobId);
              const currency = draft.currency;
              const total = draft.items.reduce((sum, item) => sum + item.quantity * item.price * (item.vatApplied ? 1.11 : 1), 0);
              return (
                <div key={draft.jobId} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-col justify-between gap-2 border-b border-slate-800 pb-3 sm:flex-row sm:items-center">
                    <div>
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-cyan-400">{draft.jobId}</span>
                      <h3 className="mt-1 text-base font-bold text-white">{job ? `${job.vesselName} • ${job.customerName}` : 'Vessel call PDA'}</h3>
                      <p className="mt-1 text-xs text-slate-400">PDA {draft.pdaType} · No. {draft.pdaNo} · Dikirim {draft.submittedAt ? formatDateDisplay(draft.submittedAt, true) : '-'} oleh {draft.submittedBy || draft.pdaType}</p>
                    </div>
                    <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">MENUNGGU APPROVAL</span>
                  </div>
                  {job ? (
                    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                      <button
                        type="button"
                        onClick={() => setExpandedPdaApprovalJobId((current) => current === draft.jobId ? null : draft.jobId)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 underline hover:text-emerald-200"
                      >
                        <Eye className="h-4 w-4" />
                        {expandedPdaApprovalJobId === draft.jobId ? 'Tutup PDA Cetak/PDF' : 'Lihat PDA Cetak/PDF'}
                      </button>
                      {expandedPdaApprovalJobId === draft.jobId && (
                        <iframe
                          title={`Pratinjau PDA ${draft.pdaNo}`}
                          srcDoc={createPdaPreviewHtml(job, draft.items, draft.currency, draft.pdaNo, draft.pdaType, draft.itemDraft.pph23Applied, draft.itemDraft.globalVatApplied, { createdAt: draft.createdAt, eta: draft.eta, etd: draft.etd, etaRemarks: draft.etaRemarks, etdRemarks: draft.etdRemarks })}
                          className="h-[72vh] min-h-[520px] w-full rounded border border-slate-700 bg-white"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Detail job untuk PDA ini tidak ditemukan.</div>
                  )}
                  <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row">
                    <input type="text" placeholder="Catatan approval / revisi PDA..." value={approvalNotes[`${draft.jobId}:PDA`] || ''} onChange={(event) => setApprovalNotes({ ...approvalNotes, [`${draft.jobId}:PDA`]: event.target.value })} className="w-full flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none" />
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <button type="button" disabled={reviewingPdaJobId === draft.jobId} onClick={() => void handleReviewPda(draft, 'REVISION_REQUIRED')} className="flex-1 rounded-lg border border-rose-500/30 bg-rose-600/20 px-3.5 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-600/30 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"><XCircle className="mr-1 inline h-4 w-4"/>Kembalikan untuk Revisi</button>
                      <button type="button" disabled={reviewingPdaJobId === draft.jobId} onClick={() => void handleReviewPda(draft, 'APPROVED')} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Approve PDA</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">
              Antrian Approval EPDA
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Manager Ops melakukan review EPDA, kelayakan biaya, dan margin sebelum diteruskan ke FDA.
            </p>

            {pendingApprovals.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800/80">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">Tidak ada permohonan approval yang tertunda saat ini.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApprovals.map((job) => (
                  <div
                    key={job.jobId}
                    className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
                  >
                    <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
                      <div>
                        <span className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-blue-700">{job.jobId}</span>
                        <h4 className="mt-1 text-base font-bold text-slate-800">{job.vesselName} • {job.customerName}</h4>
                        <p className="mt-1 text-xs text-slate-500">EPDA No. {job.quotation.epda.quoteNo} · Dikirim {job.quotation.epda.submittedAt ? formatDateDisplay(job.quotation.epda.submittedAt, true) : '-'} oleh {job.quotation.epda.submittedBy || job.inquiry?.createdByName || 'Sales'}</p>
                      </div>
                      <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">MENUNGGU APPROVAL</span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <button
                        type="button"
                        onClick={() => {
                          const next = expandedDetailJobId === job.jobId ? null : job.jobId;
                          setExpandedDetailJobId(next);
                          onSelectJob(job.jobId);
                        }}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 underline hover:text-emerald-800"
                      >
                        {expandedDetailJobId === job.jobId ? 'Tutup EPDA' : 'Lihat EPDA Cetak/PDF'}
                      </button>
                    </div>
 
                    {expandedDetailJobId === job.jobId && (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
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

                    <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row">
                      <input
                        type="text"
                        placeholder="Catatan persetujuan / instruksi operasional..."
                        value={approvalNotes[job.jobId] || ''}
                        onChange={(e) =>
                          setApprovalNotes({ ...approvalNotes, [job.jobId]: e.target.value })
                        }
                        className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                      />

                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleReject(job.jobId)}
                          className="flex-1 rounded-lg border border-rose-300 bg-rose-500/50 px-3.5 py-3 text-sm font-bold text-white transition hover:bg-rose-600 sm:flex-initial"
                        >
                          <XCircle className="mr-1 inline h-4 w-4" />Kembalikan untuk Revisi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(job.jobId)}
                          className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-500 sm:flex-initial"
                        >
                          <CheckCircle2 className="mr-1 inline h-4 w-4" />Approve EPDA
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
                <p className="text-sm font-bold text-white">Tidak ada permohonan approval yang tertunda saat ini.</p>
              </div>
            ) : pendingFDAApprovals.map((job) => {
              return (
                <div key={`${job.jobId}:FDA-APPROVAL`} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
                    <div>
                      <span className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-blue-700">{job.jobId}</span>
                      <h3 className="mt-1 text-base font-bold text-slate-800">{job.vesselName} • {job.customerName}</h3>
                      <p className="mt-1 text-xs text-slate-500">FDA No. {job.fda.fdaNo || '-'} · Dikirim {job.fda.submittedAt ? formatDateDisplay(job.fda.submittedAt, true) : '-'} oleh {job.fda.submittedBy || 'FDA'}</p>
                    </div>
                    <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">MENUNGGU APPROVAL</span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedFDAApprovalJobId(expandedFDAApprovalJobId === job.jobId ? null : job.jobId);
                        onSelectJob(job.jobId);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 underline hover:text-emerald-800"
                    >
                      {expandedFDAApprovalJobId === job.jobId ? 'Tutup FDA' : 'Lihat FDA Cetak/PDF'}
                    </button>
                    {expandedFDAApprovalJobId === job.jobId && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
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
                    <input type="text" placeholder="Catatan approval / revisi FDA..." value={approvalNotes[`${job.jobId}:FDA`] || ''} onChange={(event) => setApprovalNotes({ ...approvalNotes, [`${job.jobId}:FDA`]: event.target.value })} className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none" />
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <button type="button" onClick={() => handleRejectFDA(job.jobId)} className="flex-1 rounded-lg border border-rose-300 bg-rose-500/50 px-3.5 py-3 text-sm font-bold text-white transition hover:bg-rose-600 sm:flex-initial"><XCircle className="mr-1 inline h-4 w-4"/>Kembalikan untuk Revisi</button>
                      <button type="button" onClick={() => handleApproveFDA(job.jobId)} className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-500 sm:flex-initial"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Approve FDA</button>
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

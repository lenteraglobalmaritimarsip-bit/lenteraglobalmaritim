import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Ship,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  AlertTriangle,
  Building,
  DollarSign,
  Search,
} from 'lucide-react';
import { JobCall, ActiveTab } from '../../types';
import { db } from '../../db/storage';
import { formatDateDisplay } from '../../utils/date';

interface ManagerOpsViewProps {
  initialTab?: 'DASHBOARD' | 'QUOTES_VIEW' | 'APPROVAL';
  jobCalls: JobCall[];
  users?: Array<{ id?: string; name?: string; branch?: string; username?: string; role?: string }>;
  onSelectJob: (jobId: string) => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const ManagerOpsView: React.FC<ManagerOpsViewProps> = ({
  initialTab = 'DASHBOARD',
  jobCalls,
  users = [],
  onSelectJob,
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'DASHBOARD' | 'QUOTES_VIEW' | 'APPROVAL'>(initialTab);
  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);
  const [search, setSearch] = useState('');
  const [approvalNotes, setApprovalNotes] = useState<{ [key: string]: string }>({});
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [expandedDetailJobId, setExpandedDetailJobId] = useState<string | null>(null);
  const [expandedQuoteDetail, setExpandedQuoteDetail] = useState<string | null>(null);

  const pendingApprovals = jobCalls.filter(
    (j) =>
      j.managerApproval.status !== 'APPROVED' &&
      j.quotation.epda.status === 'SUBMITTED'
  );

  const approvedOrClosedJobs = jobCalls.filter((j) => j.managerApproval.status === 'APPROVED' || j.currentStage === 'CLOSED');
  const approvedFDAJobs = jobCalls.filter((j) => j.fda?.fdaApproved);
  const isClosedJob = (job: JobCall) => job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED';
  const totalPrincipalBilledIDR = approvedFDAJobs.reduce((sum, job) => {
    const billed = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || 0;
    const currency = job.fda?.currency || job.currency || 'IDR';
    const rate = job.exchangeRateUSDToIDR || 15800;
    return sum + (currency === 'USD' ? billed * rate : billed);
  }, 0);
  const totalOutstandingIDR = approvedFDAJobs.reduce((sum, job) => {
    if (isClosedJob(job)) return sum;
    const billed = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || 0;
    const billedCurrency = job.fda?.currency || job.currency || 'IDR';
    const rate = job.exchangeRateUSDToIDR || 15800;
    const billedIDR = billedCurrency === 'USD' ? billed * rate : billed;
    const receivedIDR = (job.principalReceipts || []).reduce((receiptSum, receipt) => {
      const receiptCurrency = receipt.currency || job.currency || 'IDR';
      return receiptSum + (receiptCurrency === 'USD' ? receipt.amount * rate : receipt.amount);
    }, 0);
    return sum + Math.max(0, billedIDR - receivedIDR);
  }, 0);
  const totalReceivedIDR = approvedFDAJobs.reduce((sum, job) => {
    const rate = job.exchangeRateUSDToIDR || 15800;
    return sum + (job.principalReceipts || []).reduce((receiptSum, receipt) => {
      if (receipt.paymentType === 'ADVANCE_PAYMENT' && isClosedJob(job)) return receiptSum;
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
    const amount = job.quotation?.epda?.totalSellRate || 0;
    const currency = job.quotation?.epda?.currency || job.currency || 'IDR';
    const rate = job.exchangeRateUSDToIDR || 15800;
    return sum + (currency === 'USD' ? amount * rate : amount);
  }, 0);

  const formatEPDACategory = (category: string) => {
    const labels: Record<string, string> = {
      PORT_EXPENSES: 'PORT EXPENSES',
      CLEARANCE: 'CLEARANCE IN/OUT',
      GENERAL_EXPENSES: 'GENERAL EXPENSES',
      CREW_EXPENSES: 'CREW EXPENSES',
      AGENCY_FEE: 'AGENCY FEE',
      TAX_CONTINGENCY: 'TAX & CONTINGENCY',
      VAT_11: 'VAT 11%',
      PPH_INCOME_TAX: 'PPH / INCOME TAX',
    };
    return labels[category] || category.replace(/_/g, ' ');
  };

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
              <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] uppercase font-bold tracking-wider">{card.label}</span>
                  <div className={`h-2.5 w-2.5 rounded-full ${card.tone === 'cyan' ? 'bg-cyan-400' : card.tone === 'amber' ? 'bg-amber-400' : card.tone === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                </div>
                <div className="mt-3">
                  <span className="text-xl font-black font-mono text-white block">{card.value}</span>
                  <span className="text-[11px] text-slate-400 block mt-1">{card.detail}</span>
                </div>
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
          <div className="flex items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari quote berdasarkan Job ID, Kapal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <span className="text-xs text-slate-400">
              Menampilkan {jobCalls.length} penawaran komersial
            </span>
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
                {jobCalls
                  .filter((job) => [job.jobId, job.vesselName, job.customerName, job.portName, job.quotation.epda.quoteNo, job.inquiry?.createdBy || '']
                    .join(' ').toLowerCase().includes(search.trim().toLowerCase()))
                  .map((job, index) => {
                    const creator = resolveCreatedByMeta(job);
                    const epdaKey = `${job.jobId}:EPDA`;
                    const fdaKey = `${job.jobId}:FDA`;
                    const epdaGrandTotal = job.quotation.epda.items.reduce((sum, item) => sum + Number(item.totalSellRate || 0), 0);
                    const fdaGrandTotal = (job.actualCosts || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
                    const epdaOpen = expandedQuoteDetail === epdaKey;
                    const fdaOpen = expandedQuoteDetail === fdaKey;
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
                            </div>
                          </td>
                        </tr>
                        {epdaOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-cyan-300">Entry EPDA: {job.jobId}</div>
                            <div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-slate-500 uppercase"><tr><th className="p-2">No</th><th className="p-2">Description Cost</th><th className="p-2">Category</th><th className="p-2">Qty</th><th className="p-2 text-right">Total EPDA</th></tr></thead><tbody className="divide-y divide-slate-800">{job.quotation.epda.items.map((item, itemIndex) => <tr key={item.id}><td className="p-2 text-slate-400">{itemIndex + 1}</td><td className="p-2 font-semibold text-white">{item.name}</td><td className="p-2 text-slate-300">{formatEPDACategory(item.category)}</td><td className="p-2 text-slate-300">{item.quantity}</td><td className="p-2 text-right font-mono text-cyan-300">{formatEPDAAmount(item.totalSellRate, item.currency || job.quotation.epda.currency)}</td></tr>)}</tbody><tfoot><tr className="border-t border-slate-700"><td colSpan={4} className="p-2 text-right font-bold uppercase text-slate-200">GRAND TOTAL</td><td className="p-2 text-right font-mono font-bold text-cyan-300">{formatEPDAAmount(epdaGrandTotal, job.quotation.epda.currency)}</td></tr></tfoot></table></div>
                          </td></tr>
                        )}
                        {fdaOpen && (
                          <tr><td colSpan={9} className="bg-slate-950 p-4">
                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-300">Entry FDA: {job.jobId}</div>
                            {job.actualCosts?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-slate-500 uppercase"><tr><th className="p-2">No</th><th className="p-2">Description Cost</th><th className="p-2">Category</th><th className="p-2">Vendor</th><th className="p-2 text-right">Amount FDA</th></tr></thead><tbody className="divide-y divide-slate-800">{job.actualCosts.map((item, itemIndex) => <tr key={item.id}><td className="p-2 text-slate-400">{itemIndex + 1}</td><td className="p-2 font-semibold text-white">{item.description}</td><td className="p-2 text-slate-300">{formatEPDACategory(item.category)}</td><td className="p-2 text-slate-300">{item.vendorName || '-'}</td><td className="p-2 text-right font-mono text-emerald-300">{formatEPDAAmount(item.amount, item.currency)}</td></tr>)}</tbody><tfoot><tr className="border-t border-slate-700"><td colSpan={4} className="p-2 text-right font-bold uppercase text-slate-200">GRAND TOTAL</td><td className="p-2 text-right font-mono font-bold text-emerald-300">{formatEPDAAmount(fdaGrandTotal, job.actualCosts[0]?.currency || job.quotation.epda.currency)}</td></tr></tfoot></table></div> : <p className="text-xs text-slate-400">Belum ada entry FDA untuk job ini.</p>}
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
                        {expandedDetailJobId === job.jobId ? 'Tutup Rincian Item' : 'Lihat Rincian Item'}
                      </button>
                    </div>
 
                    {expandedDetailJobId === job.jobId && (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-[11px] text-slate-300">
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reg Inquiry</div>
                            <div className="mt-1 font-semibold text-white">{job.inquiry?.inquiryNo || '-'}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">User Create EPDA</div>
                            <div className="mt-1 font-semibold text-white">{resolveCreatedByMeta(job).user}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Branch</div>
                            <div className="mt-1 font-semibold text-white">{resolveCreatedByMeta(job).branch}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Vessel</div>
                            <div className="mt-1 font-semibold text-white">{job.vesselName}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Port</div>
                            <div className="mt-1 font-semibold text-white">{job.portName}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ETA</div>
                            <div className="mt-1 font-semibold text-white">{formatDateDisplay(job.eta, true)}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ETD</div>
                            <div className="mt-1 font-semibold text-white">{formatDateDisplay(job.etd, true)}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Quantity</div>
                            <div className="mt-1 font-semibold text-white">{job.inquiry?.quantity ?? '-'} {job.inquiry?.quantityUnit === 'MATRIX_TON' ? 'MT' : job.inquiry?.quantityUnit === 'TON' ? 'T' : '-'}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Customer</div>
                            <div className="mt-1 font-semibold text-white">{job.customerName}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Purpose</div>
                            <div className="mt-1 font-semibold text-white">{job.purposeOfCall?.replace(/_/g, ' ') || '-'}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                            <div className="mt-1 font-semibold text-white">{job.inquiry?.status || '-'}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 md:col-span-2 xl:col-span-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Cargo / Keterangan</div>
                            <div className="mt-1 text-white">{job.inquiry?.cargoDetails || '-'}</div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 md:col-span-2 xl:col-span-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Special Requirements</div>
                            <div className="mt-1 text-white">{job.inquiry?.specialRequirements || '-'}</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Rincian Biaya EPDA</h5>
                          <span className="text-[10px] text-slate-400">{job.quotation.epda.items.length} item</span>
                        </div>
                        {job.quotation.epda.items.length === 0 ? (
                          <p className="text-xs text-slate-400">Belum ada item biaya yang dibuat di EPDA.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            {(() => {
                              const epdaItems = job.quotation.epda.items;
                              const epdaTotal = epdaItems.reduce((sum, item) => sum + Number(item.totalSellRate || 0), 0);
                              const epdaCurrency = job.quotation.epda.currency;
                              return (
                            <table className="min-w-full text-left text-[11px]">
                              <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider">
                                <tr>
                                  <th className="px-2 py-1.5 text-center">No</th>
                                  <th className="px-2 py-1.5">Description Cost</th>
                                  <th className="px-2 py-1.5">Category</th>
                                  <th className="px-2 py-1.5">Qty</th>
                                  <th className="px-2 py-1.5 text-right">Total EPDA</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {job.quotation.epda.items.map((item, index) => (
                                  <tr key={item.id} className="align-top text-slate-200">
                                    <td className="px-2 py-1.5 text-center font-mono">{index + 1}</td>
                                    <td className="px-2 py-1.5 font-medium">{item.name}</td>
                                    <td className="px-2 py-1.5">{formatEPDACategory(item.category)}</td>
                                    <td className="px-2 py-1.5">{item.quantity}</td>
                                    <td className="px-2 py-1.5 text-right font-semibold text-cyan-300">{formatEPDAAmount(item.totalSellRate, item.currency || job.quotation.epda.currency)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-slate-800">
                                  <td colSpan={4} className="px-2 py-1.5 text-right font-bold text-slate-200">Total EPDA</td>
                                  <td className="px-2 py-1.5 text-right font-bold text-cyan-300">{formatEPDAAmount(epdaTotal, epdaCurrency)}</td>
                                </tr>
                              </tfoot>
                            </table>
                              );
                            })()}
                          </div>
                        )}
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
        </div>
      )}
    </div>
  );
};

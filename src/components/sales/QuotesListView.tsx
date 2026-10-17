import React, { useEffect, useState } from 'react';
import { Eye, FileSpreadsheet, Search, UsersRound } from 'lucide-react';
import { JobCall, Vessel } from '../../types';
import { formatDateDisplay, isInquiryDateInRange } from '../../utils/date';
import { InquiryDateRangePicker, InquiryDateRange } from '../shared/InquiryDateRangePicker';
import { listApprovedPdaJobIds } from '../../lib/api';

interface QuotesListViewProps {
  jobCalls: JobCall[];
  vessels: Vessel[];
  onSelectJob: (jobId: string) => void;
  onOpenEPDA: () => void;
  onOpenPDA?: () => void;
  onViewApprovedPDA?: () => void;
  title?: string;
  description?: string;
  moduleLabel?: string;
  actionLabel?: string;
  enablePagination?: boolean;
  showStatusColumn?: boolean;
  statusColumnType?: 'quote' | 'fda';
  showPdaButton?: boolean;
  showApprovedPdaEyeButton?: boolean;
  pdaActionLabel?: string;
  pdaReferenceSource?: 'EPDA' | 'FDA';
}

export const QuotesListView: React.FC<QuotesListViewProps> = ({ jobCalls, vessels, onSelectJob, onOpenEPDA, onOpenPDA, onViewApprovedPDA, title = 'Quotes EPDA', description = 'Daftar quotation EPDA berdasarkan register vessel call.', moduleLabel = 'Sales and Operator - Quotes Module', actionLabel = 'Buat EPDA', enablePagination = false, showStatusColumn = false, statusColumnType = 'quote', showPdaButton = false, showApprovedPdaEyeButton = false, pdaActionLabel = 'Buat PDA', pdaReferenceSource = 'EPDA' }) => {
  const [search, setSearch] = useState('');
  const [approvedPdaJobIds, setApprovedPdaJobIds] = useState<Set<string>>(() => new Set());
  const [inquiryDateRange, setInquiryDateRange] = useState<InquiryDateRange>({ from: '', to: '' });
  const [quotePage, setQuotePage] = useState(1);
  useEffect(() => {
    if (!showApprovedPdaEyeButton) return;
    let cancelled = false;
    void listApprovedPdaJobIds()
      .then((jobIds) => { if (!cancelled) setApprovedPdaJobIds(new Set(jobIds)); })
      .catch(() => { if (!cancelled) setApprovedPdaJobIds(new Set()); });
    return () => { cancelled = true; };
  }, [showApprovedPdaEyeButton]);
  const filteredQuotes = jobCalls.filter((job) => {
    const query = search.toLowerCase();
    const matchesSearch = [job.vesselName, job.inquiry.inquiryNo, job.portName, job.customerName]
      .some((value) => value.toLowerCase().includes(query));
    return matchesSearch && isInquiryDateInRange(job.inquiry?.date, inquiryDateRange.from, inquiryDateRange.to);
  }).sort((first, second) => second.jobId.localeCompare(first.jobId, undefined, { numeric: true }));
  const quotePageSize = 10;
  const quotePageCount = Math.max(1, Math.ceil(filteredQuotes.length / quotePageSize));
  const currentQuotePage = Math.min(quotePage, quotePageCount);
  const quotePageGroupStart = Math.floor((currentQuotePage - 1) / 10) * 10 + 1;
  const quotePageGroupEnd = Math.min(quotePageGroupStart + 9, quotePageCount);
  const visibleQuotes = enablePagination
    ? filteredQuotes.slice((currentQuotePage - 1) * quotePageSize, currentQuotePage * quotePageSize)
    : filteredQuotes;
  const getQuoteStatus = (job: JobCall) => {
    if (statusColumnType === 'fda') {
      if (job.voidedAt) return { label: 'Dibatalkan', style: 'bg-rose-500/20 text-rose-300' };
      if (job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED') {
        return { label: 'Closed', style: 'bg-slate-500/20 text-slate-300' };
      }
      if (job.fda?.fdaApproved) return { label: 'Kirim ke Finance', style: 'bg-emerald-500/20 text-emerald-300' };
      if (job.fda?.approvalStatus === 'SUBMITTED') {
        return { label: 'Menunggu Approval FDA', style: 'bg-blue-500/20 text-blue-300' };
      }
      if (job.currentStage === 'FDA' || job.currentStage === 'AP_AR' || job.currentStage === 'PRINCIPAL_INVOICE') {
        return { label: 'Proses FDA', style: 'bg-amber-500/20 text-amber-300' };
      }
      if (job.managerApproval?.status === 'APPROVED') {
        return { label: 'Siap Proses FDA', style: 'bg-emerald-500/20 text-emerald-300' };
      }
      if (job.quotation?.epda?.status === 'SUBMITTED') {
        return { label: 'Menunggu Approval Manager', style: 'bg-blue-500/20 text-blue-300' };
      }
      return { label: 'Draft Job', style: 'bg-amber-500/20 text-amber-300' };
    }

    if (job.voidedAt) return { label: 'Dibatalkan', style: 'bg-rose-500/20 text-rose-300' };
    if (job.managerApproval?.status === 'REJECTED') return { label: 'Perlu Revisi', style: 'bg-amber-500/20 text-amber-300' };
    if (job.managerApproval?.status === 'APPROVED') return { label: 'Disetujui Manager', style: 'bg-emerald-500/20 text-emerald-300' };
    if (job.quotation?.epda?.status === 'SUBMITTED') return { label: 'Menunggu Approval', style: 'bg-blue-500/20 text-blue-300' };
    if (job.quotation?.epda?.status === 'APPROVED') return { label: 'EPDA Disetujui', style: 'bg-emerald-500/20 text-emerald-300' };
    return { label: 'Draft', style: 'bg-slate-500/20 text-slate-300' };
  };

  return (
  <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 border border-slate-800 bg-slate-900 p-5 shadow-xl sm:flex-row sm:items-center rounded-2xl">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
          <FileSpreadsheet className="h-4 w-4" />
          <span>{moduleLabel}</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-white">{title}</h1>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
    </div>

    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="relative w-full min-w-0 max-w-md flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari quotes berdasarkan Kapal, No. Inquiry, Pelabuhan..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setQuotePage(1);
          }}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2 sm:justify-end">
        <InquiryDateRangePicker
          value={inquiryDateRange}
          onChange={(value) => {
            setInquiryDateRange(value);
            setQuotePage(1);
          }}
          className="w-full sm:w-auto"
        />
        <span className="mb-2 whitespace-nowrap text-xs text-slate-400">Total: {filteredQuotes.length}</span>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="w-[3%] p-2">No</th>
            <th className={`${showPdaButton || showStatusColumn ? 'w-[8%]' : 'w-[9%]'} p-2`}>Req Inquiry</th>
            <th className="w-[10%] p-2">REG Vessel Call</th>
            <th className={`${showPdaButton || showStatusColumn ? 'w-[7%]' : 'w-[8%]'} p-2`}>Date Quotes</th>
            <th className={`${showPdaButton || showStatusColumn ? 'w-[6%]' : 'w-[7%]'} p-2`}>IMO</th>
            <th className={`${showPdaButton ? 'w-[12%]' : showStatusColumn ? 'w-[14%]' : 'w-[15%]'} p-2`}>Customer / Principal</th>
            <th className={`${showPdaButton ? 'w-[8%]' : showStatusColumn ? 'w-[10%]' : 'w-[11%]'} p-2`}>Vessel</th>
            <th className={`${showPdaButton ? 'w-[8%]' : showStatusColumn ? 'w-[9%]' : 'w-[10%]'} p-2`}>Port</th>
            <th className={`${showPdaButton ? 'w-[8%]' : showStatusColumn ? 'w-[9%]' : 'w-[10%]'} p-2`}>ETA</th>
            {showStatusColumn && <th className={`${showPdaButton ? 'w-[9%]' : 'w-[11%]'} p-2`}>Status</th>}
            <th className={`${showPdaButton ? 'w-[21%]' : showStatusColumn ? 'w-[13%]' : 'w-[17%]'} p-2 text-center`}>Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {visibleQuotes.map((job, index) => {
            const vessel = vessels.find((item) => item.id === job.vesselId);
            const pdaReferenceNo = pdaReferenceSource === 'FDA' ? job.fda?.fdaNo : job.quotation?.epda?.quoteNo;
            const hasPdaReferenceNo = Boolean(pdaReferenceNo?.trim());
            return (
              <tr key={job.jobId} className="transition-colors hover:bg-slate-800/60">
                <td className="break-words p-2 font-mono font-bold text-slate-400">{enablePagination ? (currentQuotePage - 1) * quotePageSize + index + 1 : index + 1}</td>
                <td className="break-words p-2 font-mono font-bold text-cyan-300">{job.inquiry.inquiryNo}</td>
                <td className="break-words p-2 font-mono font-bold text-black">{job.jobId}</td>
                <td className="break-words p-2 text-slate-300">{formatDateDisplay(job.quotation?.epda?.date)}</td>
                <td className="break-words p-2 font-mono text-slate-300">{vessel?.imoNumber || '-'}</td>
                <td className="break-words p-2 font-semibold text-white">{job.customerName}</td>
                <td className="break-words p-2 font-bold text-emerald-300">{job.vesselName}</td>
                <td className="break-words p-2 text-slate-300">{job.portName}</td>
                <td className="break-words p-2 text-slate-300">{job.quotation?.epda?.eta
                  ? formatDateDisplay(job.quotation.epda.eta, true)
                  : job.quotation?.epda?.etaRemarks || '-'}</td>
                {showStatusColumn && (() => {
                  const status = getQuoteStatus(job);
                  return (
                    <td className="break-words p-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${status.style}`}>
                        {status.label}
                      </span>
                    </td>
                  );
                })()}
                <td className="p-2 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { onSelectJob(job.jobId); onOpenEPDA(); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {actionLabel}
                    </button>
                    {showPdaButton && (
                      <button
                        type="button"
                        disabled={!hasPdaReferenceNo}
                        title={hasPdaReferenceNo ? pdaReferenceNo : `Nomor ${pdaReferenceSource} belum tersedia`}
                        onClick={() => { if (!hasPdaReferenceNo) return; onSelectJob(job.jobId); onOpenPDA?.(); }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <UsersRound className="h-3.5 w-3.5" />
                        {pdaActionLabel}
                      </button>
                    )}
                    {showApprovedPdaEyeButton && approvedPdaJobIds.has(job.jobId) && (
                      <button
                        type="button"
                        title="Lihat PDA Sales yang telah disetujui"
                        aria-label={`Lihat PDA approved ${job.jobId}`}
                        onClick={() => { onSelectJob(job.jobId); onViewApprovedPDA?.(); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15 text-cyan-300 transition hover:bg-cyan-500/25"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!filteredQuotes.length && <tr><td colSpan={showStatusColumn ? 11 : 10} className="p-8 text-center text-slate-500">Tidak ada quotation sesuai pencarian.</td></tr>}
        </tbody>
      </table>
    </div>
    {enablePagination && (
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setQuotePage((page) => Math.max(1, page - 1))}
          disabled={currentQuotePage === 1}
          className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>
        {Array.from(
          { length: quotePageGroupEnd - quotePageGroupStart + 1 },
          (_, index) => quotePageGroupStart + index
        ).map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => setQuotePage(page)}
            aria-current={currentQuotePage === page ? 'page' : undefined}
            className={`rounded border px-3 py-1.5 text-xs ${
              currentQuotePage === page
                ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setQuotePage((page) => Math.min(quotePageCount, page + 1))}
          disabled={currentQuotePage === quotePageCount}
          className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    )}
  </div>
  );
};
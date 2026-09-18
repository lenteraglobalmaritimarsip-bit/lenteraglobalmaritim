import React, { useState } from 'react';
import { FileSpreadsheet, Search } from 'lucide-react';
import { JobCall, Vessel } from '../../types';

interface QuotesListViewProps {
  jobCalls: JobCall[];
  vessels: Vessel[];
  onSelectJob: (jobId: string) => void;
  onOpenEPDA: () => void;
  title?: string;
  description?: string;
  moduleLabel?: string;
  actionLabel?: string;
}

export const QuotesListView: React.FC<QuotesListViewProps> = ({ jobCalls, vessels, onSelectJob, onOpenEPDA, title = 'Quotes EPDA', description = 'Daftar quotation EPDA berdasarkan register vessel call.', moduleLabel = 'Sales and Operator - Quotes Module', actionLabel = 'Buat EPDA' }) => {
  const [search, setSearch] = useState('');
  const [inquiryMonth, setInquiryMonth] = useState('ALL');
  const inquiryMonths: string[] = Array.from(new Set<string>(jobCalls.map((job) => job.inquiry.date.slice(0, 7)).filter(Boolean))).sort().reverse();
  const filteredQuotes = jobCalls.filter((job) => {
    const query = search.toLowerCase();
    const matchesSearch = [job.vesselName, job.inquiry.inquiryNo, job.portName, job.customerName]
      .some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (inquiryMonth === 'ALL' || job.inquiry.date.startsWith(inquiryMonth));
  });
  const formatInquiryMonth = (value: string) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(`${value}-01T00:00:00`));

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

    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari quotes berdasarkan Kapal, No. Inquiry, Pelabuhan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <select value={inquiryMonth} onChange={(event) => setInquiryMonth(event.target.value)} className="sales-filter-control">
          <option value="ALL">Semua Bulan Inquiry</option>
          {inquiryMonths.map((month) => <option key={month} value={month}>{formatInquiryMonth(month)}</option>)}
        </select>
        <span className="text-xs text-slate-400">Total: {filteredQuotes.length}</span>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="w-[3%] p-2">No</th>
            <th className="w-[10%] p-2">Req Inquiry</th>
            <th className="w-[11%] p-2">REG Vessel Call</th>
            <th className="w-[7%] p-2">IMO</th>
            <th className="w-[16%] p-2">Customer / Principal</th>
            <th className="w-[12%] p-2">Vessel</th>
            <th className="w-[12%] p-2">Port</th>
            <th className="w-[11%] p-2">ETA</th>
            <th className="w-[18%] p-2 text-center">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {filteredQuotes.map((job, index) => {
            const vessel = vessels.find((item) => item.id === job.vesselId);
            return (
              <tr key={job.jobId} className="transition-colors hover:bg-slate-800/60">
                <td className="break-words p-2 font-mono font-bold text-slate-400">{index + 1}</td>
                <td className="break-words p-2 font-mono font-bold text-cyan-300">{job.inquiry.inquiryNo}</td>
                <td className="break-words p-2 font-mono font-bold text-blue-300">{job.jobId}</td>
                <td className="break-words p-2 font-mono text-slate-300">{vessel?.imoNumber || '-'}</td>
                <td className="break-words p-2 font-semibold text-white">{job.customerName}</td>
                <td className="break-words p-2 font-bold text-emerald-300">{job.vesselName}</td>
                <td className="break-words p-2 text-slate-300">{job.portName}</td>
                <td className="break-words p-2 text-slate-300">{job.eta.replace('T', ' ')}</td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => { onSelectJob(job.jobId); onOpenEPDA(); }}
                    className="mx-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    {actionLabel}
                  </button>
                </td>
              </tr>
            );
          })}
          {!filteredQuotes.length && <tr><td colSpan={9} className="p-8 text-center text-slate-500">Tidak ada quotation sesuai pencarian.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
  );
};
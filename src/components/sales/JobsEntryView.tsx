import React, { useState } from 'react';
import {
  FolderKanban,
  Ship,
  Search,
  Plus,
  ArrowRight,
  GitFork,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { JobCall, ActiveTab, JobStage } from '../../types';
import { formatDateDisplay } from '../../utils/date';

interface JobsEntryViewProps {
  jobCalls: JobCall[];
  onSelectJob: (jobId: string) => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const JobsEntryView: React.FC<JobsEntryViewProps> = ({
  jobCalls,
  onSelectJob,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');

  const filteredJobs = jobCalls.filter((j) => {
    const matchSearch =
      j.jobId.toLowerCase().includes(search.toLowerCase()) ||
      j.vesselName.toLowerCase().includes(search.toLowerCase()) ||
      j.customerName.toLowerCase().includes(search.toLowerCase()) ||
      j.portName.toLowerCase().includes(search.toLowerCase());

    const matchStage = selectedStage === 'ALL' || j.currentStage === selectedStage;
    return matchSearch && matchStage;
  });

  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <FolderKanban className="w-4 h-4" />
            <span>VESSEL CALL • OPERATIONS REGISTRY</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            Vessel Call Registry
          </h1>
          <p className="text-xs text-slate-400">
            Satu pekerjaan terikat pada 1 Job/Vessel Call ID yang menaungi 10 tahapan dari Inquiry hingga Final Invoice Closing
          </p>
        </div>

        <button
          onClick={() => onNavigate('INQUIRIES')}
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Job Call Baru</span>
        </button>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari Job ID (VC-2026-...), Kapal, Principal, Pelabuhan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Stage Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto text-xs">
          <span className="text-slate-400 text-xs whitespace-nowrap">Filter Tahap:</span>
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
          >
            <option value="ALL">Semua Tahap ({jobCalls.length})</option>
            <option value="INQUIRY">Inquiry</option>
            <option value="QUOTATION">Quotation (EPDA/PDA)</option>
            <option value="MANAGER_APPROVAL">Manager Approval</option>
            <option value="OPERATIONAL_DATA">Operational Data (SOF/Berthing)</option>
            <option value="ACTUAL_COST">Actual Cost</option>
            <option value="FDA">FDA (Final Disbursement)</option>
            <option value="CLOSING">Closing Selesai</option>
          </select>
        </div>
      </div>

      {/* Jobs Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredJobs.map((job) => {
          const isClosed = job.status === 'CLOSED';
          const isPendingApproval = job.managerApproval.status === 'PENDING';
          return (
            <div
              key={job.jobId}
              className="bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 shadow-xl transition flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
                      {job.jobId}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      isClosed
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : isPendingApproval
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Vessel & Principal info */}
                <h3 className="text-lg font-black text-white font-mono">
                  {job.vesselName}
                </h3>
                <div className="mt-1 space-y-1 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-semibold text-slate-300">{job.customerName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Ship className="w-3.5 h-3.5 text-slate-500" />
                    <span>{job.portName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-mono text-[11px]">
                      ETA: {formatDateDisplay(job.eta, true)}
                    </span>
                  </div>
                </div>

                {/* 10-Stage Pill Indicator */}
                <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                    Siklus Pekerjaan Berjalan:
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-xs font-bold text-cyan-300 uppercase font-mono">
                      {job.currentStage}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Quotes PDA:</span>
                    <strong className="text-white font-mono">
                      {formatUSD(job.quotation.pda.totalSellRate)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    onSelectJob(job.jobId);
                    onNavigate('QUOTES_EPDA');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Edit Quotes
                </button>

                <button
                  onClick={() => {
                    onSelectJob(job.jobId);
                    onNavigate('ACTIVE_VESSEL_CALLS');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>Interactive Tree</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

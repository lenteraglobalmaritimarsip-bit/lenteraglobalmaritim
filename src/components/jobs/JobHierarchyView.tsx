import React, { useState } from 'react';
import {
  Layers,
  Ship,
  FileQuestion,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Activity,
  Receipt,
  FileCheck,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Lock,
  ChevronRight,
  ExternalLink,
  Users,
  Anchor,
  Calendar,
  Building,
  Check,
  X,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { JobCall, UserRole } from '../../types';
import { db } from '../../db/storage';
import { formatDateDisplay } from '../../utils/date';

interface JobHierarchyViewProps {
  job: JobCall;
  currentRole: UserRole;
  onNavigateToTab?: (tabName: string) => void;
}

export const JobHierarchyView: React.FC<JobHierarchyViewProps> = ({
  job,
  currentRole,
  onNavigateToTab,
}) => {
  const [activeModalNode, setActiveModalNode] = useState<string | null>(null);

  const formatUSD = (num: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);

  const formatIDR = (num: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);

  const epdaTotal = job.quotation.epda.totalSellRate;
  const pdaTotal = job.quotation.pda.totalSellRate;
  const actualCostTotal = job.actualCosts.reduce((sum, item) => sum + item.amount, 0);
  const totalBilled = job.principalInvoice.totalAmountUSD || pdaTotal;
  const grossProfit = totalBilled - actualCostTotal;
  const marginPct = totalBilled > 0 ? ((grossProfit / totalBilled) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Top Banner: Single Job ID Anchor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
          <Anchor className="w-80 h-80 text-cyan-400" />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-cyan-900/30">
              <Ship className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
                  HUBUNGAN DATA DIDALAM PORTAL
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  {job.purposeOfCall.replace('_', ' ')}
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                    job.status === 'CLOSED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : job.status === 'APPROVED'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  Status: {job.status}
                </span>
              </div>

              <div className="flex items-baseline gap-3 mt-1.5">
                <h1 className="text-2xl lg:text-3xl font-black text-white font-mono tracking-tight">
                  {job.jobId}
                </h1>
                <span className="text-lg font-bold text-slate-300">
                  {job.vesselName}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                <span><strong>Port:</strong> {job.portName}</span>
                <span>•</span>
                <span><strong>Principal:</strong> {job.customerName}</span>
                <span>•</span>
                <span><strong>ETA:</strong> {formatDateDisplay(job.eta, true)}</span>
                <span>•</span>
                <span><strong>ETD:</strong> {formatDateDisplay(job.etd, true)}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                PDA Quote (Sell)
              </span>
              <span className="text-sm font-extrabold text-white font-mono">
                {formatUSD(pdaTotal)}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                Buy: {formatUSD(job.quotation.pda.totalBuyRate)}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Actual Cost (Disbursed)
              </span>
              <span className="text-sm font-extrabold text-cyan-400 font-mono">
                {formatUSD(actualCostTotal)}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {job.actualCosts.length} Vouchers logged
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Gross Margin
              </span>
              <span
                className={`text-sm font-extrabold font-mono ${
                  grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatUSD(grossProfit)}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold block">
                {marginPct}% Margin
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Current Lifecycle
              </span>
              <span className="text-xs font-bold text-amber-400 font-mono block truncate">
                {job.currentStage}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {job.closing.isClosed ? 'Closed & Locked' : 'Live Operation'}
              </span>
            </div>
          </div>
        </div>

        {/* Tree Explanation Notice */}
        <div className="pt-3 text-xs text-slate-400 flex items-center justify-between">
          <p>
            Setiap pekerjaan memiliki <strong>1 Job/Vessel Call ID ({job.jobId})</strong> yang mengikat seluruh relasi dokumen dari Inquiry hingga Closing. Klik node untuk melihat rincian.
          </p>
          <span className="text-[11px] font-mono text-cyan-400 hidden md:inline">
            1 USD = Rp {job.exchangeRateUSDToIDR.toLocaleString('id-ID')}
          </span>
        </div>
      </div>

      {/* Relational Visual Tree Diagram */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white uppercase tracking-wider">
              Bagan Hubungan Dokumen & Siklus Operasional
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Klik node manapun untuk melihat detail / audit dokumen
          </span>
        </div>

        {/* Main Tree Canvas */}
        <div className="relative pl-4 sm:pl-8 font-sans">
          {/* ROOT NODE: JOB ID */}
          <div className="relative mb-6">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-cyan-950 to-slate-900 border-2 border-cyan-500 text-white px-5 py-3 rounded-xl shadow-lg shadow-cyan-950/40">
              <Ship className="w-5 h-5 text-cyan-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-300 block">
                  ROOT JOB / VESSEL CALL ID
                </span>
                <span className="text-lg font-black font-mono tracking-tight text-white">
                  {job.jobId}
                </span>
                <span className="text-xs text-slate-300 ml-2">({job.vesselName})</span>
              </div>
            </div>
          </div>

          {/* Vertical Branch Trunk */}
          <div className="space-y-6 relative border-l-2 border-slate-700 ml-6 pl-6 sm:pl-8">
            {/* 1. INQUIRY */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('INQUIRY')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
                    <FileQuestion className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        1. Inquiry
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {job.inquiry.inquiryNo}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                        {job.inquiry.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl">
                      {job.inquiry.cargoDetails}
                    </p>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      Tgl: {formatDateDisplay(job.inquiry.date)} • Dibuat oleh: {job.inquiry.createdBy}
                    </span>
                  </div>
                </div>

                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat Detail</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 2. QUOTATION (Branching into EPDA, PDA, Crew Change) */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-4 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white uppercase">
                        2. Quotation Package
                      </span>
                      <p className="text-xs text-slate-400">
                        Perhitungan disbursement Buy Rate vs Sell Rate dan kalkulasi margin komersial
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub-tree branches for EPDA, PDA, Crew Change */}
                <div className="border-l-2 border-slate-700/80 ml-4 pl-4 sm:pl-6 space-y-2.5 pt-1">
                  {/* SUB 1: EPDA */}
                  <div
                    onClick={() => setActiveModalNode('EPDA')}
                    className="cursor-pointer bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 rounded-lg p-3 transition flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-cyan-300">
                          |── EPDA (Estimated Port Disbursement Account)
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {job.quotation.epda.quoteNo}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-semibold">
                          {job.quotation.epda.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1 flex gap-3">
                        <span><strong>Sell:</strong> {formatUSD(job.quotation.epda.totalSellRate)}</span>
                        <span>•</span>
                        <span><strong>Buy:</strong> {formatUSD(job.quotation.epda.totalBuyRate)}</span>
                        <span>•</span>
                        <span className="text-emerald-400">
                          <strong>Margin:</strong> {job.quotation.epda.marginPercentage}% ({formatUSD(job.quotation.epda.marginAmount)})
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-cyan-400 flex items-center gap-1 font-semibold">
                      Detail <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  {/* SUB 2: PDA */}
                  <div
                    onClick={() => setActiveModalNode('PDA')}
                    className="cursor-pointer bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 rounded-lg p-3 transition flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-cyan-300">
                          |── PDA (Proforma Disbursement Account)
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {job.quotation.pda.quoteNo}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                          {job.quotation.pda.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1 flex gap-3">
                        <span><strong>Sell:</strong> {formatUSD(job.quotation.pda.totalSellRate)}</span>
                        <span>•</span>
                        <span><strong>Buy:</strong> {formatUSD(job.quotation.pda.totalBuyRate)}</span>
                        <span>•</span>
                        <span className="text-emerald-400">
                          <strong>Margin:</strong> {job.quotation.pda.marginPercentage}% ({formatUSD(job.quotation.pda.marginAmount)})
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-cyan-400 flex items-center gap-1 font-semibold">
                      Detail <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  {/* SUB 3: Crew Change */}
                  <div
                    onClick={() => setActiveModalNode('CREW_CHANGE')}
                    className="cursor-pointer bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 rounded-lg p-3 transition flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-cyan-300">
                          └── Crew Change Logistics
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {job.quotation.crewChange.id}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold">
                          {job.quotation.crewChange.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1 flex gap-3">
                        <span>Sign On: {job.quotation.crewChange.signOnCount} crew</span>
                        <span>•</span>
                        <span>Sign Off: {job.quotation.crewChange.signOffCount} crew</span>
                        <span>•</span>
                        <span>Total: {formatUSD(job.quotation.crewChange.totalCostUSD)} ({formatIDR(job.quotation.crewChange.totalCostIDR)})</span>
                      </div>
                    </div>
                    <span className="text-xs text-cyan-400 flex items-center gap-1 font-semibold">
                      Detail <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. MANAGER APPROVAL */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('APPROVAL')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg mt-0.5 ${
                      job.managerApproval.status === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : job.managerApproval.status === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        3. Manager Approval
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          job.managerApproval.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : job.managerApproval.status === 'REJECTED'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {job.managerApproval.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {job.managerApproval.notes || 'Menunggu verifikasi dan otorisasi Manager Ops.'}
                    </p>
                    {job.managerApproval.approvedBy && (
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        Oleh: {job.managerApproval.approvedBy} • {formatDateDisplay(job.managerApproval.approvedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat Detail</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 4. OPERATIONAL DATA */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('OPERATIONAL')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 mt-0.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        4. Operational Data & SOF
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-300">
                        {job.operationalData.statementOfFacts.length} Events Logged
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span><strong>ATA:</strong> {job.operationalData.ata || 'Pending'}</span>
                      <span><strong>ATB:</strong> {job.operationalData.atb || 'Pending'}</span>
                      <span><strong>Berth:</strong> {job.operationalData.berthZoneName || 'Anchorage'}</span>
                      <span><strong>Cargo:</strong> {job.operationalData.cargoQuantityMetricTons?.toLocaleString()} MT</span>
                    </div>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat SOF</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 5. ACTUAL COST */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('ACTUAL_COST')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 mt-0.5">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        5. Actual Cost (Realisasi Biaya)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300">
                        {job.actualCosts.length} Bukti Vouchers
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 flex gap-3">
                      <span><strong>Total Actual:</strong> {formatUSD(actualCostTotal)}</span>
                      <span>•</span>
                      <span><strong>Est. Buy PDA:</strong> {formatUSD(job.quotation.pda.totalBuyRate)}</span>
                      <span>•</span>
                      <span className={actualCostTotal <= job.quotation.pda.totalBuyRate ? 'text-emerald-400' : 'text-rose-400'}>
                        Variance: {formatUSD(actualCostTotal - job.quotation.pda.totalBuyRate)}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat Biaya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 6. FDA */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('FDA')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400 mt-0.5">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        6. FDA (Final Disbursement Account)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {job.fda.fdaNo}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          job.fda.fdaApproved
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {job.fda.fdaApproved ? 'Audited & Approved' : 'In Reconciliation'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {job.fda.notes || 'Rekonsiliasi Final Disbursement Account.'}
                    </p>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Audit FDA</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 7. AP (Accounts Payable) */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('AP')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 mt-0.5">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        7. AP (Accounts Payable)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {job.ap.length} Vendor Bills
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 flex gap-3">
                      <span>Total AP: {formatUSD(job.ap.reduce((s, a) => s + a.amount, 0))}</span>
                      <span>•</span>
                      <span className="text-emerald-400">
                        Paid: {job.ap.filter((a) => a.status === 'PAID').length}
                      </span>
                      <span>•</span>
                      <span className="text-rose-400">
                        Unpaid: {job.ap.filter((a) => a.status !== 'PAID').length}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat AP</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 8. AR (Accounts Receivable) */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('AR')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        8. AR (Accounts Receivable / Advance)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {job.ar.length} Remittances
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 flex gap-3">
                      <span>Total Received: {formatUSD(job.ar.reduce((s, a) => s + a.receivedAmount, 0))}</span>
                      <span>•</span>
                      <span>Advance Remittance from Principal</span>
                    </div>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat AR</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 9. PRINCIPAL INVOICE */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('INVOICE')}
                className="cursor-pointer bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        9. Principal Invoice
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300">
                        {job.principalInvoice.invoiceNo}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          job.principalInvoice.status === 'SETTLED'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {job.principalInvoice.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1 flex gap-3">
                      <span>Total: {formatUSD(job.principalInvoice.totalAmountUSD)}</span>
                      <span>•</span>
                      <span>Adv. Deducted: {formatUSD(job.principalInvoice.advanceDeductedUSD)}</span>
                      <span>•</span>
                      <span className="font-bold text-cyan-300">
                        Balance Due: {formatUSD(job.principalInvoice.balanceDueUSD)}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat Invoice</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 10. CLOSING */}
            <div className="relative group">
              <div className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-6 h-0.5 bg-slate-700 group-hover:bg-cyan-500 transition" />
              <div
                onClick={() => setActiveModalNode('CLOSING')}
                className={`cursor-pointer border rounded-xl p-4 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  job.closing.isClosed
                    ? 'bg-emerald-950/40 border-emerald-500/40 hover:bg-emerald-950/60'
                    : 'bg-slate-800/90 border-slate-700 hover:border-cyan-500/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg mt-0.5 ${
                      job.closing.isClosed
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        10. Closing (P&L & Audit Lock)
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          job.closing.isClosed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {job.closing.isClosed ? 'CLOSED & ARCHIVED' : 'OPEN / IN PROGRESS'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {job.closing.isClosed ? (
                        <span>
                          Ditutup oleh <strong>{job.closing.closedBy}</strong> pada {formatDateDisplay(job.closing.closedAt)}. Final Profit: {formatUSD(job.closing.finalGrossMarginUSD)} ({formatIDR(job.closing.finalGrossMarginIDR)})
                        </span>
                      ) : (
                        <span>
                          Pending verifikasi pelunasan dan audit penutupan voyage.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold shrink-0">
                  <span>Lihat Closing</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Node Detail Inspection Modal */}
      {activeModalNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 font-mono text-xs font-bold">
                  {job.jobId}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase">
                    Detail Node: {activeModalNode.replace('_', ' ')}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Pemeriksaan data terkait Vessel Call {job.vesselName}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveModalNode(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content depending on activeModalNode */}
            {activeModalNode === 'INQUIRY' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-400 block">Inquiry Number:</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {job.inquiry.inquiryNo}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tanggal Masuk:</span>
                    <span className="text-white font-medium">{formatDateDisplay(job.inquiry.date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Est. Port Stay:</span>
                    <span className="text-white font-medium">{job.inquiry.estimatedDays} Hari</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status:</span>
                    <span className="text-emerald-400 font-bold">{job.inquiry.status}</span>
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Cargo Details:</label>
                  <p className="bg-slate-800/60 p-3 rounded-lg text-slate-200 border border-slate-700">
                    {job.inquiry.cargoDetails}
                  </p>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Special Requirements:</label>
                  <p className="bg-slate-800/60 p-3 rounded-lg text-slate-200 border border-slate-700">
                    {job.inquiry.specialRequirements}
                  </p>
                </div>
              </div>
            )}

            {(activeModalNode === 'EPDA' || activeModalNode === 'PDA') && (
              <div className="space-y-4 text-xs">
                {(() => {
                  const quoteObj =
                    activeModalNode === 'EPDA' ? job.quotation.epda : job.quotation.pda;
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Quote Number</span>
                          <span className="font-mono font-bold text-white text-sm">
                            {quoteObj.quoteNo}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[11px]">Margin Komersial</span>
                          <span className="font-mono font-extrabold text-emerald-400 text-sm">
                            {quoteObj.marginPercentage}% ({formatUSD(quoteObj.marginAmount)})
                          </span>
                        </div>
                      </div>

                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-950 text-slate-400 text-[11px]">
                            <tr>
                              <th className="p-2.5">Item Deskripsi</th>
                              <th className="p-2.5">Category</th>
                              <th className="p-2.5 text-right">Qty</th>
                              <th className="p-2.5 text-right">Buy Rate</th>
                              <th className="p-2.5 text-right">Sell Rate</th>
                              <th className="p-2.5 text-right">Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {quoteObj.items.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-800/40">
                                <td className="p-2.5 font-medium text-white">{item.name}</td>
                                <td className="p-2.5 text-slate-400">{item.category}</td>
                                <td className="p-2.5 text-right font-mono">{item.quantity}</td>
                                <td className="p-2.5 text-right font-mono text-slate-300">
                                  {formatUSD(item.totalBuyRate)}
                                </td>
                                <td className="p-2.5 text-right font-mono text-cyan-300 font-bold">
                                  {formatUSD(item.totalSellRate)}
                                </td>
                                <td className="p-2.5 text-right font-mono text-emerald-400">
                                  {formatUSD(item.totalSellRate - item.totalBuyRate)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-950 font-bold border-t border-slate-700">
                            <tr>
                              <td colSpan={3} className="p-2.5 text-right text-slate-400">
                                Total Summary:
                              </td>
                              <td className="p-2.5 text-right text-slate-200 font-mono">
                                {formatUSD(quoteObj.totalBuyRate)}
                              </td>
                              <td className="p-2.5 text-right text-cyan-400 font-mono text-sm">
                                {formatUSD(quoteObj.totalSellRate)}
                              </td>
                              <td className="p-2.5 text-right text-emerald-400 font-mono">
                                {formatUSD(quoteObj.marginAmount)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeModalNode === 'CREW_CHANGE' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <div>
                    <span className="text-slate-400 block">Sign On</span>
                    <span className="text-lg font-bold text-white">{job.quotation.crewChange.signOnCount} Pax</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Sign Off</span>
                    <span className="text-lg font-bold text-white">{job.quotation.crewChange.signOffCount} Pax</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Logistics</span>
                    <span className="text-lg font-bold text-cyan-400 font-mono">
                      {formatUSD(job.quotation.crewChange.totalCostUSD)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-white">Passenger & Seaman Manifest:</h4>
                  {job.quotation.crewChange.members.length === 0 ? (
                    <p className="text-slate-400 italic">Belum ada kru terdaftar.</p>
                  ) : (
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                      {job.quotation.crewChange.members.map((m) => (
                        <div key={m.id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{m.name}</span>
                              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300">
                                {m.rank}
                              </span>
                              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                                {m.nationality}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  m.type === 'SIGN_ON' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {m.type}
                              </span>
                            </div>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              Passport: {m.passportNumber} • Seaman Book: {m.seamanBook} • {m.flightDetails}
                            </div>
                          </div>
                          <span className="font-mono text-cyan-400 font-semibold">
                            {formatUSD(m.transitCostUSD)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeModalNode === 'OPERATIONAL' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-400 block">ATA:</span>
                    <span className="font-bold text-white font-mono">{job.operationalData.ata || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">ATB (Berthed):</span>
                    <span className="font-bold text-white font-mono">{job.operationalData.atb || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">ATD (Departure):</span>
                    <span className="font-bold text-white font-mono">{job.operationalData.atd || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">KSOP Clearance:</span>
                    <span className="font-bold text-cyan-300 font-mono truncate block">
                      {job.operationalData.harborMasterClearanceNo || 'On Process'}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-white mb-2">Statement of Facts (SOF Logs):</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {job.operationalData.statementOfFacts.map((sof) => (
                      <div
                        key={sof.id}
                        className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex items-start gap-3"
                      >
                        <span className="font-mono text-cyan-400 text-[11px] shrink-0 font-semibold">
                          {sof.timestamp}
                        </span>
                        <div>
                          <p className="text-slate-200">{sof.event}</p>
                          {sof.remarks && (
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Catatan: {sof.remarks}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeModalNode === 'ACTUAL_COST' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Daftar Biaya Rill & Kwitansi Vendor:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    Total: {formatUSD(actualCostTotal)}
                  </span>
                </div>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950 text-slate-400 text-[11px]">
                      <tr>
                        <th className="p-2.5">No. Voucher</th>
                        <th className="p-2.5">Vendor</th>
                        <th className="p-2.5">Deskripsi</th>
                        <th className="p-2.5 text-right">Actual USD</th>
                        <th className="p-2.5 text-right">PDA Est.</th>
                        <th className="p-2.5 text-right">Variance</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {job.actualCosts.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono text-cyan-300">{c.invoiceOrVoucherNo}</td>
                          <td className="p-2.5 text-slate-300">{c.vendorName}</td>
                          <td className="p-2.5 text-white">{c.description}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{formatUSD(c.amount)}</td>
                          <td className="p-2.5 text-right font-mono text-slate-400">{formatUSD(c.pdaAmountEstimated)}</td>
                          <td className={`p-2.5 text-right font-mono ${c.varianceAmount <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatUSD(c.varianceAmount)}
                          </td>
                          <td className="p-2.5">
                            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-semibold">
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeModalNode === 'APPROVAL' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400">Status Persetujuan:</span>
                    <span className="font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded">
                      {job.managerApproval.status}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    <strong>Catatan Manager Ops:</strong>
                    <p className="mt-1 p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                      {job.managerApproval.notes || 'Tidak ada catatan khusus.'}
                    </p>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-2">
                    Disetujui oleh: {job.managerApproval.approvedBy || '-'} • {formatDateDisplay(job.managerApproval.approvedAt)}
                  </div>
                </div>
              </div>
            )}

            {activeModalNode === 'FDA' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-400 block">No. FDA:</span>
                    <span className="font-bold text-white font-mono">{job.fda.fdaNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Est. Sell PDA:</span>
                    <span className="font-bold text-white font-mono">{formatUSD(job.fda.totalEstimatedSell)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Realisasi:</span>
                    <span className="font-bold text-cyan-400 font-mono">{formatUSD(job.fda.totalActualCost)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Audit Status:</span>
                    <span className="font-bold text-emerald-400">{job.fda.fdaApproved ? 'APPROVED' : 'PENDING'}</span>
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300">
                  <strong>Notes Rekonsiliasi:</strong> {job.fda.notes}
                </div>
              </div>
            )}

            {activeModalNode === 'AP' && (
              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-white">Accounts Payable (Vendor & Port Dues):</h4>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  {job.ap.map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white">{item.vendorName}</span>
                        <span className="text-slate-400 block text-[11px]">
                          {item.voucherNo} • {item.description}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-white block">
                          {formatUSD(item.amount)}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeModalNode === 'AR' && (
              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-white">Accounts Receivable (Advances & Remittances):</h4>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  {job.ar.map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white">{item.principalName}</span>
                        <span className="text-slate-400 block text-[11px]">
                          Ref: {item.referenceNo} • {item.description}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400 block">
                          {formatUSD(item.receivedAmount)}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeModalNode === 'INVOICE' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Nomor Invoice Principal</span>
                      <span className="font-mono font-black text-white text-base">
                        {job.principalInvoice.invoiceNo}
                      </span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                      {job.principalInvoice.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <span className="text-slate-400">Tgl Invoice:</span>
                      <span className="text-white ml-2 font-mono">{formatDateDisplay(job.principalInvoice.invoiceDate)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Due Date:</span>
                      <span className="text-white ml-2 font-mono">{formatDateDisplay(job.principalInvoice.dueDate)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Total Billed:</span>
                      <span className="text-cyan-300 ml-2 font-mono font-bold">
                        {formatUSD(job.principalInvoice.totalAmountUSD)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Advance Deducted:</span>
                      <span className="text-emerald-400 ml-2 font-mono font-bold">
                        - {formatUSD(job.principalInvoice.advanceDeductedUSD)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-lg flex items-center justify-between">
                    <span className="font-bold text-white">Net Balance Due:</span>
                    <span className="font-mono font-black text-cyan-300 text-base">
                      {formatUSD(job.principalInvoice.balanceDueUSD)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeModalNode === 'CLOSING' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status Penutupan:</span>
                    <span
                      className={`font-bold px-2.5 py-1 rounded ${
                        job.closing.isClosed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {job.closing.isClosed ? 'CLOSED' : 'OPEN'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <span className="text-slate-400 block">Gross Profit USD:</span>
                      <span className="text-emerald-400 font-mono font-black text-base">
                        {formatUSD(job.closing.finalGrossMarginUSD || grossProfit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Gross Profit IDR:</span>
                      <span className="text-emerald-400 font-mono font-black text-base">
                        {formatIDR((job.closing.finalGrossMarginUSD || grossProfit) * job.exchangeRateUSDToIDR)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block font-semibold mb-1">Post-Voyage Remarks:</label>
                    <p className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                      {job.closing.postVoyageRemarks || 'Belum ada catatan penutupan voyage.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setActiveModalNode(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

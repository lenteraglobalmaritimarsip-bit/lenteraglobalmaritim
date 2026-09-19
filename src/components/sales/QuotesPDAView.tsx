import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Coins,
  Plus,
  Trash2,
  Save,
  Send,
  Ship,
  CheckCircle2,
  Users,
  Printer,
  Eye,
  DollarSign,
} from 'lucide-react';
import { JobCall, DisbursementItem, Currency, ExpensesItem } from '../../types';
import { db } from '../../db/storage';

interface QuotesPDAViewProps {
  job: JobCall;
  expensesItems: ExpensesItem[];
  onSelectJob: (jobId: string) => void;
  onDataSaved?: () => void;
}

export const QuotesPDAView: React.FC<QuotesPDAViewProps> = ({
  job,
  expensesItems,
  onSelectJob,
  onDataSaved,
}) => {
  const isReviewOnly = false;
  const [viewCurrency, setViewCurrency] = useState<Currency>('USD');
  const [items, setItems] = useState<DisbursementItem[]>(job.quotation.pda.items || []);
  const [exchangeRate, setExchangeRate] = useState<number>(job.exchangeRateUSDToIDR || 15800);
  const [isSaved, setIsSaved] = useState(false);

  const formatAmount = (usdVal: number) => {
    if (viewCurrency === 'IDR') {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(usdVal * exchangeRate);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(usdVal);
  };

  const totalBuyUSD = items.reduce((sum, it) => sum + it.totalBuyRate, 0);
  const totalSellUSD = items.reduce((sum, it) => sum + it.totalSellRate, 0);
  const marginUSD = totalSellUSD - totalBuyUSD;
  const marginPct = totalSellUSD > 0 ? ((marginUSD / totalSellUSD) * 100).toFixed(2) : '0.00';
  const categoryLabel = (category: string) => category === 'CREW_CHANGE'
    ? 'CREW CHANGES'
    : category.replaceAll('_', ' ');
  const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const buildPDAHtml = () => {
    const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(categoryLabel(item.category))}</td><td style="text-align:right">${item.quantity || 1}</td><td style="text-align:right">${escapeHtml(formatAmount(item.totalBuyRate))}</td><td style="text-align:right">${escapeHtml(formatAmount(item.totalSellRate))}</td><td style="text-align:right">${escapeHtml(formatAmount(item.totalSellRate - item.totalBuyRate))}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>PDA ${escapeHtml(job.jobId)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172033;font-size:10px;line-height:1;margin:0}h1{font-size:20px;margin:0 0 4px}h2{text-align:center;background:#182a50;color:#fff;padding:8px;font-size:13px;margin:16px 0 10px}.muted{color:#667085;font-size:9px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:0 30px;margin-bottom:10px}.meta div{padding:2px 0}table{width:100%;border-collapse:collapse;line-height:1}th,td{border:1px solid #777;padding:6px;line-height:1}th{background:#e8ecf2;text-align:center;text-transform:uppercase;font-size:9px}.total{font-weight:700;background:#f1f3f6}.footer{margin-top:16px;text-align:center;font-size:8px;color:#667085}</style></head><body><h1>PT Lentera Global Maritim</h1><div class="muted">Proforma Disbursement Account (PDA)</div><h2>PROFORMA DISBURSEMENT ACCOUNT</h2><div class="meta"><div><b>Job ID</b> : ${escapeHtml(job.jobId)}<br><b>Principal</b> : ${escapeHtml(job.customerName)}<br><b>Vessel</b> : ${escapeHtml(job.vesselName)}</div><div><b>Quote No.</b> : ${escapeHtml(job.quotation.pda.quoteNo)}<br><b>Port</b> : ${escapeHtml(job.portName)}<br><b>ETA / ETD</b> : ${escapeHtml(job.eta)} / ${escapeHtml(job.etd)}</div></div><table><thead><tr><th>No.</th><th>Item Layanan</th><th>Kategori</th><th>Qty</th><th>Total BUY</th><th>Total SELL</th><th>Margin</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="4" style="text-align:right">TOTAL PDA</td><td style="text-align:right">${escapeHtml(formatAmount(totalBuyUSD))}</td><td style="text-align:right">${escapeHtml(formatAmount(totalSellUSD))}</td><td style="text-align:right">${escapeHtml(formatAmount(marginUSD))} (${marginPct}%)</td></tr></tbody></table><div class="footer">PT Lentera Global Maritim - ${escapeHtml(job.jobId)} - PDA</div></body></html>`;
  };

  const openPDAPreview = (print = false) => {
    const previewBlobUrl = URL.createObjectURL(new Blob([buildPDAHtml()], { type: 'text/html;charset=utf-8' }));
    const previewWindow = window.open(previewBlobUrl, '_blank', 'noopener,noreferrer,width=1100,height=800');
    if (!previewWindow) return;
    if (print) {
      setTimeout(() => {
        previewWindow.focus();
        previewWindow.print();
        setTimeout(() => URL.revokeObjectURL(previewBlobUrl), 15000);
      }, 250);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(previewBlobUrl), 15000);
  };

  const handleSavePDA = () => {
    if (isReviewOnly) return;
    if (job.quotation.epda.status !== 'SUBMITTED' && job.quotation.epda.status !== 'APPROVED') {
      window.alert('PDA belum dapat diajukan. Sales harus menyelesaikan dan Submit EPDA terlebih dahulu.');
      return;
    }
    db.updateJob(job.jobId, {
      exchangeRateUSDToIDR: exchangeRate,
      status: 'QUOTED',
      quotation: {
        ...job.quotation,
        pda: {
          ...job.quotation.pda,
          items,
          totalBuyRate: totalBuyUSD,
          totalSellRate: totalSellUSD,
          marginAmount: marginUSD,
          marginPercentage: parseFloat(marginPct),
          status: 'SUBMITTED',
        },
      },
      currentStage: 'QUOTATION',
      managerApproval: {
        ...job.managerApproval,
        status: 'PENDING',
      },
    });

    onDataSaved?.();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded uppercase">
              SALES / QUOTES SUB-MENU
            </span>
            <span className="text-xs font-mono font-bold text-cyan-300">
              JOB ID: {job.jobId}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            Quotes PDA (Proforma Disbursement Account)
          </h1>
          <p className="text-xs text-slate-400">
            Kutipan resmi Proforma Disbursement untuk diajukan ke Principal {job.customerName} setelah persetujuan Manager Ops
          </p>
        </div>

        {/* Currency & Actions Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Currency Switcher: IDR / USD */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewCurrency('USD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewCurrency === 'USD'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>USD ($)</span>
            </button>
            <button
              onClick={() => setViewCurrency('IDR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewCurrency === 'IDR'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>IDR (Rp)</span>
            </button>
          </div>

          {!isReviewOnly && <button
            onClick={handleSavePDA}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            <span>Submit PDA ke Manager Ops</span>
          </button>}
          {isReviewOnly && <span className="px-4 py-2 rounded-xl bg-slate-700 text-white text-xs font-bold">REVIEW ONLY · APPROVED</span>}
        </div>
      </div>

      {isSaved && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Quotes PDA berhasil disimpan dan diajukan ke antrian Approval Manager Ops!</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-xs uppercase font-bold text-slate-400 block">
            Quote Number
          </span>
          <span className="text-base font-black text-white font-mono mt-1 block truncate">
            {job.quotation.pda.quoteNo}
          </span>
          <span className="text-[11px] text-slate-400">
            Status: <strong className="text-amber-400 uppercase">{job.quotation.pda.status}</strong>
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-xs uppercase font-bold text-slate-400 block">
            Total BUY (Vendor/Pelindo)
          </span>
          <span className="text-xl font-black text-slate-200 font-mono mt-1 block">
            {formatAmount(totalBuyUSD)}
          </span>
          <span className="text-[11px] text-slate-400">
            Biaya dasar operasional
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-xs uppercase font-bold text-slate-400 block">
            Total SELL (To Principal)
          </span>
          <span className="text-xl font-black text-cyan-300 font-mono mt-1 block">
            {formatAmount(totalSellUSD)}
          </span>
          <span className="text-[11px] text-slate-400">
            Total proforma diajukan
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-xs uppercase font-bold text-slate-400 block">
            Komersial Margin
          </span>
          <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
            +{formatAmount(marginUSD)}
          </span>
          <span className="text-xs font-bold text-emerald-400">
            Margin: {marginPct}%
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">Inquiry Vessel Details</div>
            <h2 className="text-lg font-black text-white mt-1">Informasi Lengkap Inquiry Vessel</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Inquiry No</div><div className="mt-1 font-bold text-cyan-300 font-mono">{job.inquiry.inquiryNo}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Tanggal Inquiry</div><div className="mt-1 font-bold text-white">{job.inquiry.date}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Status Inquiry</div><div className="mt-1 font-bold text-emerald-300">{job.inquiry.status}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Dibuat Oleh</div><div className="mt-1 font-bold text-white">{job.inquiry.createdBy || 'System'}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Branch</div><div className="mt-1 font-bold text-white">{job.inquiry.createdByBranch || 'Head Office'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel</div><div className="mt-1 font-bold text-white">{job.vesselName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">IMO</div><div className="mt-1 font-bold text-white font-mono">{job.vesselName ? '9456782' : '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Call Sign / Flag</div><div className="mt-1 font-bold text-white font-mono">- / -</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Principal</div><div className="mt-1 font-bold text-white">{job.customerName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Port</div><div className="mt-1 font-bold text-white">{job.portName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETA</div><div className="mt-1 font-bold text-white font-mono">{job.eta}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETD</div><div className="mt-1 font-bold text-white font-mono">{job.etd}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETA</div><div className="mt-1 font-bold text-white">{job.inquiry.etaRemarks || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETD</div><div className="mt-1 font-bold text-white">{job.inquiry.etdRemarks || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Quantity</div><div className="mt-1 font-bold text-white">{job.inquiry.quantity || 0} {job.inquiry.quantityUnit || 'TON'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Purpose</div><div className="mt-1 font-bold text-white">{job.purposeOfCall}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Estimated Days</div><div className="mt-1 font-bold text-white">{job.inquiry.estimatedDays || 0} hari</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Cargo Details</div><div className="mt-1 font-bold text-white">{job.inquiry.cargoDetails || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel Type</div><div className="mt-1 font-bold text-white">-</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Gross / Net / DWT</div><div className="mt-1 font-bold text-white font-mono">- / - / -</div></div>

          <div className="md:col-span-2 xl:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 uppercase tracking-wider">Special Requirements</div>
            <div className="mt-1 text-white leading-relaxed">{job.inquiry.specialRequirements || 'Tidak ada requirement khusus.'}</div>
          </div>
        </div>
      </div>

      {/* PDA Proforma Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-white uppercase tracking-wider">
              Itemized Proforma Disbursement Account
            </h2>
            <p className="text-xs text-slate-400">
              Disusun untuk Principal: {job.customerName} • Vessel: {job.vesselName} (IMO: 9456782)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openPDAPreview(false)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Lihat Hasil PDA</button>
            <button type="button" onClick={() => openPDAPreview(true)} className="px-3 py-2 rounded-lg bg-white text-slate-900 text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" />Cetak / PDF PDA</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3">Item Layanan</th>
                <th className="p-3">Kategori</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-right">Unit Buy Rate</th>
                <th className="p-3 text-right">Unit Sell Rate</th>
                <th className="p-3 text-right">Total BUY</th>
                <th className="p-3 text-right">Total SELL (PDA)</th>
                <th className="p-3 text-right">Margin Keuntungan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-bold text-white">{it.name}</td>
                  <td className="p-3 text-slate-400 font-mono text-[11px]">{categoryLabel(it.category)}</td>
                  <td className="p-3 text-right font-mono text-slate-200">{it.quantity}</td>
                  <td className="p-3 text-right font-mono text-slate-400">{formatAmount(it.unitBuyRate)}</td>
                  <td className="p-3 text-right font-mono text-cyan-300 font-bold">{formatAmount(it.unitSellRate)}</td>
                  <td className="p-3 text-right font-mono text-slate-300">{formatAmount(it.totalBuyRate)}</td>
                  <td className="p-3 text-right font-mono text-cyan-300 font-bold">{formatAmount(it.totalSellRate)}</td>
                  <td className="p-3 text-right font-mono text-emerald-400 font-bold">
                    +{formatAmount(it.totalSellRate - it.totalBuyRate)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-950 font-bold border-t border-slate-700 text-xs">
              <tr>
                <td colSpan={5} className="p-3 text-right text-slate-400 uppercase">
                  Total Final PDA:
                </td>
                <td className="p-3 text-right font-mono text-slate-200">
                  {formatAmount(totalBuyUSD)}
                </td>
                <td className="p-3 text-right font-mono text-cyan-400 text-sm">
                  {formatAmount(totalSellUSD)}
                </td>
                <td className="p-3 text-right font-mono text-emerald-400 text-sm">
                  +{formatAmount(marginUSD)} ({marginPct}%)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

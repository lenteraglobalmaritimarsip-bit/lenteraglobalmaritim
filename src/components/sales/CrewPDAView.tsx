import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { JobCall, Vessel, formatPurposeOfCall } from '../../types';
import { formatInquiryDate } from '../../utils/date';

interface CrewPDAViewProps {
  job?: JobCall;
  vessels: Vessel[];
  onBack: () => void;
}

interface PdaEntryItem {
  id: number;
  description: string;
  quantity: number;
  unit: string;
  price: number;
  remarks: string;
  vatApplied: boolean;
}

type PdaEntryMode = 'AUTO' | 'MANUAL';

const PDA_COST_CATEGORIES = [
  ['PORT_SERVICE', 'PORT SERVICE'],
  ['PORT_EXPENSES', 'PORT EXPENSES'],
  ['CLEARANCE', 'CLEARANCE IN/OUT'],
  ['GENERAL_EXPENSES', 'GENERAL EXPENSES'],
  ['CREW_EXPENSES', 'CREW EXPENSES'],
  ['OWNER_MATTER', 'OWNER MATTER'],
  ['AGENCY_FEE', 'AGENCY FEE'],
];

const escapeHtml = (value: string | number) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(amount || 0) + ` ${currency}`;

const createPreviewHtml = (job: JobCall, items: PdaEntryItem[], currency: string) => {
  const rows = items.map((item, index) => {
    const amount = item.quantity * item.price;
    return `<tr>
      <td class="number">${index + 1}</td><td>${escapeHtml(item.description || '-')}</td>
      <td class="number">${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit || '-')}</td>
      <td class="amount">${escapeHtml(formatAmount(item.price, currency))}</td>
      <td class="amount">${escapeHtml(formatAmount(amount, currency))}</td><td>${escapeHtml(item.remarks || '-')}</td>
    </tr>`;
  }).join('');
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const vat = items.reduce((sum, item) => sum + (item.vatApplied ? item.quantity * item.price * 0.11 : 0), 0);
  const total = subtotal + vat;

  return `<!doctype html><html><head><meta charset="utf-8"><title>PDA Crew - ${escapeHtml(job.jobId)}</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    body{font-family:Arial,sans-serif;color:#172033;font-size:11px}
    .header{text-align:center;margin-bottom:14px}.brand{font-size:20px;font-weight:700;color:#3562a8}
    h1{text-align:center;font-size:16px;margin:12px 0 18px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 32px;margin-bottom:18px}
    .meta-row{display:grid;grid-template-columns:125px 12px 1fr}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #111;padding:5px 7px;vertical-align:top}
    th{text-align:center;font-weight:400;font-size:13px}
    th:nth-child(1){width:3%}th:nth-child(2){width:42%}th:nth-child(3){width:4%}
    th:nth-child(4){width:8%}th:nth-child(5){width:12%}th:nth-child(6){width:12%}th:nth-child(7){width:19%}
    .number{text-align:center}.amount{text-align:right;white-space:nowrap}.grand-total td{font-weight:700}
  </style></head><body>
    <header class="header"><div class="brand">PT Lentera Global Maritim</div><div>Seamless Agent, Global Reach</div></header>
    <h1>PORT DISBURSEMENT ACCOUNT - CREW CHANGE</h1>
    <section class="meta">
      <div class="meta-row"><strong>Principal</strong><span>:</span><span>${escapeHtml(job.customerName)}</span></div>
      <div class="meta-row"><strong>Vessel</strong><span>:</span><span>${escapeHtml(job.vesselName)}</span></div>
      <div class="meta-row"><strong>Job / Vessel Call</strong><span>:</span><span>${escapeHtml(job.jobId)}</span></div>
      <div class="meta-row"><strong>Port</strong><span>:</span><span>${escapeHtml(job.portName)}</span></div>
      <div class="meta-row"><strong>ETA / ETD</strong><span>:</span><span>${escapeHtml(job.eta || '-')} / ${escapeHtml(job.etd || '-')}</span></div>
      <div class="meta-row"><strong>Inquiry No</strong><span>:</span><span>${escapeHtml(job.inquiry.inquiryNo)}</span></div>
    </section>
    <table><thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Unit</th><th>Price</th><th>Amount</th><th>Remarks</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center">Belum ada item PDA</td></tr>'}
      <tr><td colspan="5" style="text-align:right">Subtotal</td><td class="amount">${escapeHtml(formatAmount(subtotal, currency))}</td><td></td></tr>
      ${vat > 0 ? `<tr><td colspan="5" style="text-align:right">VAT 11%</td><td class="amount">${escapeHtml(formatAmount(vat, currency))}</td><td></td></tr>` : ''}
      <tr class="grand-total"><td colspan="5" style="text-align:right">Grand Total</td><td class="amount">${escapeHtml(formatAmount(total, currency))}</td><td></td></tr></tbody>
    </table>
  </body></html>`;
};

export const CrewPDAView: React.FC<CrewPDAViewProps> = ({ job, vessels, onBack }) => {
  const [items, setItems] = useState<PdaEntryItem[]>([]);
  const [currency, setCurrency] = useState(job?.quotation?.epda?.currency || job?.currency || 'USD');
  const [exchangeRate, setExchangeRate] = useState(job?.exchangeRateUSDToIDR || 0);
  const [eta, setEta] = useState(job?.eta || '');
  const [etd, setEtd] = useState(job?.etd || '');
  const [etaRemarks, setEtaRemarks] = useState(job?.inquiry?.etaRemarks || '');
  const [etdRemarks, setEtdRemarks] = useState(job?.inquiry?.etdRemarks || '');
  const [entryMode, setEntryMode] = useState<PdaEntryMode>('AUTO');
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'CREW_EXPENSES',
    type: 'FIXED' as 'FIXED' | 'VARIABLE' | 'QTY_CARGO',
    rate: 0,
    quantity: 1,
    unit: '',
    remarks: '',
    vatApplied: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const vesselMaster = vessels.find((vessel) => vessel.id === job?.vesselId);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.price * (item.vatApplied ? 1.11 : 1), 0),
    [items],
  );
  const tariffAmount = useMemo(() => {
    const rate = Number(newItem.rate) || 0;
    if (newItem.type === 'VARIABLE') return (Number(vesselMaster?.grt) || 0) * rate;
    if (newItem.type === 'QTY_CARGO') return (Number(job?.inquiry?.cargoQuantity) || 0) * rate;
    return rate;
  }, [job?.inquiry?.cargoQuantity, newItem.rate, newItem.type, vesselMaster?.grt]);
  const entryAmount = tariffAmount * (Number(newItem.quantity) || 0);

  const updateItem = (id: number, changes: Partial<PdaEntryItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  };
  const addItem = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = newItem.name.trim();
    if (!description) return;
    setItems((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        description,
        quantity: Number(newItem.quantity) || 1,
        unit: newItem.unit.trim(),
        price: tariffAmount,
        remarks: newItem.remarks.trim(),
        vatApplied: newItem.vatApplied,
      },
    ]);
    setNewItem((current) => ({ ...current, name: '', quantity: 1, unit: '', remarks: '', vatApplied: false }));
  };

  if (!job) {
    return <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">Pilih Job terlebih dahulu untuk mengisi PDA Crew.</div>;
  }

  const detailCards = [
    ['Inquiry No', job.inquiry.inquiryNo],
    ['Date Quotes', formatInquiryDate(job.quotation?.epda?.date || job.inquiry.date)],
    ['Status Inquiry', job.inquiry.status],
    ['Dibuat Oleh', job.inquiry.createdByName || job.inquiry.createdBy || 'System'],
    ['Branch', job.inquiry.createdByBranch || '-'],
    ['Vessel', job.vesselName],
    ['IMO', vesselMaster?.imoNumber || '-'],
    ['Call Sign / Flag', `${vesselMaster?.callSign || '-'} / ${vesselMaster?.flag || '-'}`],
    ['Principal', job.customerName],
    ['Port', job.portName],
    ['ETA', job.inquiry.eta || job.eta || '-'],
    ['ETD', job.inquiry.etd || job.etd || '-'],
    ['Keterangan ETA', etaRemarks || '-'],
    ['Keterangan ETD', etdRemarks || '-'],
    ['Cargo Quantity', `${job.inquiry.cargoQuantity || 0} ${job.inquiry.quantityUnit || 'TON'}`],
    ['Purpose', formatPurposeOfCall(job.purposeOfCall)],
    ['Estimated Days', `${job.inquiry.estimatedDays || 0} hari`],
    ['Cargo Details', job.inquiry.cargoDetails || '-'],
    ['Vessel Type', vesselMaster?.vesselType || '-'],
    ['Gross / Net / DWT', `${vesselMaster?.grt?.toLocaleString() || '-'} / ${vesselMaster?.nrt?.toLocaleString() || '-'} / ${vesselMaster?.dwt?.toLocaleString() || '-'}`],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
            <FileSpreadsheet className="h-4 w-4" /><span>SALES / PDA</span><span className="text-cyan-300">• JOB ID: {job.jobId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-white">Create PDA Crew</h1>
          <p className="text-xs text-slate-400">Port Disbursement Account untuk kebutuhan Crew Change</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-1.5">
            <button type="button" onClick={() => setCurrency('IDR')} className={`h-12 rounded-lg px-5 text-base font-bold ${currency === 'IDR' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>IDR (Rp)</button>
            <button type="button" onClick={() => setCurrency('USD')} className={`h-12 rounded-lg px-5 text-base font-bold ${currency === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>USD ($)</button>
          </div>
          <label className="flex h-16 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-5 text-base text-slate-300">
            Kurs USD
            <input type="number" min={1} step={1} value={exchangeRate} onChange={(event) => setExchangeRate(Number(event.target.value) || 0)} className="h-9 w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 text-right text-base text-white" />
          </label>
          <button type="button" disabled title="Fungsi PDA akan tersedia berikutnya" className="flex h-[54px] cursor-not-allowed items-center gap-2 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white opacity-60">
            <Send className="h-6 w-6" /> Kirim ke Manager OPS
          </button>
          <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Quotes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">No. PDA</span><b className="mt-1 block font-mono text-cyan-300">UI Draft</b></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">Principal / Vessel</span><b className="mt-1 block text-white">{job.customerName} • {job.vesselName}</b></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">Grand Total</span><span className="mt-1 block font-mono text-emerald-300">{formatAmount(total, currency)}</span></div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">Inquiry Vessel Details</div>
          <h2 className="mt-1 text-lg font-black text-white">Informasi Lengkap Inquiry Vessel</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
          {detailCards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="uppercase tracking-wider text-slate-400">{label}</div>
              <div className="mt-1 font-bold text-white">{value}</div>
            </div>
          ))}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 md:col-span-2 xl:col-span-4">
            <div className="uppercase tracking-wider text-slate-400">Special Requirements</div>
            <div className="mt-1 leading-relaxed text-white">{job.inquiry.specialRequirements || 'Tidak ada requirement khusus.'}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">PDA Crew</div>
          <h2 className="mt-1 text-lg font-black text-white">Create PDA Crew</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          <label className="text-slate-400">ETA<input type="datetime-local" value={eta} onChange={(event) => setEta(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white" /></label>
          <label className="text-slate-400">ETD<input type="datetime-local" value={etd} onChange={(event) => setEtd(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white" /></label>
          <label className="text-slate-400">Keterangan ETA<input type="text" value={etaRemarks} onChange={(event) => setEtaRemarks(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" /></label>
          <label className="text-slate-400">Keterangan ETD<input type="text" value={etdRemarks} onChange={(event) => setEtdRemarks(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div><h2 className="text-base font-bold uppercase tracking-wider text-white">Hasil Entry PDA Crew</h2><span className="text-xs text-slate-400">Hasil entry sementara Estimasi Biaya Crew Change</span></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"><CheckCircle2 className="h-3.5 w-3.5"/>Lihat Hasil PDA</button>
            <button type="button" onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900"><Printer className="h-3.5 w-3.5"/>Cetak / PDF</button>
          </div>
        </div>
        <div className="mb-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr>
              <th className="border-l border-slate-700 p-3.5">No</th><th className="border-l border-slate-700 p-3.5">Description</th><th className="border-l border-slate-700 p-3.5 text-right">Qty</th><th className="border-l border-slate-700 p-3.5">Unit</th><th className="border-l border-slate-700 p-3.5 text-right">Price ({currency})</th><th className="border-l border-slate-700 p-3.5 text-right">Amount ({currency})</th><th className="border-l border-slate-700 p-3.5">Remarks</th><th className="border-l border-slate-700 p-3.5">Aksi</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item, index) => (
                <tr key={item.id} className="transition-colors hover:bg-slate-700/40">
                  <td className="border-l border-slate-800 p-3.5 font-mono text-slate-300">{index + 1}</td>
                  <td className="border-l border-slate-800 p-3.5"><input value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} placeholder="Nama layanan / kebutuhan crew" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white placeholder-slate-500" /></td>
                  <td className="border-l border-slate-800 p-3.5"><input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) || 0 })} className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-right text-white" /></td>
                  <td className="border-l border-slate-800 p-3.5"><input value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} placeholder="Pax / Trip" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white placeholder-slate-500" /></td>
                  <td className="border-l border-slate-800 p-3.5"><input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(item.id, { price: Number(event.target.value) || 0 })} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-right text-white" /></td>
                  <td className="border-l border-slate-800 p-3.5 text-right font-mono font-bold text-white">{formatAmount(item.quantity * item.price, currency)}</td>
                  <td className="border-l border-slate-800 p-3.5"><input value={item.remarks} onChange={(event) => updateItem(item.id, { remarks: event.target.value })} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white" /></td>
                  <td className="border-l border-slate-800 p-3.5"><button type="button" title="Hapus item" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded p-1.5 text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">Belum ada item. Klik Tambah Item untuk mulai entry.</td></tr>}
              <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-3.5 text-right font-bold uppercase tracking-wider text-slate-200">Grand Total</td><td className="border-l border-slate-800 p-3.5 text-right font-mono text-xs font-bold text-white">{formatAmount(total, currency)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>
            </tbody>
          </table>
        </div>
        <div className="mb-4 rounded-2xl border border-slate-300 bg-[#edf2f4] p-5 shadow-sm">
          <form onSubmit={addItem}>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2 text-emerald-600">
                <Plus className="h-4 w-4" />
                <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">
                  {entryMode === 'AUTO' ? 'Tambah Item PDA Otomatis' : 'Tambah Item PDA Manual'}
                </h3>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setEntryMode('AUTO')} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${entryMode === 'AUTO' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>Otomatis</button>
                  <button type="button" onClick={() => setEntryMode('MANUAL')} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${entryMode === 'MANUAL' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>Manual</button>
                </div>
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500">
                  <Plus className="h-4 w-4" /> TAMBAH ITEM
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {entryMode === 'AUTO'
                ? 'Otomatis: FIXED = Tarif x QTY; VARIABLE = GRT x Tarif x QTY; QTY_CARGO = Quantity Cargo x Tarif x QTY.'
                : 'Manual: masukkan item service, kategori biaya, tarif, QTY, dan keterangan.'}
            </p>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs font-normal md:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-slate-600">Item Service</label>
                <input
                  value={newItem.name}
                  onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                  placeholder={entryMode === 'AUTO' ? 'Search disini' : 'Nama item crew'}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                />
                {entryMode === 'AUTO' && <span className="mt-1 block text-[10px] text-slate-500">Pencarian master hanya tampilan; koneksi master PDA belum diaktifkan.</span>}
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Category Cost</label>
                <select value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none">
                  {PDA_COST_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Type</label>
                <select value={newItem.type} onChange={(event) => setNewItem({ ...newItem, type: event.target.value as typeof newItem.type })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none">
                  <option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_CARGO">QTY_CARGO</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Rate</label>
                <input type="number" min="0" step="0.0001" value={newItem.rate} onChange={(event) => setNewItem({ ...newItem, rate: Number(event.target.value) || 0 })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">QTY</label>
                <input type="number" min="1" step="1" value={newItem.quantity} onChange={(event) => setNewItem({ ...newItem, quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-1 block text-slate-600">Tarif ({currency})</label>
                  <input readOnly value={formatAmount(tariffAmount, currency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" />
                </div>
                <div>
                  <label className="mb-1 block text-slate-600">Amount ({currency})</label>
                  <input readOnly value={formatAmount(entryAmount, currency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500" />
                </div>
                <div>
                  <label className="mb-1 block text-slate-600">Unit</label>
                  <input value={newItem.unit} onChange={(event) => setNewItem({ ...newItem, unit: event.target.value })} placeholder="Pax / Trip" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div className="lg:col-span-6">
                <label className="mb-1 block text-slate-600">Remark</label>
                <input value={newItem.remarks} onChange={(event) => setNewItem({ ...newItem, remarks: event.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" checked={newItem.vatApplied} onChange={(event) => setNewItem({ ...newItem, vatApplied: event.target.checked })} /> VAT 11%</label>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-slate-500">Formula entry sementara: FIXED = Rate; VARIABLE = GRT x Rate; QTY_CARGO = Cargo Quantity x Rate; Amount = Tarif x QTY.</div>
          </form>
        </div>
      </section>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 p-3">
              <div><div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Preview PDA Crew</div><div className="text-sm text-white">{job.jobId}</div></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => printFrameRef.current?.contentWindow?.print()} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-600">Cetak / Simpan PDF</button>
                <button type="button" onClick={() => setShowPreview(false)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">Tutup</button>
              </div>
            </div>
            <iframe ref={printFrameRef} title={`Pratinjau PDA Crew ${job.jobId}`} srcDoc={createPreviewHtml(job, items, currency)} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
};

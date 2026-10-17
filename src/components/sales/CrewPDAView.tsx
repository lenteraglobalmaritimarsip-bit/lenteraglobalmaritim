import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, FileSpreadsheet, Pencil, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import { JobCall, Vessel, formatPurposeOfCall } from '../../types';
import { formatInquiryDate } from '../../utils/date';
import { openPdaDraft, savePdaDraft } from '../../lib/api';

interface CrewPDAViewProps {
  job?: JobCall;
  vessels: Vessel[];
  onBack: () => void;
}

interface PdaEntryItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  price: number;
  remarks: string;
  vatApplied: boolean;
}

type PdaItemEditDraft = Omit<PdaEntryItem, 'id'>;

const PDA_COST_CATEGORIES = [
  ['SIGN_ON_CREW', 'SIGN-ON Crew'],
  ['SIGN_OFF_CREW', 'SIGN-OFF Crew'],
  ['CREW_MUTATION', 'Crew Mutation'],
  ['MEDICAL_TREATMENT', 'Medical Treatment'],
  ['CREW_BRIEFING', 'Crew Briefing'],
] as const;

const groupPdaItems = (items: PdaEntryItem[]) =>
  PDA_COST_CATEGORIES.map(([category, label]) => ({
    category,
    label,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

const escapeHtml = (value: string | number) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(amount || 0) + ` ${currency}`;

const createPreviewHtml = (job: JobCall, items: PdaEntryItem[], currency: string, pdaNo: string) => {
  const groupedItems = groupPdaItems(items);
  const rows = groupedItems.map((group, groupIndex) => {
    const groupTotal = group.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const groupVat = group.items.reduce((sum, item) => sum + (item.vatApplied ? item.quantity * item.price * 0.11 : 0), 0);
    const itemRows = group.items.map((item, index) => {
      const amount = item.quantity * item.price;
      return `<tr>
        <td class="number">${index + 1}</td><td>${escapeHtml(item.description || '-')}</td>
        <td class="number">${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit || '-')}</td>
        <td class="amount">${escapeHtml(formatAmount(item.price, currency))}</td>
        <td class="amount">${escapeHtml(formatAmount(amount, currency))}</td><td>${escapeHtml(item.remarks || '-')}</td>
      </tr>`;
    }).join('');
    return `<tr class="category"><td colspan="7">${escapeHtml(group.label)}</td></tr>${itemRows}
      <tr class="subtotal"><td colspan="5">TOTAL ${escapeHtml(group.label)}</td><td class="amount">${escapeHtml(formatAmount(groupTotal, currency))}</td><td></td></tr>
      ${groupVat > 0 ? `<tr class="subtotal"><td colspan="5">VAT 11%</td><td class="amount">${escapeHtml(formatAmount(groupVat, currency))}</td><td></td></tr>` : ''}
      <tr class="subtotal"><td colspan="5">SUB TOTAL ${groupIndex + 1}</td><td class="amount">${escapeHtml(formatAmount(groupTotal + groupVat, currency))}</td><td></td></tr>`;
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
    .category td{background:#4b5563;color:#fff;font-weight:700;text-transform:uppercase}
    .subtotal td{font-weight:700}
  </style></head><body>
    <header class="header"><div class="brand">PT Lentera Global Maritim</div><div>Seamless Agent, Global Reach</div></header>
    <h1>PORT DISBURSEMENT ACCOUNT - CREW CHANGE</h1>
    <section class="meta">
      <div class="meta-row"><strong>PDA No</strong><span>:</span><span>${escapeHtml(pdaNo)}</span></div>
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
  const [pdaNo, setPdaNo] = useState('');
  const [draftError, setDraftError] = useState('');
  const [draftStatus, setDraftStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [loadedDraftJobId, setLoadedDraftJobId] = useState('');
  const [draftLoadAttempt, setDraftLoadAttempt] = useState(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditDraft, setItemEditDraft] = useState<PdaItemEditDraft | null>(null);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'SIGN_ON_CREW',
    price: 0,
    quantity: 1,
    unit: '',
    remarks: '',
    vatApplied: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const draftRevisions = useRef(new Map<string, number>());
  const draftSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const activeJobId = useRef(job?.jobId);
  activeJobId.current = job?.jobId;
  const draftLoaded = !!job && loadedDraftJobId === job.jobId;
  const vesselMaster = vessels.find((vessel) => vessel.id === job?.vesselId);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.price * (item.vatApplied ? 1.11 : 1), 0),
    [items],
  );
  const entryAmount = (Number(newItem.price) || 0) * (Number(newItem.quantity) || 0);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    setPdaNo('');
    setDraftError('');
    setLoadedDraftJobId('');
    setDraftStatus('loading');
    void openPdaDraft(job.jobId, {
      currency: job.quotation?.epda?.currency || job.currency || 'USD',
      exchangeRate: job.exchangeRateUSDToIDR || 0,
      eta: job.eta || '',
      etd: job.etd || '',
      etaRemarks: job.inquiry.etaRemarks || '',
      etdRemarks: job.inquiry.etdRemarks || '',
    })
      .then((draft) => {
        if (cancelled) return;
        setPdaNo(draft.pdaNo);
        setCurrency(draft.currency);
        setExchangeRate(draft.exchangeRate);
        setEta(draft.eta);
        setEtd(draft.etd);
        setEtaRemarks(draft.etaRemarks);
        setEtdRemarks(draft.etdRemarks);
        setNewItem(draft.itemDraft);
        setItems(draft.items);
        draftRevisions.current.set(job.jobId, draft.revision);
        setLoadedDraftJobId(job.jobId);
        setDraftStatus('saved');
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : 'Draft PDA gagal dimuat.');
          setDraftStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, [job?.jobId, draftLoadAttempt]);

  useEffect(() => {
    if (!job || !draftLoaded) return;
    const timer = window.setTimeout(() => {
      setDraftStatus('saving');
      const snapshot = {
        pdaNo,
        currency,
        exchangeRate: Number(exchangeRate) || 0,
        eta,
        etd,
        etaRemarks,
        etdRemarks,
        itemDraft: newItem,
        items,
      };
      draftSaveQueue.current = draftSaveQueue.current
        .then(async () => {
          const revision = draftRevisions.current.get(job.jobId);
          if (revision === undefined) throw new Error('Revisi draft PDA tidak tersedia. Muat ulang form.');
          const nextRevision = await savePdaDraft(job.jobId, { ...snapshot, revision });
          draftRevisions.current.set(job.jobId, nextRevision);
          if (activeJobId.current === job.jobId) {
            setDraftError('');
            setDraftStatus('saved');
          }
        })
        .catch((error: unknown) => {
          if (activeJobId.current === job.jobId) {
            setDraftError(error instanceof Error ? error.message : 'Perubahan PDA gagal disimpan.');
            setDraftStatus('error');
          }
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [currency, draftLoaded, etd, etdRemarks, exchangeRate, items, job?.jobId, eta, etaRemarks, newItem, pdaNo]);

  const updateItem = (id: string, changes: Partial<PdaEntryItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  };
  const startEditItem = (item: PdaEntryItem) => {
    setEditingItemId(item.id);
    setItemEditDraft({
      category: item.category,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
      remarks: item.remarks,
      vatApplied: item.vatApplied,
    });
  };
  const cancelEditItem = () => {
    setEditingItemId(null);
    setItemEditDraft(null);
  };
  const saveEditedItem = () => {
    if (!editingItemId || !itemEditDraft || !itemEditDraft.description.trim()) return;
    updateItem(editingItemId, {
      ...itemEditDraft,
      description: itemEditDraft.description.trim(),
      unit: itemEditDraft.unit.trim(),
      remarks: itemEditDraft.remarks.trim(),
    });
    cancelEditItem();
  };
  const addItem = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = newItem.name.trim();
    if (!description) return;
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        category: newItem.category,
        description,
        quantity: Number(newItem.quantity) || 1,
        unit: newItem.unit.trim(),
        price: Number(newItem.price) || 0,
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
      {draftError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <span>{draftError}</span>
          <button type="button" onClick={() => setDraftLoadAttempt((attempt) => attempt + 1)} className="rounded-lg border border-rose-300/40 px-3 py-1.5 text-xs font-bold hover:bg-rose-500/20">Muat Ulang PDA</button>
        </div>
      )}
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
            <button type="button" disabled={!draftLoaded} onClick={() => setCurrency('IDR')} className={`h-12 rounded-lg px-5 text-base font-bold disabled:cursor-wait disabled:opacity-50 ${currency === 'IDR' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>IDR (Rp)</button>
            <button type="button" disabled={!draftLoaded} onClick={() => setCurrency('USD')} className={`h-12 rounded-lg px-5 text-base font-bold disabled:cursor-wait disabled:opacity-50 ${currency === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>USD ($)</button>
          </div>
          <label className="flex h-16 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-5 text-base text-slate-300">
            Kurs USD
            <input type="number" min={0} step={1} disabled={!draftLoaded} value={exchangeRate} onChange={(event) => setExchangeRate(Number(event.target.value) || 0)} className="h-9 w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 text-right text-base text-white disabled:opacity-50" />
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">No. PDA</span><b className="mt-1 block font-mono text-cyan-300">{pdaNo || (draftStatus === 'error' ? 'Gagal dimuat' : 'Memuat nomor...')}</b><span className="mt-1 block text-[10px] text-slate-500">{draftStatus === 'loading' ? 'Memuat draft...' : draftStatus === 'saving' ? 'Menyimpan otomatis...' : draftStatus === 'saved' ? 'Tersimpan otomatis' : 'Belum tersimpan'}</span></div>
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
          <label className="text-slate-400">ETA<input type="datetime-local" disabled={!draftLoaded} value={eta} onChange={(event) => setEta(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-50" /></label>
          <label className="text-slate-400">ETD<input type="datetime-local" disabled={!draftLoaded} value={etd} onChange={(event) => setEtd(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-50" /></label>
          <label className="text-slate-400">Keterangan ETA<input type="text" disabled={!draftLoaded} value={etaRemarks} onChange={(event) => setEtaRemarks(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-50" /></label>
          <label className="text-slate-400">Keterangan ETD<input type="text" disabled={!draftLoaded} value={etdRemarks} onChange={(event) => setEtdRemarks(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-50" /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div><h2 className="text-base font-bold uppercase tracking-wider text-white">Hasil Entry PDA Crew</h2><span className="text-xs text-slate-400">Draft dan perubahan entry disimpan otomatis</span></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!draftLoaded || draftStatus === 'saving'} onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5"/>Lihat Hasil PDA</button>
            <button type="button" disabled={!draftLoaded || draftStatus === 'saving'} onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-3.5 w-3.5"/>Cetak / PDF</button>
          </div>
        </div>
        <div className="pda-results-card mb-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr>
              <th className="border-l border-slate-700 p-3.5">No</th><th className="border-l border-slate-700 p-3.5">Description</th><th className="border-l border-slate-700 p-3.5 text-right">Qty</th><th className="border-l border-slate-700 p-3.5">Unit</th><th className="border-l border-slate-700 p-3.5 text-right">Price ({currency})</th><th className="border-l border-slate-700 p-3.5 text-right">Amount ({currency})</th><th className="border-l border-slate-700 p-3.5">Remarks</th><th className="border-l border-slate-700 p-3.5">Aksi</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {groupPdaItems(items).map((group, groupIndex) => {
                const groupTotal = group.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
                const groupVat = group.items.reduce((sum, item) => sum + (item.vatApplied ? item.quantity * item.price * 0.11 : 0), 0);
                return (
                  <React.Fragment key={group.category}>
                    <tr className="epda-category-row">
                      <td colSpan={8} className="border-l border-slate-700"><span className="epda-category-label">{group.label}</span></td>
                    </tr>
                    {group.items.map((item, index) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-700/40">
                        <td className="border-l border-slate-800 p-3.5 font-mono text-slate-300">{index + 1}{item.vatApplied && <span className="ml-1 font-bold text-blue-400" title="VAT 11%" aria-label="VAT 11%">*</span>}</td>
                        <td className="border-l border-slate-800 p-3.5">
                          {editingItemId === item.id && itemEditDraft ? (
                            <div className="space-y-1.5">
                              <select value={itemEditDraft.category} onChange={(event) => setItemEditDraft({ ...itemEditDraft, category: event.target.value })} aria-label="Category Cost" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white">
                                {PDA_COST_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <input autoFocus value={itemEditDraft.description} onChange={(event) => setItemEditDraft({ ...itemEditDraft, description: event.target.value })} placeholder="Nama layanan / kebutuhan crew" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white placeholder-slate-500" />
                            </div>
                          ) : <span className="font-bold text-white">{item.description}</span>}
                        </td>
                        <td className="border-l border-slate-800 p-3.5">
                          {editingItemId === item.id && itemEditDraft
                            ? <input type="number" min="0" step="0.01" value={itemEditDraft.quantity} onChange={(event) => setItemEditDraft({ ...itemEditDraft, quantity: Number(event.target.value) || 0 })} className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-right text-white" />
                            : item.quantity}
                        </td>
                        <td className="border-l border-slate-800 p-3.5">
                          {editingItemId === item.id && itemEditDraft
                            ? <input value={itemEditDraft.unit} onChange={(event) => setItemEditDraft({ ...itemEditDraft, unit: event.target.value })} placeholder="Pax / Trip" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white placeholder-slate-500" />
                            : item.unit}
                        </td>
                        <td className="border-l border-slate-800 p-3.5">
                          {editingItemId === item.id && itemEditDraft
                            ? <input type="number" min="0" step="0.01" value={itemEditDraft.price} onChange={(event) => setItemEditDraft({ ...itemEditDraft, price: Number(event.target.value) || 0 })} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-right text-white" />
                            : item.price}
                        </td>
                        <td className="border-l border-slate-800 p-3.5 text-right font-mono font-bold text-white">{formatAmount((editingItemId === item.id && itemEditDraft ? itemEditDraft.quantity : item.quantity) * (editingItemId === item.id && itemEditDraft ? itemEditDraft.price : item.price), currency)}</td>
                        <td className="border-l border-slate-800 p-3.5">
                          {editingItemId === item.id && itemEditDraft ? (
                            <div className="space-y-2">
                              <input value={itemEditDraft.remarks} onChange={(event) => setItemEditDraft({ ...itemEditDraft, remarks: event.target.value })} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white" />
                              <label className="flex items-center gap-1.5 text-[10px] text-slate-300"><input type="checkbox" checked={itemEditDraft.vatApplied} onChange={(event) => setItemEditDraft({ ...itemEditDraft, vatApplied: event.target.checked })} /> VAT 11%</label>
                            </div>
                          ) : <span className="text-slate-300">{item.remarks || '-'}</span>}
                        </td>
                        <td className="border-l border-slate-800 p-3.5">
                          <div className="flex items-center gap-1">
                            {editingItemId === item.id ? (
                              <>
                                <button type="button" disabled={!itemEditDraft?.description.trim()} title="Simpan perubahan item" aria-label={`Simpan perubahan ${item.description}`} onClick={saveEditedItem} className="rounded p-1.5 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                                <button type="button" title="Batal edit" aria-label={`Batal edit ${item.description}`} onClick={cancelEditItem} className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button>
                              </>
                            ) : (
                              <>
                                <button type="button" disabled={!draftLoaded || !!editingItemId} title="Edit item" aria-label={`Edit ${item.description}`} onClick={() => startEditItem(item)} className="rounded p-1.5 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                                <button type="button" disabled={!draftLoaded || !!editingItemId} title="Hapus item" aria-label={`Hapus ${item.description}`} onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded p-1.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">TOTAL {group.label}</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmount(groupTotal, currency)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>
                    {groupVat > 0 && <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">VAT 11%</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmount(groupVat, currency)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>}
                    <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">SUB TOTAL {groupIndex + 1}</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmount(groupTotal + groupVat, currency)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>
                  </React.Fragment>
                );
              })}
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
                <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">Tambah Item PDA</h3>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="submit" disabled={!draftLoaded || draftStatus === 'error'} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50">
                  <Plus className="h-4 w-4" /> TAMBAH ITEM
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">Masukkan item service, kategori biaya, Price, QTY, dan keterangan.</p>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs font-normal md:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-slate-600">Item Service</label>
                <input
                  value={newItem.name}
                  disabled={!draftLoaded}
                  onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                  placeholder="Nama item crew"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Category Cost</label>
                <select disabled={!draftLoaded} value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50">
                  {PDA_COST_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Price</label>
                <input type="number" min="0" step="0.01" disabled={!draftLoaded} value={newItem.price} onChange={(event) => setNewItem({ ...newItem, price: Number(event.target.value) || 0 })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">QTY</label>
                <input type="number" min="1" step="1" disabled={!draftLoaded} value={newItem.quantity} onChange={(event) => setNewItem({ ...newItem, quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-1 block text-slate-600">Amount ({currency})</label>
                  <input readOnly value={formatAmount(entryAmount, currency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500" />
                </div>
                <div>
                  <label className="mb-1 block text-slate-600">Unit</label>
                  <input disabled={!draftLoaded} value={newItem.unit} onChange={(event) => setNewItem({ ...newItem, unit: event.target.value })} placeholder="Pax / Trip" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
                </div>
              </div>
              <div className="lg:col-span-6">
                <label className="mb-1 block text-slate-600">Remark</label>
                <input disabled={!draftLoaded} value={newItem.remarks} onChange={(event) => setNewItem({ ...newItem, remarks: event.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" disabled={!draftLoaded} checked={newItem.vatApplied} onChange={(event) => setNewItem({ ...newItem, vatApplied: event.target.checked })} /> VAT 11%</label>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-slate-500">Amount dihitung dari Price x QTY.</div>
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
            <iframe ref={printFrameRef} title={`Pratinjau PDA Crew ${job.jobId}`} srcDoc={createPreviewHtml(job, items, currency, pdaNo)} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
};

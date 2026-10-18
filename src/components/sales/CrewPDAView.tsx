import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, FileSpreadsheet, Pencil, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import { JobCall, Vessel, formatPurposeOfCall } from '../../types';
import { formatInquiryDate } from '../../utils/date';
import { ContinuedPdaItemReference, openPdaDraft, PdaDocumentType, PdaDraft, savePdaDraft, submitPdaDraft } from '../../lib/api';

interface CrewPDAViewProps {
  job?: JobCall;
  vessels: Vessel[];
  onBack: () => void;
  pdaType?: PdaDocumentType;
}

export interface PdaEntryItem {
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
  ['AGENCY_FEE', 'Agency Fee'],
] as const;

const groupPdaItems = (items: PdaEntryItem[]) =>
  PDA_COST_CATEGORIES.map(([category, label]) => ({
    category,
    label,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

const roundPdaAmount = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

const calculatePdaTotals = (items: PdaEntryItem[], pph23Applied: boolean, globalVatApplied: boolean) => {
  const categoryTotals = groupPdaItems(items).map((group) => {
    const amount = group.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const taxableAmount = group.items
      .filter((item) => item.vatApplied)
      .reduce((sum, item) => sum + item.quantity * item.price, 0);
    const vat = roundPdaAmount(taxableAmount * 0.11);
    const pph23 = pph23Applied && group.items.some((item) => item.vatApplied)
      ? roundPdaAmount(amount * 0.02)
      : 0;
    return { category: group.category, amount, vat, pph23 };
  });
  const subtotal = categoryTotals.reduce((sum, group) => sum + group.amount, 0);
  const itemVat = categoryTotals.reduce((sum, group) => sum + group.vat, 0);
  const pph23Amount = categoryTotals.reduce((sum, group) => sum + group.pph23, 0);
  const globalVatAmount = globalVatApplied ? roundPdaAmount((subtotal + itemVat) * 0.11) : 0;

  return {
    categoryTotals,
    subtotal,
    itemVat,
    pph23Amount,
    globalVatAmount,
    grandTotal: subtotal + itemVat - pph23Amount + globalVatAmount,
  };
};

const escapeHtml = (value: string | number) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(amount || 0) + ` ${currency}`;

const formatAmountValue = (amount: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

const formatPdaDateMade = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatPdaScheduleOrRemark = (dateTime?: string, remarks?: string) => {
  if (!dateTime) return remarks?.trim() || '-';
  const date = new Date(dateTime.replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? dateTime
    : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};

export const createPdaPreviewHtml = (
  job: JobCall,
  items: PdaEntryItem[],
  currency: string,
  pdaNo: string,
  pdaType: PdaDocumentType = 'SALES',
  pph23Applied = false,
  globalVatApplied = false,
  printDetails: { createdAt?: string; eta?: string; etd?: string; etaRemarks?: string; etdRemarks?: string } = {},
) => {
  const documentLabel = pdaType === 'FDA' ? 'FPDA' : 'PDA Crew';
  const fpda = pdaType === 'FDA';
  const etaDisplay = fpda
    ? formatPdaScheduleOrRemark(printDetails.eta, printDetails.etaRemarks)
    : job.eta || '-';
  const etdDisplay = fpda
    ? formatPdaScheduleOrRemark(printDetails.etd, printDetails.etdRemarks)
    : job.etd || '-';
  const groupedItems = groupPdaItems(items);
  const taxesEnabled = pdaType === 'FDA';
  const totals = calculatePdaTotals(items, taxesEnabled && pph23Applied, taxesEnabled && globalVatApplied);
  const rows = groupedItems.map((group, groupIndex) => {
    const categoryTotal = totals.categoryTotals[groupIndex];
    const itemRows = group.items.map((item, index) => {
      const amount = item.quantity * item.price;
      return `<tr>
        <td class="number">${index + 1}</td><td>${escapeHtml(item.description || '-')}</td>
        <td class="number">${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit || '-')}</td>
        <td class="amount">${escapeHtml(formatAmountValue(item.price))}</td>
        <td class="amount">${escapeHtml(formatAmountValue(amount))}</td><td>${escapeHtml(item.remarks || '-')}</td>
      </tr>`;
    }).join('');
    return `<tr class="category"><td colspan="7">${escapeHtml(group.label)}</td></tr>${itemRows}
      <tr class="total"><td colspan="5">TOTAL</td><td class="amount">${escapeHtml(formatAmountValue(categoryTotal.amount))}</td><td></td></tr>
      ${categoryTotal.vat > 0 ? `<tr class="subtotal"><td colspan="5">VAT 11%</td><td class="amount">${escapeHtml(formatAmountValue(categoryTotal.vat))}</td><td></td></tr>` : ''}
      <tr class="subtotal"><td colspan="5">SUB TOTAL ${groupIndex + 1}</td><td class="amount">${escapeHtml(formatAmountValue(categoryTotal.amount + categoryTotal.vat))}</td><td></td></tr>
      `;
  }).join('');
  const pph23Row = totals.pph23Amount > 0
    ? `<tr class="subtotal"><td colspan="5">PPH 23 (2%)</td><td class="amount">-${escapeHtml(formatAmountValue(totals.pph23Amount))}</td><td></td></tr>`
    : '';
  const globalVatRows = taxesEnabled && globalVatApplied
    ? `<tr class="subtotal"><td colspan="5">VAT 11%</td><td class="amount">${escapeHtml(formatAmountValue(totals.globalVatAmount))}</td><td></td></tr>`
    : '';
  const grandTotalLabel = taxesEnabled && globalVatApplied
    ? 'GRAND TOTAL + VAT 11%'
    : groupedItems.length
      ? `GRAND TOTAL ${groupedItems.map((_, index) => index + 1).join(' + ')}`
      : 'GRAND TOTAL';
  const bankFooter = currency === 'USD'
    ? '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK MANDIRI (Persero) Tbk</b><br>Address:<br>BANK MANDIRI TEBET SUPOMO<br>Jl. Prof. Dr.Supomo SH No 43, Tebet, RT.04/RW.03<br>Tebet barat , Kec. Tebet, Kota Jakarta Selatan,<br>Daerah Khusus Ibukota Jakarta 12810<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number (USD) : 120-00-5575599-0</b><br><b>Swift Code Bank : BMRIIDJAXXX</b></div>'
    : '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address:<br>BNI BIDAKARA<br>Jl. Gatot Subroto Kab 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-09</b><br><b>Swift Code Bank : BNINIDJAXXX</b></div>';
  const financeSignature = '<div class="signature"><div class="signature-main">Sincerely,<br>PT. Lentera Global Maritim</div><div class="signature-role">Finance</div></div>';
  const officeFooter = '<div class="office-footer">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span>email : maritim@lentera-global.com / web : www.lentera-global.com</span></div>';

  const printFileName = `${documentLabel} - ${pdaNo}`.replace(/[\\/:*?"<>|]/g, '-');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(printFileName)}</title>
  <style>
    @page{size:A4 portrait;margin:10mm}
    body{font-family:Arial,sans-serif;color:#172033;font-size:11px;margin:0}
    .brand-row{text-align:center;margin-bottom:12px}
    .brand-wrap{display:inline-flex;align-items:center;gap:18px;text-align:left;min-height:78px}
    .logo{width:96px;height:72px;object-fit:contain}
    .brand{font-weight:700;font-size:23px;line-height:1.15;color:#3562a8}
    .tag{color:#555;font-size:15px;font-weight:600;margin-top:7px}
    h2{text-align:center;background:#214f84;color:white;padding:7px;font-size:14px;margin:8px 0 12px}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 22px;margin-bottom:12px}
    .meta-col{display:flex;flex-direction:column;gap:4px;min-width:0}
    .meta-row{display:grid;grid-template-columns:minmax(78px,92px) 6px minmax(0,1fr);column-gap:3px;line-height:1.35;min-width:0}
    .label{font-weight:700}.colon{text-align:center}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #9ca3af;padding:5px 6px;vertical-align:top}
    th{background:#dbe8f2;text-align:center;font-weight:700}
    th:nth-child(1){width:5%}th:nth-child(2){width:30%}th:nth-child(3){width:7%}
    th:nth-child(4){width:8%}th:nth-child(5){width:13%}th:nth-child(6){width:15%}th:nth-child(7){width:22%}
    .number{text-align:center}.amount{text-align:right;white-space:nowrap}
    .category td{background:#214f84;color:#fff;font-weight:700;text-transform:uppercase}
    .total{font-weight:700}.total td:first-child,.subtotal td:first-child{text-align:right}.subtotal{background:#dbe8f2;font-weight:700}
    .bank{display:inline-block;width:42%;margin-top:16px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}
    .signature{display:inline-block;width:42%;margin:16px 0 0 12%;text-align:center;vertical-align:top;font-size:9px;line-height:1.35}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:8px}
    .office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:9px;line-height:1.45;font-weight:600;color:#111}
    .office-footer span{color:#dc2626;text-decoration:underline}
    @page{size:A4 portrait;margin:15mm 10mm}
    @media screen{
      html,body{min-height:100%;height:auto;overflow:visible;background:#e2e8f0}
      body{position:relative;box-sizing:border-box;width:210mm;height:297mm;min-height:297mm;max-width:none;margin:0 auto;padding:15mm;background:#fff}
      .a4-page-frame{position:absolute;top:10mm;left:10mm;width:190mm;height:277mm;box-sizing:border-box;border:0.3mm solid #1f2937;pointer-events:none;z-index:9}
    }
    @media print{
      html,body{width:auto;height:auto;min-height:0;margin:0;padding:0;overflow:visible;background:#fff}
      body{position:static;max-width:none;padding:0 3mm;box-sizing:border-box}
      .a4-page-frame{position:fixed;inset:0;width:auto;height:auto;box-sizing:border-box;border:0.5mm solid #1f2937;pointer-events:none;z-index:9999}
    }
  </style></head><body><div class="a4-page-frame" aria-hidden="true"></div>
    <div class="brand-row"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div>
    <h2>${pdaType === 'FDA' ? 'FINAL PORT DISBURSEMENT ACCOUNT - CREW CHANGE' : 'PORT DISBURSEMENT ACCOUNT - CREW CHANGE'}</h2>
    <section class="meta">
      <div class="meta-col">
        <div class="meta-row"><span class="label">${documentLabel} No</span><span class="colon">:</span><span>${escapeHtml(pdaNo)}</span></div>
        ${fpda
          ? `<div class="meta-row"><span class="label">Date made</span><span class="colon">:</span><span>${escapeHtml(formatPdaDateMade(printDetails.createdAt))}</span></div>`
          : `<div class="meta-row"><span class="label">Inquiry No</span><span class="colon">:</span><span>${escapeHtml(job.inquiry.inquiryNo)}</span></div>`}
        <div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div>
        ${fpda
          ? `<div class="meta-row"><span class="label">Request</span><span class="colon">:</span><span>${escapeHtml(job.inquiry.specialRequirements || '-')}</span></div>`
          : `<div class="meta-row"><span class="label">Job / Vessel Call</span><span class="colon">:</span><span>${escapeHtml(job.jobId)}</span></div>`}
      </div>
      <div class="meta-col">
        <div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div>
        <div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div>
        <div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${escapeHtml(etaDisplay)}</span></div>
        <div class="meta-row"><span class="label">ETD</span><span class="colon">:</span><span>${escapeHtml(etdDisplay)}</span></div>
      </div>
    </section>
    <table><thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Unit</th><th>Price (${escapeHtml(currency)})</th><th>Amount (${escapeHtml(currency)})</th><th>Remarks</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center">Belum ada item PDA</td></tr>'}
      ${pph23Row}${globalVatRows}<tr class="grand-total"><td colspan="5" style="text-align:right">${grandTotalLabel}</td><td class="amount">${escapeHtml(formatAmountValue(totals.grandTotal))}</td><td></td></tr></tbody>
    </table>
    ${bankFooter}${financeSignature}${officeFooter}
  </body></html>`;
};

export const CrewPDAView: React.FC<CrewPDAViewProps> = ({ job, vessels, onBack, pdaType = 'SALES' }) => {
  const documentPdaType: PdaDocumentType = pdaType === 'FDA' ? 'FDA' : 'SALES';
  const documentLabel = documentPdaType === 'FDA' ? 'FPDA' : 'PDA Crew';
  const [items, setItems] = useState<PdaEntryItem[]>([]);
  const [currency, setCurrency] = useState(job?.quotation?.epda?.currency || job?.currency || 'USD');
  const [exchangeRate, setExchangeRate] = useState(job?.exchangeRateUSDToIDR || 0);
  const [eta, setEta] = useState(job?.eta || '');
  const [etd, setEtd] = useState(job?.etd || '');
  const [etaRemarks, setEtaRemarks] = useState(job?.inquiry?.etaRemarks || '');
  const [etdRemarks, setEtdRemarks] = useState(job?.inquiry?.etdRemarks || '');
  const [pdaNo, setPdaNo] = useState('');
  const [draftCreatedAt, setDraftCreatedAt] = useState('');
  const [salesPdaNo, setSalesPdaNo] = useState('');
  const [salesPdaCurrency, setSalesPdaCurrency] = useState<'IDR' | 'USD' | null>(null);
  const [salesPdaItems, setSalesPdaItems] = useState<PdaEntryItem[]>([]);
  const [continuedPdaItems, setContinuedPdaItems] = useState<ContinuedPdaItemReference[]>([]);
  const [continuePdaMessage, setContinuePdaMessage] = useState('');
  const [draftError, setDraftError] = useState('');
  const [draftStatus, setDraftStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [approvalStatus, setApprovalStatus] = useState<'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUIRED'>('DRAFT');
  const [reviewNotes, setReviewNotes] = useState<string | null>(null);
  const [isSubmittingPda, setIsSubmittingPda] = useState(false);
  const [loadedDraftJobId, setLoadedDraftJobId] = useState('');
  const [draftLoadAttempt, setDraftLoadAttempt] = useState(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditDraft, setItemEditDraft] = useState<PdaItemEditDraft | null>(null);
  const [newItem, setNewItem] = useState<PdaDraft['itemDraft']>({
    name: '',
    category: 'SIGN_ON_CREW',
    price: 0,
    quantity: 1,
    unit: '',
    remarks: '',
    vatApplied: false,
    pph23Applied: false,
    globalVatApplied: false,
    continuedPdaItems: [],
  });
  const [showPreview, setShowPreview] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const printPending = useRef(false);
  const draftRevisions = useRef(new Map<string, number>());
  const draftSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const draftSaveTimer = useRef<number | null>(null);
  const activeJobId = useRef(job?.jobId);
  activeJobId.current = job?.jobId;
  const draftLoaded = !!job && loadedDraftJobId === job.jobId;
  const isPdaLocked = approvalStatus === 'SUBMITTED' || approvalStatus === 'APPROVED';
  const canEditPda = draftLoaded && !isPdaLocked && !isSubmittingPda;
  const submitDisabledReason = (() => {
    if (!draftLoaded) {
      return draftStatus === 'error'
        ? 'Draft PDA gagal dimuat. Periksa pesan error di atas.'
        : 'Menunggu draft PDA dimuat.';
    }
    if (isSubmittingPda) return 'Pengiriman PDA sedang diproses.';
    if (editingItemId) return 'Simpan atau batalkan perubahan item sebelum mengirim PDA.';
    if (items.length === 0) return 'Tambahkan minimal satu item PDA sebelum mengirim ke Manager OPS.';
    return '';
  })();
  const submitButtonTitle = draftStatus === 'saving'
    ? 'Menunggu autosave selesai sebelum PDA dikirim.'
    : submitDisabledReason;
  const vesselMaster = vessels.find((vessel) => vessel.id === job?.vesselId);
  const pdaTotals = useMemo(
    () => calculatePdaTotals(
      items,
      documentPdaType === 'FDA' && Boolean(newItem.pph23Applied),
      documentPdaType === 'FDA' && Boolean(newItem.globalVatApplied),
    ),
    [documentPdaType, items, newItem.globalVatApplied, newItem.pph23Applied],
  );
  const total = pdaTotals.grandTotal;
  const entryAmount = (Number(newItem.price) || 0) * (Number(newItem.quantity) || 0);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    setPdaNo('');
    setDraftCreatedAt('');
    setSalesPdaNo('');
    setSalesPdaCurrency(null);
    setSalesPdaItems([]);
    setContinuedPdaItems([]);
    setContinuePdaMessage('');
    setDraftError('');
    setLoadedDraftJobId('');
    setDraftStatus('loading');
    const defaults = {
      currency: job.quotation?.epda?.currency || job.currency || 'USD',
      exchangeRate: job.exchangeRateUSDToIDR || 0,
      eta: job.eta || '',
      etd: job.etd || '',
      etaRemarks: job.inquiry.etaRemarks || '',
      etdRemarks: job.inquiry.etdRemarks || '',
    };
    const draftRequest = openPdaDraft(job.jobId, defaults, documentPdaType);
    void draftRequest
      .then((draft) => {
        if (cancelled) return;
        setPdaNo(draft.pdaNo);
        setDraftCreatedAt(draft.createdAt || '');
        setSalesPdaNo(draft.salesPdaNo || '');
        setSalesPdaCurrency(draft.salesPdaCurrency || null);
        setSalesPdaItems(draft.salesPdaItems || []);
        setContinuedPdaItems(draft.itemDraft.continuedPdaItems || []);
        setCurrency(draft.currency);
        setExchangeRate(draft.exchangeRate);
        setEta(draft.eta);
        setEtd(draft.etd);
        setEtaRemarks(draft.etaRemarks);
        setEtdRemarks(draft.etdRemarks);
        setNewItem(draft.itemDraft);
        setItems(draft.items);
        setApprovalStatus(draft.approvalStatus);
        setReviewNotes(draft.reviewNotes);
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
  }, [job?.jobId, draftLoadAttempt, documentPdaType]);

  useEffect(() => {
    if (!job || !draftLoaded || isPdaLocked) return;
    const timer = window.setTimeout(() => {
      draftSaveTimer.current = null;
      setDraftStatus('saving');
      const snapshot = {
        pdaType: documentPdaType,
        pdaNo,
        currency,
        exchangeRate: Number(exchangeRate) || 0,
        eta,
        etd,
        etaRemarks,
        etdRemarks,
        itemDraft: { ...newItem, continuedPdaItems },
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
    draftSaveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (draftSaveTimer.current === timer) draftSaveTimer.current = null;
    };
  }, [continuedPdaItems, currency, draftLoaded, etd, etdRemarks, exchangeRate, isPdaLocked, items, job?.jobId, eta, etaRemarks, newItem, pdaNo, documentPdaType]);

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
    if (!description || isPdaLocked) return;
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
    setNewItem((current) => ({ ...current, name: '', price: 0, quantity: 1, unit: '', remarks: '', vatApplied: false }));
  };
  const continueFromSalesPda = () => {
    if (documentPdaType !== 'FDA' || !canEditPda) return;
    if (salesPdaCurrency && salesPdaCurrency !== currency) {
      setContinuePdaMessage(`Mata uang PDA sumber ${salesPdaCurrency} berbeda dari mata uang FPDA ${currency}. Samakan mata uang sebelum melanjutkan.`);
      return;
    }
    const existingItemIds = new Set(items.map((item) => item.id));
    const existingReferences = new Map(continuedPdaItems.map((reference) => [reference.sourceItemId, reference.fpdaItemId]));
    const sourceItemsToCopy = salesPdaItems.filter((item) => {
      const copiedItemId = existingReferences.get(item.id);
      return !copiedItemId || !existingItemIds.has(copiedItemId);
    });
    if (sourceItemsToCopy.length === 0) {
      setContinuePdaMessage(salesPdaItems.length === 0
        ? 'Belum ada item pada PDA Sales yang dapat dilanjutkan.'
        : 'Semua item PDA Sales sudah ada di FPDA.');
      return;
    }
    if (items.length + sourceItemsToCopy.length > 500) {
      setContinuePdaMessage('Jumlah item FPDA akan melebihi batas 500 item.');
      return;
    }

    const copiedItems = sourceItemsToCopy.map((item) => ({ ...item, id: crypto.randomUUID() }));
    const copiedReferences = sourceItemsToCopy.map((item, index) => ({
      sourceItemId: item.id,
      fpdaItemId: copiedItems[index].id,
    }));
    setItems((current) => [...current, ...copiedItems]);
    setContinuedPdaItems((current) => [
      ...current.filter((reference) => !copiedReferences.some((copy) => copy.sourceItemId === reference.sourceItemId)),
      ...copiedReferences,
    ]);
    setContinuePdaMessage(`${copiedItems.length} item berhasil dilanjutkan dari PDA.`);
  };
  const handleSubmitPda = async () => {
    if (!job || !draftLoaded || isPdaLocked || isSubmittingPda || editingItemId || items.length === 0) return;
    setIsSubmittingPda(true);
    setDraftError('');
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
    try {
      await draftSaveQueue.current;
      const currentRevision = draftRevisions.current.get(job.jobId);
      if (currentRevision === undefined) throw new Error('Revisi draft PDA tidak tersedia. Muat ulang form.');
      const revision = await savePdaDraft(job.jobId, {
        pdaType: documentPdaType,
        pdaNo,
        currency,
        exchangeRate: Number(exchangeRate) || 0,
        eta,
        etd,
        etaRemarks,
        etdRemarks,
        itemDraft: { ...newItem, continuedPdaItems },
        items,
        revision: currentRevision,
      });
      draftRevisions.current.set(job.jobId, revision);
      const submittedRevision = await submitPdaDraft(job.jobId, revision, documentPdaType);
      draftRevisions.current.set(job.jobId, submittedRevision);
      setApprovalStatus('SUBMITTED');
      setReviewNotes(null);
      setDraftStatus('saved');
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'PDA gagal dikirim ke Manager OPS.');
      setDraftStatus('error');
    } finally {
      setIsSubmittingPda(false);
    }
  };
  const printPda = () => {
    const printFrame = printFrameRef.current;
    if (!printFrame) return;
    printPending.current = true;
    printFrame.srcdoc = previewHtml;
  };

  const handlePrintFrameLoad = () => {
    if (!printPending.current) return;
    printPending.current = false;
    const printWindow = printFrameRef.current?.contentWindow;
    if (!printWindow) return;
    const originalTitle = document.title;
    document.title = pdaNo.replaceAll('/', '-');
    printWindow.focus();
    printWindow.print();
    document.title = originalTitle;
  };

  const previewHtml = useMemo(
    () => job ? createPdaPreviewHtml(job, items, currency, pdaNo, documentPdaType, newItem.pph23Applied, newItem.globalVatApplied, { createdAt: draftCreatedAt, eta, etd, etaRemarks, etdRemarks }) : '',
    [job, items, currency, pdaNo, documentPdaType, newItem.pph23Applied, newItem.globalVatApplied, draftCreatedAt, eta, etd, etaRemarks, etdRemarks],
  );

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
  const pdaGroups = groupPdaItems(items);
  const grandTotalLabel = pdaGroups.length
    ? documentPdaType === 'FDA' && newItem.globalVatApplied
      ? 'GRAND TOTAL + VAT 11%'
      : `Grand Total ${pdaGroups.map((_, index) => index + 1).join(' + ')}`
    : 'Grand Total';

  return (
    <div className="space-y-4 epda-form-root">
      {draftError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <span>{draftError}</span>
          <button type="button" onClick={() => setDraftLoadAttempt((attempt) => attempt + 1)} className="rounded-lg border border-rose-300/40 px-3 py-1.5 text-xs font-bold hover:bg-rose-500/20">Muat Ulang PDA</button>
        </div>
      )}
      {approvalStatus === 'SUBMITTED' && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div><b>PDA sudah dikirim ke Manager OPS.</b><div className="mt-1">Menunggu review Manager OPS. PDA terkunci sampai Manager menyetujui atau mengembalikannya untuk revisi.</div></div></div>}
      {approvalStatus === 'APPROVED' && <div role="status" className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div><b>PDA telah disetujui Manager OPS.</b><div className="mt-1">PDA hanya dapat dilihat dan tidak dapat diedit atau dikirim ulang.</div></div></div>}
      {approvalStatus === 'REVISION_REQUIRED' && <div role="status" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><X className="mt-0.5 h-4 w-4 shrink-0" /><div><b>PDA dikembalikan untuk revisi.</b>{reviewNotes && <div className="mt-1">Catatan Manager: {reviewNotes}</div>}</div></div>}
      <div className="epda-page-header flex flex-col justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
            <FileSpreadsheet className="h-4 w-4" /><span>{pdaType} / PDA</span><span className="text-cyan-300">• JOB ID: {job.jobId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-white">Create {documentLabel}</h1>
          <p className="text-xs text-slate-400">Port Disbursement Account untuk kebutuhan Crew Change</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="account-toolbar-panel account-currency-switch flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-1.5">
            <button type="button" disabled={!canEditPda} onClick={() => setCurrency('IDR')} className={`h-10 rounded-lg px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-50 ${currency === 'IDR' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>IDR (Rp)</button>
            <button type="button" disabled={!canEditPda} onClick={() => setCurrency('USD')} className={`h-10 rounded-lg px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-50 ${currency === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>USD ($)</button>
          </div>
          <label className="account-toolbar-panel account-rate-control flex h-12 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-300">
            Kurs USD
            <input type="number" min={0} step={1} disabled={!canEditPda} value={exchangeRate} onChange={(event) => setExchangeRate(Number(event.target.value) || 0)} className="account-rate-input h-8 w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 text-right text-sm text-white disabled:opacity-50" />
          </label>
          {approvalStatus === 'SUBMITTED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800"><CheckCircle2 className="h-4 w-4" />MENUNGGU APPROVAL MANAGER OPS</span>
          ) : approvalStatus === 'APPROVED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-100 px-3.5 py-2 text-xs font-bold text-blue-700"><CheckCircle2 className="h-4 w-4" />DISETUJUI MANAGER OPS</span>
          ) : (
            <button type="button" title={submitButtonTitle || undefined} disabled={!canEditPda || draftStatus === 'saving' || !!editingItemId || items.length === 0} onClick={() => void handleSubmitPda()} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-5 w-5" /> {isSubmittingPda ? 'Mengirim...' : approvalStatus === 'REVISION_REQUIRED' ? 'Kirim Ulang ke Manager OPS' : 'Kirim ke Manager OPS'}
            </button>
          )}
          {approvalStatus !== 'SUBMITTED' && approvalStatus !== 'APPROVED' && submitDisabledReason && (
            <span role="status" className="w-full text-right text-xs text-amber-300">{submitDisabledReason}</span>
          )}
          <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Quotes
          </button>
        </div>
      </div>

      <div className={`epda-summary-grid grid grid-cols-1 gap-3 ${documentPdaType === 'FDA' ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {documentPdaType === 'FDA' && <div className="epda-summary-card rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">No. FPDA</span><b className="mt-1 block font-mono text-cyan-300">{pdaNo || (draftStatus === 'error' ? 'Gagal dimuat' : 'Memuat nomor...')}</b></div>}
        <div className="epda-summary-card rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">No. PDA</span><b className="mt-1 block font-mono text-cyan-300">{documentPdaType === 'FDA' ? salesPdaNo || 'Belum tersedia' : pdaNo || (draftStatus === 'error' ? 'Gagal dimuat' : 'Memuat nomor...')}</b>{documentPdaType !== 'FDA' && <span className="mt-1 block text-[10px] text-slate-500">{draftStatus === 'loading' ? 'Memuat draft...' : draftStatus === 'saving' ? 'Menyimpan otomatis...' : draftStatus === 'saved' ? 'Tersimpan otomatis' : 'Belum tersimpan'}</span>}</div>
        <div className="epda-summary-card rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">Principal / Vessel</span><b className="mt-1 block text-white">{job.customerName} • {job.vesselName}</b></div>
        <div className="epda-summary-card epda-summary-total rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs font-bold uppercase text-slate-400">Grand Total</span><span className="mt-1 block font-mono text-emerald-300">{formatAmount(total, currency)}</span></div>
      </div>

      <section className="epda-results-card rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="mb-3">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">Inquiry Vessel Details</div>
          <h2 className="mt-1 text-lg font-black text-white">Informasi Lengkap Inquiry Vessel</h2>
        </div>
        <div className="grid grid-cols-1 gap-2.5 text-xs md:grid-cols-2 xl:grid-cols-4">
          {detailCards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <div className="uppercase tracking-wider text-slate-400">{label}</div>
              <div className="mt-1 font-bold text-white">{value}</div>
            </div>
          ))}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 md:col-span-2 xl:col-span-4">
            <div className="uppercase tracking-wider text-slate-400">Special Requirements</div>
            <div className="mt-1 leading-relaxed text-white">{job.inquiry.specialRequirements || 'Tidak ada requirement khusus.'}</div>
          </div>
        </div>
      </section>

      <section className="epda-results-card rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="mb-3">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">{documentLabel}</div>
          <h2 className="mt-1 text-lg font-black text-white">Create {documentLabel}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          <label className="text-slate-400">ETA<input type="datetime-local" disabled={!canEditPda} value={eta} onChange={(event) => setEta(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-50" /></label>
          <label className="text-slate-400">ETD<input type="datetime-local" disabled={!canEditPda} value={etd} onChange={(event) => setEtd(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-50" /></label>
          <label className="text-slate-400">Keterangan ETA<input type="text" disabled={!canEditPda} value={etaRemarks} onChange={(event) => setEtaRemarks(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-50" /></label>
          <label className="text-slate-400">Keterangan ETD<input type="text" disabled={!canEditPda} value={etdRemarks} onChange={(event) => setEtdRemarks(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-50" /></label>
        </div>
      </section>

      <section className="epda-results-card rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="mb-3 flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
          <div><h2 className="text-base font-bold uppercase tracking-wider text-white">Hasil Entry {documentLabel}</h2><span className="text-xs text-slate-400">Draft dan perubahan entry disimpan otomatis</span></div>
          <div className="flex flex-wrap gap-2">
            {documentPdaType === 'FDA' && (
              <button
                type="button"
                disabled={!canEditPda || draftStatus === 'saving' || salesPdaItems.length === 0}
                onClick={continueFromSalesPda}
                title={salesPdaItems.length === 0 ? 'Belum ada item dari PDA Sales untuk dilanjutkan.' : undefined}
                className="flex h-11 items-center gap-2 rounded-lg bg-blue-50 px-4 text-base font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Lanjutkan dari PDA
              </button>
            )}
            <button type="button" disabled={!draftLoaded || draftStatus === 'saving'} onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5"/>Lihat Hasil PDA</button>
            <button type="button" disabled={!draftLoaded || draftStatus === 'saving'} onClick={printPda} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-3.5 w-3.5"/>Cetak / PDF</button>
          </div>
        </div>
        {continuePdaMessage && documentPdaType === 'FDA' && <div role="status" className="mb-3 rounded-lg border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-xs text-cyan-200">{continuePdaMessage}</div>}
        {documentPdaType === 'FDA' && (
          <div className="erp-tax-controls mb-3 flex flex-wrap gap-2">
            <label className={`erp-tax-option erp-tax-option-pph ${newItem.pph23Applied ? 'is-active' : ''} ${!canEditPda ? 'is-disabled' : ''}`}>
              <input type="checkbox" checked={Boolean(newItem.pph23Applied)} disabled={!canEditPda} onChange={(event) => setNewItem({ ...newItem, pph23Applied: event.target.checked })} />
              <span>PPH 23 (2%)<small>Untuk kategori yang memiliki item VAT 11%</small></span>
            </label>
            <label className={`erp-tax-option erp-tax-option-vat ${newItem.globalVatApplied ? 'is-active' : ''} ${!canEditPda ? 'is-disabled' : ''}`}>
              <input type="checkbox" checked={Boolean(newItem.globalVatApplied)} disabled={!canEditPda} onChange={(event) => setNewItem({ ...newItem, globalVatApplied: event.target.checked })} />
              <span>VAT 11%<small>Ditambahkan pada Grand Total</small></span>
            </label>
          </div>
        )}
        <div className="mb-1 pr-[3%] text-right text-[9px] normal-case tracking-normal text-cyan-300">
          Ekuivalen kurs: {exchangeRate > 0 ? `1 USD = Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(exchangeRate)}` : 'belum diisi'}
        </div>
        <div className="pda-results-card mb-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr>
              <th className="border-l border-slate-700 p-3.5 text-center">No</th><th className="border-l border-slate-700 p-3.5 text-center">Description</th><th className="border-l border-slate-700 p-3.5 text-center">Qty</th><th className="border-l border-slate-700 p-3.5 text-center">Unit</th><th className="border-l border-slate-700 p-3.5 text-center">Price ({currency})</th><th className="border-l border-slate-700 p-3.5 text-center">Amount ({currency})</th><th className="border-l border-slate-700 p-3.5 text-center">Remarks</th><th className="border-l border-slate-700 p-3.5 text-center">Aksi</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {pdaGroups.map((group, groupIndex) => {
                const categoryTotal = pdaTotals.categoryTotals[groupIndex];
                const groupTotal = categoryTotal?.amount || 0;
                const groupVat = categoryTotal?.vat || 0;
                return (
                  <React.Fragment key={group.category}>
                    <tr className="epda-category-row">
                      <td colSpan={8} className="border-l border-slate-700"><span className="epda-category-label">{group.label}</span></td>
                    </tr>
                    {group.items.map((item, index) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-700/40">
                        <td className="border-l border-slate-800 px-3 py-1.5 font-mono text-slate-300">{index + 1}{item.vatApplied && <span className="ml-1 font-bold text-blue-400" title="VAT 11%" aria-label="VAT 11%">*</span>}</td>
                        <td className="border-l border-slate-800 px-3 py-1.5">
                          {editingItemId === item.id && itemEditDraft ? (
                            <div className="space-y-1.5">
                              <select value={itemEditDraft.category} onChange={(event) => setItemEditDraft({ ...itemEditDraft, category: event.target.value })} aria-label="Category Cost" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white">
                                {PDA_COST_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <input autoFocus value={itemEditDraft.description} onChange={(event) => setItemEditDraft({ ...itemEditDraft, description: event.target.value })} placeholder="Nama layanan / kebutuhan crew" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white placeholder-slate-500" />
                            </div>
                          ) : <span className="font-bold text-white">{item.description}</span>}
                        </td>
                        <td className="border-l border-slate-800 px-3 py-1.5 text-center">
                          {editingItemId === item.id && itemEditDraft
                            ? <input type="number" min="0" step="0.01" value={itemEditDraft.quantity} onChange={(event) => setItemEditDraft({ ...itemEditDraft, quantity: Number(event.target.value) || 0 })} className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-center text-white" />
                            : item.quantity}
                        </td>
                        <td className="border-l border-slate-800 px-3 py-1.5 text-center">
                          {editingItemId === item.id && itemEditDraft
                            ? <input value={itemEditDraft.unit} onChange={(event) => setItemEditDraft({ ...itemEditDraft, unit: event.target.value })} placeholder="Pax / Trip" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-center text-white placeholder-slate-500" />
                            : item.unit}
                        </td>
                        <td className="border-l border-slate-800 px-3 py-1.5 text-right">
                          {editingItemId === item.id && itemEditDraft
                            ? <input type="number" min="0" step="0.01" value={itemEditDraft.price} onChange={(event) => setItemEditDraft({ ...itemEditDraft, price: Number(event.target.value) || 0 })} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-right text-white" />
                            : formatAmountValue(item.price)}
                        </td>
                        <td className="border-l border-slate-800 px-3 py-1.5 text-right font-mono font-bold text-white">{formatAmountValue((editingItemId === item.id && itemEditDraft ? itemEditDraft.quantity : item.quantity) * (editingItemId === item.id && itemEditDraft ? itemEditDraft.price : item.price))}</td>
                        <td className="border-l border-slate-800 px-3 py-1.5">
                          {editingItemId === item.id && itemEditDraft ? (
                            <div className="space-y-2">
                              <input value={itemEditDraft.remarks} onChange={(event) => setItemEditDraft({ ...itemEditDraft, remarks: event.target.value })} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white" />
                              <label className="flex items-center gap-1.5 text-[10px] text-slate-300"><input type="checkbox" checked={itemEditDraft.vatApplied} onChange={(event) => setItemEditDraft({ ...itemEditDraft, vatApplied: event.target.checked })} /> VAT 11%</label>
                            </div>
                          ) : <span className="text-slate-300">{item.remarks || '-'}</span>}
                        </td>
                        <td className="border-l border-slate-800 px-3 py-1.5">
                          {approvalStatus !== 'APPROVED' && (
                            <div className="flex items-center gap-1">
                              {editingItemId === item.id ? (
                                <>
                                  <button type="button" disabled={!itemEditDraft?.description.trim()} title="Simpan perubahan item" aria-label={`Simpan perubahan ${item.description}`} onClick={saveEditedItem} className="rounded p-1.5 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                                  <button type="button" title="Batal edit" aria-label={`Batal edit ${item.description}`} onClick={cancelEditItem} className="rounded p-1.5 text-slate-300 hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <button type="button" disabled={!canEditPda || !!editingItemId} title="Edit item" aria-label={`Edit ${item.description}`} onClick={() => startEditItem(item)} className="rounded p-1.5 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                                  <button type="button" disabled={!canEditPda || !!editingItemId} title="Hapus item" aria-label={`Hapus ${item.description}`} onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded p-1.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">TOTAL</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmountValue(groupTotal)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>
                    {groupVat > 0 && <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">VAT 11%</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmountValue(groupVat)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>}
                    <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">SUB TOTAL {groupIndex + 1}</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmountValue(groupTotal + groupVat)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>
                  </React.Fragment>
                );
              })}
              {documentPdaType === 'FDA' && pdaTotals.pph23Amount > 0 && <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-rose-300">PPH 23 (2%)</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-rose-300">-{formatAmountValue(pdaTotals.pph23Amount)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>}
              {documentPdaType === 'FDA' && newItem.globalVatApplied && items.length > 0 && <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-amber-300">VAT 11%</td><td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-amber-300">{formatAmountValue(pdaTotals.globalVatAmount)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>}
              {!items.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">Belum ada item. Klik Tambah Item untuk mulai entry.</td></tr>}
              <tr className="bg-slate-950/70"><td colSpan={5} className="border-l border-slate-800 p-3.5 text-right font-bold uppercase tracking-wider text-slate-200">{grandTotalLabel}</td><td className="border-l border-slate-800 p-3.5 text-right font-mono text-xs font-bold text-white">{formatAmountValue(total)}</td><td colSpan={2} className="border-l border-slate-800" /></tr>
            </tbody>
          </table>
        </div>
        <div className="mb-3 rounded-2xl border border-slate-300 bg-[#edf2f4] p-4 shadow-sm">
          <form onSubmit={addItem}>
            <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2 text-emerald-600">
                <Plus className="h-4 w-4" />
                <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">Tambah Item PDA</h3>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="submit" disabled={!canEditPda || draftStatus === 'error'} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50">
                  <Plus className="h-4 w-4" /> TAMBAH ITEM
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">Masukkan item service, kategori biaya, Price, QTY, dan keterangan.</p>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
            </div>
            <div className="grid grid-cols-1 gap-2.5 text-xs font-normal md:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-slate-600">Item Service</label>
                <input
                  value={newItem.name}
                  disabled={!canEditPda}
                  onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                  placeholder="Nama item crew"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Category Cost</label>
                <select disabled={!canEditPda} value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50">
                  {PDA_COST_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Price</label>
                <input type="number" min="0" step="0.01" disabled={!canEditPda} value={newItem.price || ''} onChange={(event) => setNewItem({ ...newItem, price: Number(event.target.value) || 0 })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">QTY</label>
                <input type="number" min="1" step="1" disabled={!canEditPda} value={newItem.quantity} onChange={(event) => setNewItem({ ...newItem, quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-1 block text-slate-600">Amount ({currency})</label>
                  <input readOnly value={formatAmount(entryAmount, currency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500" />
                </div>
                <div>
                  <label className="mb-1 block text-slate-600">Unit</label>
                  <input disabled={!canEditPda} value={newItem.unit} onChange={(event) => setNewItem({ ...newItem, unit: event.target.value })} placeholder="Pax / Trip" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
                </div>
              </div>
              <div className="lg:col-span-6">
                <label className="mb-1 block text-slate-600">Remark</label>
                <input disabled={!canEditPda} value={newItem.remarks} onChange={(event) => setNewItem({ ...newItem, remarks: event.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" disabled={!canEditPda} checked={newItem.vatApplied} onChange={(event) => setNewItem({ ...newItem, vatApplied: event.target.checked })} /> VAT 11%</label>
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
                <button type="button" onClick={printPda} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-600">Cetak / Simpan PDF</button>
                <button type="button" onClick={() => setShowPreview(false)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">Tutup</button>
              </div>
            </div>
            <iframe title={`Pratinjau ${documentLabel} ${job.jobId}`} srcDoc={previewHtml} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
      )}
      <iframe
        ref={printFrameRef}
        title={`Dokumen cetak PDA ${job.jobId}`}
        onLoad={handlePrintFrameLoad}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', height: '297mm', border: 0 }}
      />
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  Coins,
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  TrendingUp,
  Download,
  Building,
  Ship,
  ArrowUpRight,
  DollarSign,
  Eye,
  Plus,
  Search as SearchIcon,
  Trash2,
  CalendarDays,
} from 'lucide-react';
import { JobCall, ActiveTab, Currency, Vessel } from '../../types';
import { formatDateDisplay } from '../../utils/date';
import { db } from '../../db/storage';

interface FinanceViewProps {
  initialTab?: 'DASHBOARD' | 'JOB_INVOICE_OPEN' | 'INVOICES' | 'AP' | 'AR' | 'REPORTS';
  jobCalls: JobCall[];
  vessels?: Vessel[];
  activeJob: JobCall;
  onSelectJob: (jobId: string) => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  initialTab = 'DASHBOARD',
  jobCalls,
  vessels = [],
  activeJob,
  onSelectJob,
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'DASHBOARD' | 'JOB_INVOICE_OPEN' | 'INVOICES' | 'AP' | 'AR' | 'REPORTS'>(initialTab);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState('ALL');
  const [closingDetailJobId, setClosingDetailJobId] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const receiptDatePickerRef = useRef<HTMLInputElement | null>(null);
  const [receiptType, setReceiptType] = useState<'ADVANCE_PAYMENT' | 'INVOICE'>('INVOICE');
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptAmountError, setReceiptAmountError] = useState('');
  const [receiptBankRemark, setReceiptBankRemark] = useState('');
  const [receiptAttachment, setReceiptAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const openReceiptDatePicker = () => {
    const datePicker = receiptDatePickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (datePicker?.showPicker) datePicker.showPicker();
    else datePicker?.click();
  };
  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);
  const [msg, setMsg] = useState<string | null>(null);
  const [invoicePreviewHtml, setInvoicePreviewHtml] = useState<string | null>(null);
  const invoicePreviewRef = useRef<HTMLIFrameElement | null>(null);

  const vesselMaster = vessels.find((vessel) => vessel.id === activeJob.vesselId);

  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const formatIDR = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const jobCurrency: Currency = activeJob?.fda?.currency
    || activeJob?.actualCosts?.[0]?.currency
    || activeJob?.quotation?.epda?.currency
    || activeJob?.currency
    || 'IDR';
  const formatJobCurrency = (val: number) => jobCurrency === 'IDR' ? formatIDR(val) : formatUSD(val);
  const getJobCurrency = (job: JobCall): Currency => job.fda?.currency
    || job.actualCosts?.[0]?.currency
    || job.quotation?.epda?.currency
    || job.currency
    || 'IDR';
  const roundMoney = (amount: number, digits = 2) => Number(Math.abs(amount).toFixed(digits));
  const roundInvoiceAmount = (amount: number, currency: Currency) => {
    const precision = currency === 'IDR' ? 1 : 100;
    return Math.round((amount + Number.EPSILON) * precision) / precision;
  };
  const convertCurrency = (amount: number, from: Currency, to: Currency, exchangeRate: number) => {
    if (from === to) return to === 'IDR' ? Math.round(amount) : roundMoney(amount, 2);
    const converted = from === 'USD' && to === 'IDR' ? amount * exchangeRate : amount / exchangeRate;
    return to === 'IDR' ? Math.round(converted) : roundMoney(converted, 2);
  };
  const convertCurrencyPrecisely = (amount: number, from: Currency, to: Currency, exchangeRate: number) => {
    if (from === to) return amount;
    return from === 'USD' && to === 'IDR' ? amount * exchangeRate : amount / exchangeRate;
  };
  const formatCurrency = (amount: number, currency: Currency) => currency === 'IDR' ? formatIDR(amount) : formatUSD(amount);
  const formatCurrencyNumber = (amount: number, currency: Currency) => new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount);
  const getJobExchangeRate = (job: JobCall) => job.exchangeRateUSDToIDR || 15800;
  const isFDAApproved = (job?: JobCall) => Boolean(job?.fda?.fdaApproved || job?.fda?.approvalStatus === 'APPROVED');
  const approvedFDAJobs = jobCalls.filter(isFDAApproved);
  const normalizeToIDR = (amount: number, currency: Currency, exchangeRate: number) => {
    const value = currency === 'USD' ? amount * exchangeRate : amount;
    return Math.round(value);
  };
  const invoiceIssueDate = activeJob.principalInvoice?.invoiceDate || new Date().toISOString().slice(0, 10);
  const invoiceDueDate = activeJob.principalInvoice?.dueDate || new Date(new Date(invoiceIssueDate).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const invoiceBankInfo = jobCurrency === 'USD'
    ? 'BANK MANDIRI TEBET SUPOMO | Account Holder : PT.Lentera Global Maritim | Account Number (USD) : 120-00-5575599-0 | Swift Code Bank : BMRIIDJAXXX'
    : 'BANK NEGARA INDONESIA (Persero) Tbk | Account Holder : PT.Lentera Global Maritim | Account Number : 2824-1212-09 | Swift Code Bank : BNINIDJAXXX';

  const getJobPrincipalBilled = (job: JobCall) => {
    const billed = getJobPrincipalBilledRaw(job);
    return normalizeToIDR(billed.amount, billed.currency, getJobExchangeRate(job));
  };

  const getJobPrincipalBilledRaw = (job: JobCall) => {
    const currency = (job.fda?.currency || job.currency || 'IDR') as Currency;
    const billed = job.fda?.finalBilledToPrincipal
      || job.principalInvoice?.totalAmountUSD
      || job.quotation?.pda?.totalSellRate
      || job.quotation?.epda?.totalSellRate
      || 0;
    return {
      amount: roundInvoiceAmount(billed, currency),
      currency,
    };
  };

  const getJobReceiptsInCurrency = (job: JobCall, currency: Currency) => (job.principalReceipts || []).reduce((sum, receipt) => {
    const receiptCurrency = (receipt.currency || job.currency || 'IDR') as Currency;
    return sum + convertCurrencyPrecisely(Number(receipt.amount || 0), receiptCurrency, currency, getJobExchangeRate(job));
  }, 0);

  const getJobPrincipalReceived = (job: JobCall) => {
    const invoiceCurrency = getJobPrincipalBilledRaw(job).currency;
    return normalizeToIDR(getJobReceiptsInCurrency(job, invoiceCurrency), invoiceCurrency, getJobExchangeRate(job));
  };

  const normalizeOutstanding = (amount: number, currency: Currency) => roundInvoiceAmount(Math.max(0, amount), currency);

  const getJobPrincipalOutstandingIDR = (job: JobCall) => {
    const billed = getJobPrincipalBilledRaw(job);
    const exchangeRate = getJobExchangeRate(job);
    const received = getJobReceiptsInCurrency(job, billed.currency);
    const outstanding = normalizeOutstanding(billed.amount - received, billed.currency);
    return normalizeToIDR(outstanding, billed.currency, exchangeRate);
  };

  const getJobAdvancePayment = (job: JobCall) => (job.principalReceipts || [])
    .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT')
    .reduce((sum, receipt) => {
      const currency = (receipt.currency || job.currency || 'IDR') as Currency;
      return sum + normalizeToIDR(receipt.amount || 0, currency, getJobExchangeRate(job));
    }, 0);

  const getJobInvoicePayment = (job: JobCall) => (job.principalReceipts || [])
    .filter((receipt) => receipt.paymentType === 'INVOICE')
    .reduce((sum, receipt) => {
      const currency = (receipt.currency || job.currency || 'IDR') as Currency;
      return sum + normalizeToIDR(receipt.amount || 0, currency, getJobExchangeRate(job));
    }, 0);

  const apItems = activeJob?.ap || [];
  const arItems = activeJob?.ar || [];
  const invoiceItems = (activeJob?.actualCosts || []).map((item) => ({
    id: item.id,
    name: item.description,
    category: item.category,
    basis: item.vendorName || 'FDA Actual Cost',
    totalSellRate: item.amount || 0,
    currency: item.currency || jobCurrency,
  }));
  const invoiceGroups = invoiceItems.reduce((groups, item) => {
    const existing = groups.find((group) => group.category === item.category);
    if (existing) existing.items.push(item);
    else groups.push({ category: item.category, items: [item] });
    return groups;
  }, [] as Array<{ category: string; items: typeof invoiceItems[number][] }>);
  const invoiceCategoryLabel = (category: string) => category.replaceAll('_', ' ');

  const jobAPTotal = apItems.reduce((s, i) => s + (i.amount || 0), 0);
  const jobAPPaid = apItems.filter((i) => i.status === 'PAID').reduce((s, i) => s + (i.amount || 0), 0);

  const jobARTotalRaw = activeJob?.fda?.finalBilledToPrincipal
    || activeJob?.principalInvoice?.totalAmountUSD
    || arItems.reduce((s, i) => s + convertCurrency(i.requestedAmount || 0, i.currency, jobCurrency, getJobExchangeRate(activeJob)), 0);
  const jobARTotal = roundInvoiceAmount(jobARTotalRaw, jobCurrency);
  const receiptHistory = activeJob?.principalReceipts || [];
  const jobAdvancePayment = receiptHistory
    .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT')
    .reduce((s, receipt) => s + convertCurrency(receipt.amount || 0, receipt.currency, jobCurrency, getJobExchangeRate(activeJob)), 0);
  const jobInvoiceReceived = receiptHistory
    .filter((receipt) => receipt.paymentType === 'INVOICE')
    .reduce((s, receipt) => s + convertCurrency(receipt.amount || 0, receipt.currency, jobCurrency, getJobExchangeRate(activeJob)), 0);
  const jobTotalReceived = jobAdvancePayment + jobInvoiceReceived;
  const jobAROutstanding = normalizeOutstanding(jobARTotal - getJobReceiptsInCurrency(activeJob, jobCurrency), jobCurrency);
  const jobARReceived = jobTotalReceived;

  const toIDR = (amount: number, currency: 'USD' | 'IDR', exchangeRate: number) => {
    const value = currency === 'USD' ? amount * exchangeRate : amount;
    return Math.round(value);
  };

  const isClosedJob = (job: JobCall) => job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED';
  const sumApprovedFDAValue = (selector: (job: JobCall) => number) =>
    approvedFDAJobs.reduce((sum, job) => {
      const value = selector(job);
      const currency = (job.fda?.currency || job.currency || 'IDR') as Currency;
      return sum + toIDR(value, currency, getJobExchangeRate(job));
    }, 0);

  // Financial aggregates across all jobs that originate from FDA and are normalized to IDR
  const totalAP_USD = jobCalls.reduce((s, j) => s + (j.ap?.reduce((acc, i) => acc + (i.amount || 0), 0) || 0), 0);
  const totalAP_Paid_USD = jobCalls.reduce(
    (s, j) => s + (j.ap?.filter((i) => i.status === 'PAID').reduce((acc, i) => acc + (i.amount || 0), 0) || 0),
    0
  );
  const totalAR_USD = jobCalls.reduce((s, j) => s + (j.ar?.reduce((acc, i) => acc + (i.requestedAmount || 0), 0) || 0), 0);
  const totalAR_Collected_USD = jobCalls.reduce((s, j) => s + (j.principalReceipts || [])
    .filter((receipt) => receipt.paymentType === 'INVOICE')
    .reduce((sum, receipt) => sum + (receipt.amount || 0), 0), 0);
  const totalPrincipalBilled_USD = approvedFDAJobs.reduce((s, j) => s + (j.fda?.finalBilledToPrincipal || 0), 0);
  const totalAdvancePayment_USD = approvedFDAJobs.reduce((s, j) => s + (j.principalReceipts || [])
    .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT')
    .reduce((sum, receipt) => sum + (receipt.amount || 0), 0), 0);
  const totalPrincipalBilled_IDR = approvedFDAJobs.reduce((sum, job) => sum + getJobPrincipalBilled(job), 0);
  const totalInvoiceReceived_IDR = approvedFDAJobs.reduce((sum, job) => sum + getJobInvoicePayment(job), 0);
  const totalAdvancePayment_IDR = approvedFDAJobs.reduce(
    (sum, job) => sum + (isClosedJob(job) ? 0 : getJobAdvancePayment(job)),
    0
  );
  const totalReceived_IDR = totalAdvancePayment_IDR + totalInvoiceReceived_IDR;
  const totalIncomingBill_IDR = approvedFDAJobs.reduce((sum, job) => sum + getJobPrincipalReceived(job), 0);
  const totalOutstanding_IDR = approvedFDAJobs.reduce((sum, job) => sum + getJobPrincipalOutstandingIDR(job), 0);
  const pendingJobCount = approvedFDAJobs.filter((job) => !isClosedJob(job) && getJobPrincipalOutstandingIDR(job) > 0).length;
  const netOperatingProfit_USD = totalAR_USD - totalAP_USD;

  const handleReceivePrincipalPayment = () => {
    if (!isFDAApproved(activeJob)) {
      setMsg('Finance belum dapat membukukan AR. FDA harus Approved terlebih dahulu.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    if (jobAROutstanding > 0) {
      setMsg(`Pelunasan belum dapat dikonfirmasi. Catat penerimaan aktual terlebih dahulu. Sisa saldo: ${formatJobCurrency(jobAROutstanding)}.`);
      setTimeout(() => setMsg(null), 4500);
      return;
    }
    if (activeJob.principalInvoice?.status === 'SETTLED') {
      setMsg('Tagihan sudah dilunasi, segera tutup JOB Vessel melalui menu AR.');
      setTimeout(() => setMsg(null), 4500);
      return;
    }

    const updatedAR = arItems.map((item) => ({
      ...item,
      receivedAmount: item.requestedAmount,
      status: 'RECEIVED' as const,
      receivedDate: new Date().toISOString().slice(0, 10),
    }));

    db.updateJob(activeJob.jobId, {
      principalInvoice: {
        ...activeJob.principalInvoice,
        status: 'SETTLED',
        balanceDueUSD: 0,
        balanceDueIDR: 0,
      },
      ar: updatedAR,
      currentStage: 'PRINCIPAL_INVOICE',
    });

    setMsg('Tagihan sudah dilunasi, segera tutup JOB Vessel melalui menu AR.');
    setTimeout(() => setMsg(null), 4500);
  };

  const handleAddPrincipalReceipt = (event: React.FormEvent) => {
    event.preventDefault();
    const enteredAmount = Number(receiptAmount);
    const normalizeReceiptAmount = (value: number) => jobCurrency === 'IDR'
      ? Math.round(value)
      : Math.round((value + Number.EPSILON) * 100) / 100;
    const amount = normalizeReceiptAmount(enteredAmount);
    const outstandingBeforeReceipt = jobAROutstanding;
    const normalizedOutstanding = normalizeReceiptAmount(outstandingBeforeReceipt);
    const isWholeIDR = jobCurrency !== 'IDR' || Number.isInteger(enteredAmount);
    if (!isFDAApproved(activeJob) || !receiptDate || !Number.isFinite(enteredAmount) || enteredAmount <= 0 || !Number.isFinite(amount) || amount <= 0 || !receiptBankRemark.trim()) {
      setReceiptAmountError('Lengkapi tanggal, nominal penerimaan, dan remark bank. FDA harus Approved.');
      setMsg('Data penerimaan belum lengkap.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    if (!isWholeIDR) {
      setReceiptAmountError('Nominal IDR harus berupa angka bulat tanpa desimal.');
      return;
    }
    if (amount > normalizedOutstanding) {
      setReceiptAmountError(`Nominal tidak boleh melebihi sisa tagihan ${formatJobCurrency(outstandingBeforeReceipt)}.`);
      return;
    }
    setReceiptAmountError('');

    db.updateJob(activeJob.jobId, {
      principalReceipts: [
        ...receiptHistory,
        {
          id: `RECEIPT-${activeJob.jobId}-${Date.now()}`,
          jobId: activeJob.jobId,
          receivedDate: receiptDate,
          amount,
          currency: jobCurrency,
          paymentType: receiptType,
          bankRemark: receiptBankRemark.trim(),
          attachmentName: receiptAttachment?.name,
          attachmentDataUrl: receiptAttachment?.dataUrl,
        },
      ],
    });

    setReceiptAmount('');
    setReceiptAmountError('');
    setReceiptType('INVOICE');
    setReceiptBankRemark('');
    setReceiptAttachment(null);
    setMsg('Penerimaan uang dari Principal berhasil dicatat.');
    setTimeout(() => setMsg(null), 3500);
  };

  const handleDeleteReceipt = (receiptId: string) => {
    const receipt = receiptHistory.find((item) => item.id === receiptId);
    if (!receipt || !window.confirm(`Hapus entry penerimaan ${formatCurrency(receipt.amount, receipt.currency)}?`)) return;
    db.updateJob(activeJob.jobId, {
      principalReceipts: receiptHistory.filter((item) => item.id !== receiptId),
    });
    setMsg('Entry penerimaan berhasil dihapus.');
    setTimeout(() => setMsg(null), 3500);
  };

  const handleReceiptAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      setMsg('File bukti bank harus berformat PNG.');
      setTimeout(() => setMsg(null), 3500);
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceiptAttachment({ name: file.name, dataUrl: String(reader.result || '') });
    reader.readAsDataURL(file);
  };

  const handleCloseCollectedJob = () => {
    const guard = db.canCloseJob(activeJob.jobId);
    if (!guard.ok) {
      setMsg(guard.message || 'Job tidak dapat ditutup.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    if (!window.confirm(`Tutup Job Vessel ${activeJob.jobId}? Pastikan seluruh saldo AR sudah lunas.`)) return;
    const closed = db.closeJobWhenPrincipalCollected(activeJob.jobId, 'Finance');
    setMsg(closed ? `Job Vessel ${activeJob.jobId} berhasil ditutup.` : guard.message || 'Job tidak dapat ditutup.');
    setTimeout(() => setMsg(null), 4000);
  };

  const handleCloseJob = (jobId = activeJob.jobId) => {
    const guard = db.canCloseJob(jobId);
    if (!guard.ok) {
      setMsg(guard.message || 'Closing belum dapat dilakukan.');
      setTimeout(() => setMsg(null), 4500);
      return;
    }
    if (!window.confirm(`Tutup Job ${jobId} secara resmi? Pastikan seluruh saldo AR sudah lunas.`)) return;
    const closed = db.closeJob(jobId, 'Finance', 'FDA approved dan pelunasan AR principal sudah diterima.');
    setMsg(closed ? `Job Call ${jobId} resmi ditutup (CLOSING COMPLETE)!` : 'Closing gagal diproses.');
    setTimeout(() => setMsg(null), 4000);
  };

  const rawInvoiceAmount = activeJob.fda?.finalBilledToPrincipal || activeJob.principalInvoice?.totalAmountUSD || activeJob.quotation?.pda?.totalSellRate || activeJob.quotation?.epda?.totalSellRate || 0;
  const invoiceAmount = roundInvoiceAmount(rawInvoiceAmount, jobCurrency);
  const fdaBillingTotal = invoiceAmount;
  const financeGateMessage = !isFDAApproved(activeJob)
    ? 'Finance menunggu FDA Final. AP, AR, Principal Invoice dan Closing baru aktif setelah FDA Approved.'
    : '';

  const openInvoiceJobs = jobCalls.filter((job) => {
    const invoiceTotal = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || job.quotation?.pda?.totalSellRate || job.quotation?.epda?.totalSellRate || 0;
    const isClosed = job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED';
    return isFDAApproved(job) && (invoiceTotal > 0 || isClosed);
  });

  const closingJobs = openInvoiceJobs.filter((job) => job.closing?.isClosed || job.currentStage === 'CLOSED' || job.status === 'CLOSED');

  const monthOptions = Array.from(new Set(
    openInvoiceJobs.map((job) => {
      const source = job.inquiry?.date || job.createdAt || job.eta || job.etd || '';
      if (!source) return '';
      const date = new Date(source);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }).filter(Boolean)
  )).sort().reverse();

  const filteredInvoiceJobs = openInvoiceJobs.filter((job) => {
    const monthKey = (() => {
      const source = job.inquiry?.date || job.createdAt || job.eta || job.etd || '';
      if (!source) return '';
      const date = new Date(source);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })();

    const matchesMonth = invoiceMonth === 'ALL' || monthKey === invoiceMonth;
    const keyword = invoiceSearch.trim().toLowerCase();
    const matchesSearch = !keyword || [
      job.jobId,
      job.vesselName,
      job.customerName,
      job.portName,
      job.principalInvoice?.invoiceNo || `INV-${job.jobId}`,
      job.fda?.fdaNo || '',
    ].some((value) => value && value.toLowerCase().includes(keyword));

    return matchesMonth && matchesSearch;
  });

  const openPdfInNewTab = (dataUrl: string) => {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) return;

    const base64Data = dataUrl.slice(commaIndex + 1);
    const binary = window.atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
  };

  const openImageInNewTab = (dataUrl: string) => {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) return;

    const mimeType = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png';
    const binary = window.atob(dataUrl.slice(commaIndex + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const imageUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const link = document.createElement('a');
    link.href = imageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60000);
  };

  const printPrincipalInvoice = () => {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const rows = invoiceGroups.map((group) => `
      <tr class="category"><td colspan="3">${escapeHtml(invoiceCategoryLabel(group.category))}</td></tr>
      ${group.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.currency)}</td><td class="amount">${escapeHtml(formatCurrencyNumber(convertCurrency(item.totalSellRate, item.currency, jobCurrency, getJobExchangeRate(activeJob)), jobCurrency))}</td></tr>`).join('')}
    `).join('');

    const totalInvoiceRow = `<tr class="total"><td colspan="2" class="right">TOTAL NILAI INVOICE</td><td class="amount">${escapeHtml(formatCurrencyNumber(invoiceAmount, jobCurrency))}</td></tr>`;
    const equivalentRow = jobCurrency === 'USD'
      ? `<tr class="total"><td colspan="2" class="right">Equivalen IDR (Kurs ${escapeHtml(new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(activeJob.exchangeRateUSDToIDR || 15800))}):</td><td class="amount">${escapeHtml(formatIDR(invoiceAmount * (activeJob.exchangeRateUSDToIDR || 15800)))}</td></tr>`
      : '';

    const printBankInfo = jobCurrency === 'USD'
      ? 'BANK MANDIRI TEBET SUPOMO | Account Holder : PT.Lentera Global Maritim | Account Number (USD) : 120-00-5575599-0 | Swift Code Bank : BMRIIDJAXXX'
      : 'BANK NEGARA INDONESIA (Persero) Tbk | Account Holder : PT.Lentera Global Maritim | Account Number : 2824-1212-09 | Swift Code Bank : BNINIDJAXXX';

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Official Principal Invoice ${escapeHtml(activeJob.jobId)}</title>
      <style>
        @page { size: A4; margin: 12mm 12mm 16mm; }
        html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #1f2a37; font-size: 11px; line-height: 1.35; }
        .page { box-sizing: border-box; width: 100%; min-height: 100vh; }
        .brand-row { display: flex; align-items: center; gap: 16px; margin: 0 0 16px; padding-top: 4px; }
        .brand-wrap { display: flex; align-items: center; gap: 14px; }
        .logo { width: 68px; height: 52px; object-fit: contain; display: block; }
        .brand { font-weight: 700; font-size: 21px; color: #1f5ea8; letter-spacing: -0.03em; }
        .tag { font-size: 12px; color: #4b5d7a; margin-top: 3px; }
        .title-wrap { margin: 18px 0 10px; }
        .title-wrap h1 { margin: 0; font-size: 20px; line-height: 1.2; color: #1b2a45; text-transform: uppercase; letter-spacing: 0.02em; font-weight: 800; }
        .subtitle { margin-top: 4px; color: #58657a; font-size: 11px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0 8px; }
        .meta-box { border: 1px solid #dfe7f0; background: #f6f8fb; padding: 10px 12px; border-radius: 4px; min-height: 92px; }
        .meta-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #2c4d73; margin-bottom: 8px; }
        .meta-value { font-size: 11px; color: #22314d; line-height: 1.5; }
        .meta-row { display: grid; grid-template-columns: 72px 6px minmax(0, 1fr); gap: 1px; align-items: baseline; }
        .meta-key { font-weight: 700; color: #1a2950; white-space: nowrap; }
        .meta-colon { color: #22314d; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
        thead th { background: #dfeaf3; color: #1a2950; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #d3deea; text-align: left; }
        thead th.amount, tbody td.amount { text-align: right; white-space: nowrap; }
        tbody td { padding: 7px 8px; border-bottom: 1px solid #e6edf7; color: #1f2a37; vertical-align: top; }
        tbody tr.category td { background: #eff4fa; color: #20314d; font-size: 10px; font-weight: 700; text-transform: uppercase; padding-top: 8px; padding-bottom: 8px; border-top: 1px solid #dae2ec; border-bottom: 1px solid #dae2ec; }
        tbody tr.total td { font-weight: 700; background: #f0f6ff; color: #13233f; }
        tbody tr.total td.right { text-align: right; }
        .signature-wrap { margin-top: 28px; display: flex; justify-content: flex-end; }
        .signature-block { width: 260px; text-align: center; padding-top: 10px; color: #1d2c41; font-size: 11px; }
        .closing { margin-bottom: 18px; }
        .company { font-weight: 700; color: #1d2c41; margin-top: 18px; margin-bottom: 6px; }
        .role { font-size: 11px; color: #475569; }
        .office-footer { position: fixed; left: 0; right: 0; bottom: 0; text-align: center; padding-top: 8px; border-top: 1px solid #ced9e8; font-size: 9px; line-height: 1.5; color: #2c2f36; background: #fff; }
        .company-link { color: #d23d6f; text-decoration: none; }
        .spacer { height: 80px; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="brand-row">
          <div class="brand-wrap">
            <img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="LGM">
            <div>
              <div class="brand">PT Lentera Global Maritim</div>
              <div class="tag">Seamless Agent, Global Reach</div>
            </div>
          </div>
        </div>

        <div class="title-wrap">
          <h1>OFFICIAL PRINCIPAL INVOICE</h1>
          <div class="subtitle">Tagihan resmi port disbursement account diterbitkan untuk Principal kapal</div>
        </div>

        <div class="meta-grid">
          <div class="meta-box">
            <span class="meta-label">Billed To Principal:</span>
            <div class="meta-value meta-row"><div class="meta-key">Principal</div><div class="meta-colon">:</div><div>${escapeHtml(activeJob.customerName)}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">Port</div><div class="meta-colon">:</div><div>${escapeHtml(activeJob.portName)}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">Vessel / IMO</div><div class="meta-colon">:</div><div>${escapeHtml(activeJob.vesselName)} / ${escapeHtml(vesselMaster?.imoNumber || '-')}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">ETA / ETD</div><div class="meta-colon">:</div><div>${escapeHtml(formatDateDisplay(activeJob.eta))} / ${escapeHtml(formatDateDisplay(activeJob.etd))}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">Flag</div><div class="meta-colon">:</div><div>${escapeHtml(vesselMaster?.flag || '-')}</div></div>
          </div>

          <div class="meta-box">
            <span class="meta-label">Bank Details:</span>
            <div class="meta-value meta-row"><div class="meta-key">Invoice No.</div><div class="meta-colon">:</div><div>${escapeHtml(activeJob.principalInvoice?.invoiceNo || `INV-${activeJob.jobId}`)}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">Issue Date</div><div class="meta-colon">:</div><div>${escapeHtml(formatDateDisplay(invoiceIssueDate))}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">Due Date</div><div class="meta-colon">:</div><div>${escapeHtml(formatDateDisplay(invoiceDueDate))}</div></div>
            <div class="meta-value meta-row"><div class="meta-key">Bank</div><div class="meta-colon">:</div><div>${escapeHtml(printBankInfo)}</div></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:58%">Description</th>
              <th style="width:20%">Currency</th>
              <th class="amount" style="width:22%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            ${totalInvoiceRow}
            ${equivalentRow}
          </tbody>
        </table>

        <div class="signature-wrap">
          <div class="signature-block">
            <div class="closing">Sincerely,</div>
            <div class="company">PT. LENTERA GLOBAL MARITIM</div>
            <div class="role">Finance</div>
          </div>
        </div>

        <div class="spacer"></div>
      </div>

      <div class="office-footer">
        Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>
        Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br>
        <span class="company-link">email : maritim@lentera-global.com / web : www.lentera-global.com</span>
      </div>
    </body></html>`;

    setInvoicePreviewHtml(html);
  };  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Coins className="w-4 h-4" />
            <span>FINANCE & TREASURY DISBURSEMENT PORTAL</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            FINANCE PORTAL
          </h1>
          <p className="text-xs text-slate-400">
            Invoice Principal, Accounts Payable (AP Vendor), Accounts Receivable (AR), dan Laporan Keuangan Voyage P&L
          </p>
        </div>

        {/* Navigation is handled by the role sidebar. */}
      </div>

      {msg && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{msg}</span>
        </div>
      )}

      {financeGateMessage && subTab !== 'DASHBOARD' && (
        <div className="p-4 bg-slate-800 border border-slate-600 rounded-xl text-slate-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{financeGateMessage}</span>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {invoicePreviewHtml && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setInvoicePreviewHtml(null); }}
        >
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Preview Invoice</div>
                <div className="truncate text-sm text-white">Official Principal Invoice</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => invoicePreviewRef.current?.contentWindow?.print()}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setInvoicePreviewHtml(null)}
                  className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Tutup
                </button>
              </div>
            </div>
            <iframe
              ref={invoicePreviewRef}
              srcDoc={invoicePreviewHtml}
              title="Principal Invoice Preview"
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      )}

      {subTab === 'JOB_INVOICE_OPEN' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  JOB INVOICE
                </span>
                <h2 className="text-base font-bold text-white uppercase tracking-wider mt-1">
                  Menu JOB Invoice & Control Job
                </h2>
                <p className="text-xs text-slate-400">
                  Semua data dari FDA yang sudah approved, termasuk job invoice yang telah selesai diproses dan ditutup untuk kebutuhan kontrol Finance.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Total Job</span>
                <span className="text-lg font-black text-white font-mono">{openInvoiceJobs.length}</span>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="relative flex-1 max-w-[760px]">
                <SearchIcon className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Cari inquiry berdasarkan Kapal, No. Inquiry, Pelabuhan..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={invoiceMonth}
                  onChange={(e) => setInvoiceMonth(e.target.value)}
                  className="sales-filter-control"
                >
                  <option value="ALL">Semua Bulan Inquiry</option>
                  {monthOptions.map((monthKey) => (
                    <option key={monthKey} value={monthKey}>
                      {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01T00:00:00`))}
                    </option>
                  ))}
                </select>
                <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200">
                  Total: <span className="text-cyan-300">{filteredInvoiceJobs.length}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">No</th>
                    <th className="p-3">JOB ID / Vessel</th>
                    <th className="p-3">Vessel / Principal</th>
                    <th className="p-3">FDA Status</th>
                    <th className="p-3">Invoice No</th>
                    <th className="p-3">Invoice Status</th>
                    <th className="p-3 text-right">Total Invoice</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredInvoiceJobs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400">
                        Belum ada job dari FDA yang siap masuk ke menu JOB Invoice.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoiceJobs.map((job, index) => {
                      const invoiceTotal = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || job.quotation?.pda?.totalSellRate || job.quotation?.epda?.totalSellRate || 0;
                      const invoiceCurrency = getJobCurrency(job);
                      return (
                        <tr key={job.jobId} className="hover:bg-slate-800/40">
                          <td className="p-3 font-mono text-slate-300">{index + 1}</td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-cyan-400 block">{job.jobId}</span>
                            <span className="text-[11px] text-slate-400">{job.vesselName}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-white block">{job.vesselName}</span>
                            <span className="text-[11px] text-slate-400">{job.customerName}</span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                              APPROVED
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-300">
                            {job.principalInvoice?.invoiceNo || `INV-${job.jobId}`}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.principalInvoice?.status === 'SETTLED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {job.principalInvoice?.status || 'DRAFT'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-cyan-300">
                            {formatCurrency(invoiceTotal, invoiceCurrency)}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1.5 flex-row-reverse">
                              <button
                                onClick={() => {
                                  onSelectJob(job.jobId);
                                  setSubTab('INVOICES');
                                }}
                                className="px-2.5 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-[10px] font-bold tracking-wide hover:bg-cyan-500/20 transition-colors"
                              >
                                Invoice
                              </button>
                              {job.fda?.pdfDataUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openPdfInNewTab(job.fda?.pdfDataUrl || '')}
                                  title="Lihat file PDF FDA"
                                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-cyan-200 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/20"
                                >
                                  <Eye className="h-3 w-3" />
                                  Lihat Data
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-slate-500 cursor-not-allowed"
                                >
                                  <Eye className="h-3 w-3" />
                                  Lihat Data
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  onSelectJob(job.jobId);
                                  setSubTab('AP');
                                }}
                                className="px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 text-[10px] font-bold tracking-wide hover:bg-amber-500/20 transition-colors"
                              >
                                Terima
                              </button>
                              <button
                                onClick={() => {
                                  onSelectJob(job.jobId);
                                  setSubTab('AR');
                                }}
                                className="px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-[10px] font-bold tracking-wide hover:bg-emerald-500/20 transition-colors"
                              >
                                Closing
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'DASHBOARD' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs uppercase font-bold text-slate-400 block">TOTAL TAGIHAN PRINCIPAL</span>
              <span className="text-xl font-black text-cyan-300 font-mono mt-1 block">{formatIDR(totalPrincipalBilled_IDR)}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs uppercase font-bold text-slate-400 block">TOTAL TAGIHAN MASUK</span>
              <span className="text-xl font-black text-slate-200 font-mono mt-1 block">{formatIDR(totalIncomingBill_IDR)}</span>
              <span className="text-[11px] text-slate-400">Total Diterima (Received)</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs uppercase font-bold text-slate-400 block">TOTAL SISA TAGIHAN</span>
              <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">{formatIDR(totalOutstanding_IDR)}</span>
              <span className="text-[11px] text-emerald-400 font-semibold">AR Sisa Saldo Belum Bayar</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs uppercase font-bold text-slate-400 block">TOTAL ADVANCE PAYMENT</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-1 block">{formatIDR(totalAdvancePayment_IDR)}</span>
              <span className="text-[11px] text-slate-400">Kumulatif Advance Payment dari AR</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs uppercase font-bold text-slate-400 block">JUMLAH JOB ID PENDING</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-1 block">{pendingJobCount}</span>
              <span className="text-[11px] text-slate-400">Job FDA approved dengan sisa tagihan</span>
            </div>
          </div>

          {/* Job Calls Financial Status Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-4">
              Rekapitulasi Keuangan per Vessel Call (Job ID)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">No</th>
                    <th className="p-3">JOB ID</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">NO FDA</th>
                    <th className="p-3">Vessel & Principal</th>
                    <th className="p-3 text-right">Total Tagihan (IDR)</th>
                    <th className="p-3 text-right">Tagihan Masuk (IDR)</th>
                    <th className="p-3 text-right">Advance Payment (IDR)</th>
                    <th className="p-3 text-right">Sisa Tagihan (IDR)</th>
                    <th className="p-3">Status AP</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {approvedFDAJobs.map((j, index) => {
                    const exchangeRate = getJobExchangeRate(j);
                    const rowCurrency = getJobCurrency(j);
                    const rawBill = getJobPrincipalBilledRaw(j);
                    const billedAmount = rawBill.amount;
                    const receivedAmount = getJobReceiptsInCurrency(j, rowCurrency);
                    const advancePaymentAmount = (j.principalReceipts || [])
                      .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT')
                      .reduce((sum, receipt) => {
                        const receiptCurrency = (receipt.currency || j.currency || 'IDR') as Currency;
                        const signed = receiptCurrency === rowCurrency
                          ? (receipt.amount || 0)
                          : convertCurrency(receipt.amount || 0, receiptCurrency, rowCurrency, exchangeRate);
                        return sum + signed;
                      }, 0);
                    const outstandingAmount = normalizeOutstanding(billedAmount - receivedAmount, rowCurrency);
                    const apTotal = j.ap?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
                    const apPaid = j.ap?.filter((item) => item.status === 'PAID').reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
                    const apStatus = isClosedJob(j) ? 'CLOSED' : apTotal === 0 || apPaid >= apTotal ? 'PAID' : apPaid > 0 ? 'PARTIALLY_PAID' : 'OPEN';

                    return (
                      <tr key={j.jobId} className="hover:bg-slate-800/40">
                        <td className="p-3 text-slate-400">{index + 1}</td>
                        <td className="p-3 font-mono font-bold text-cyan-400">{j.jobId}</td>
                        <td className="p-3 text-slate-300">{j.inquiry?.createdByBranch || 'Head Office'}</td>
                        <td className="p-3 font-mono text-slate-300">{j.fda?.fdaNo || '-'}</td>
                        <td className="p-3">
                          <span className="font-bold text-white block">{j.vesselName}</span>
                          <span className="text-[11px] text-slate-400">{j.customerName}</span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-cyan-300">
                          {formatCurrency(billedAmount, rowCurrency)}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-300">
                          {formatCurrency(receivedAmount, rowCurrency)}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-300">
                          {formatCurrency(advancePaymentAmount, rowCurrency)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-300">
                          {formatCurrency(outstandingAmount, rowCurrency)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              apStatus === 'PAID' || apStatus === 'CLOSED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : apStatus === 'PARTIALLY_PAID'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {apStatus}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              onSelectJob(j.jobId);
                              setSubTab('INVOICES');
                            }}
                            title="Lihat Official Principal Invoice"
                            aria-label={`Lihat Official Principal Invoice ${j.jobId}`}
                            className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PRINCIPAL INVOICES TAB */}
      {subTab === 'INVOICES' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-5 gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  JOB REF: {activeJob.jobId}
                </span>
                <h2 className="text-xl font-black text-white font-mono mt-1">
                  OFFICIAL PRINCIPAL INVOICE
                </h2>
                <p className="text-xs text-slate-400">
                  Tagihan resmi port disbursement account diterbitkan untuk Principal kapal
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSubTab('JOB_INVOICE_OPEN')}
                  className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold hover:bg-slate-800"
                >
                  ← Back
                </button>

                <span
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold uppercase ${
                    activeJob.principalInvoice?.status === 'SETTLED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  Status: {activeJob.principalInvoice?.status || 'ISSUED'}
                </span>

                {activeJob.principalInvoice?.status !== 'SETTLED' && (
                  <button
                    onClick={handleReceivePrincipalPayment}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Konfirmasi Terima Pembayaran (AR)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Formal Invoice Layout Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-950 p-5 rounded-2xl border border-slate-800 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Billed To Principal:</span>
                <p className="font-bold text-white text-sm">{activeJob.customerName}</p>
                <p className="text-slate-400">Attention: Disbursements Dept.</p>
                <p className="text-slate-400">Port: {activeJob.portName}</p>
                <p className="text-slate-400">Vessel / IMO: {activeJob.vesselName} / {vesselMaster?.imoNumber || '-'}</p>
                <p className="text-slate-400">ETA / ETD: {formatDateDisplay(activeJob.eta)} / {formatDateDisplay(activeJob.etd)}</p>
                <p className="text-slate-400">Flag: {vesselMaster?.flag || '-'}</p>
              </div>

              <div className="space-y-1 sm:text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Invoice Details:</span>
                <p className="font-mono font-bold text-cyan-400 text-sm">{activeJob.principalInvoice?.invoiceNo || `INV-${activeJob.jobId}`}</p>
                <p className="text-slate-400 font-mono">Tanggal Terbit: {formatDateDisplay(invoiceIssueDate)}</p>
                <p className="text-slate-400 font-mono">Jatuh Tempo: {formatDateDisplay(invoiceDueDate)}</p>
                <p className="text-slate-400">Bank: {invoiceBankInfo}</p>
              </div>
            </div>

            {/* Line items in invoice */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">Deskripsi Tagihan Port Disbursement</th>
                    <th className="p-3 text-right">Mata Uang</th>
                    <th className="p-3 text-right">Total Tagihan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {invoiceGroups.map((group) => (
                    <React.Fragment key={group.category}>
                      <tr className="font-bold uppercase tracking-wider" style={{ backgroundColor: '#e8eef6', color: '#52637a' }}>
                        <td colSpan={3} className="p-2.5">{invoiceCategoryLabel(group.category)}</td>
                      </tr>
                      {group.items.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-semibold text-white">
                            {it.name}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">{it.currency}</td>
                          <td className="p-3 text-right font-mono font-bold text-cyan-300">
                            {formatCurrencyNumber(convertCurrency(it.totalSellRate, it.currency, jobCurrency, getJobExchangeRate(activeJob)), jobCurrency)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950 font-bold border-t border-slate-700 text-xs">
                  <tr>
                    <td colSpan={2} className="p-3 text-right text-slate-400 uppercase">
                      Total Nilai Invoice Principal:
                    </td>
                    <td className="p-3 text-right font-mono text-cyan-400 text-base">
                      {formatCurrencyNumber(invoiceAmount, jobCurrency)}
                    </td>
                  </tr>
                  {jobCurrency === 'USD' && (
                    <tr>
                      <td colSpan={2} className="p-3 text-right text-slate-400 uppercase">
                        Equivalen IDR (Kurs {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(activeJob.exchangeRateUSDToIDR || 15800)}):
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatIDR(invoiceAmount * (activeJob.exchangeRateUSDToIDR || 15800))}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={printPrincipalInvoice} className="px-4 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-bold flex items-center gap-2 hover:bg-slate-100">
                <FileSpreadsheet className="w-4 h-4" /> Cetak / PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINCIPAL RECEIPTS TAB */}
      {subTab === 'AP' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  JOB: {activeJob.jobId}
                </span>
                <h2 className="text-base font-bold text-white uppercase tracking-wider mt-1">
                  Pencatatan Uang Masuk dari Principal (AR)
                </h2>
                <p className="text-xs text-slate-400">
                  Catat penerimaan pembayaran Principal dan simpan bukti transfer bank untuk kontrol Finance.
                </p>
                <p className="text-xs font-semibold text-cyan-300 mt-2">
                  Currency Job: {jobCurrency} {jobCurrency === 'USD' ? `| Kurs: ${formatIDR(activeJob.exchangeRateUSDToIDR || 15800)} / USD` : ''}
                </p>
                <p className="text-xs font-semibold text-cyan-300 mt-2">
                  Total Tagihan FDA: <span className="font-mono text-base">{formatJobCurrency(fdaBillingTotal)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSubTab('JOB_INVOICE_OPEN')}
                  className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold hover:bg-slate-800"
                >
                  ← Back
                </button>
                <div className="text-right">
                  <div>
                    <span className="text-xs text-slate-400 block">Total Diterima (Received):</span>
                    <span className="text-lg font-black text-white font-mono">
                      {formatJobCurrency(jobARReceived)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-xs text-slate-400 block">Sisa Saldo Belum Bayar:</span>
                    <span className="text-lg font-black text-amber-300 font-mono">
                      {formatJobCurrency(jobAROutstanding)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddPrincipalReceipt} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">
                <label htmlFor="receipt-date-display">Tanggal Masuk *</label>
                <div className="relative mt-1">
                  <input id="receipt-date-display" type="text" readOnly value={formatDateDisplay(receiptDate)} onClick={openReceiptDatePicker} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-10 text-sm text-white" />
                  <button type="button" onClick={openReceiptDatePicker} aria-label="Pilih tanggal masuk" title="Pilih tanggal" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 hover:bg-slate-700">
                    <CalendarDays className="h-4 w-4" />
                  </button>
                  <input ref={receiptDatePickerRef} type="date" required value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} aria-label="Pilih tanggal masuk" className="pointer-events-none absolute h-px w-px opacity-0" />
                </div>
              </div>
              <label className="text-xs text-slate-400">Jenis Penerimaan *
                <select required value={receiptType} onChange={(event) => setReceiptType(event.target.value as 'ADVANCE_PAYMENT' | 'INVOICE')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                  <option value="ADVANCE_PAYMENT">Advance Payment</option>
                  <option value="INVOICE">Invoice</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">Nominal Masuk ({jobCurrency}) *
                <input
                  type="number"
                  required
                  min={jobCurrency === 'IDR' ? '1' : '0.01'}
                  step={jobCurrency === 'IDR' ? '1' : '0.01'}
                  value={receiptAmount}
                  onChange={(event) => { setReceiptAmount(event.target.value); setReceiptAmountError(''); }}
                  placeholder={jobCurrency === 'IDR' ? '0' : '0.00'}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  Format: {receiptAmount && Number.isFinite(Number(receiptAmount)) ? formatCurrency(Number(receiptAmount), jobCurrency) : jobCurrency === 'IDR' ? 'Rp 0' : '0 USD'}
                </span>
              </label>
              <label className="text-xs text-slate-400">Remark Bank *
                <input required value={receiptBankRemark} onChange={(event) => setReceiptBankRemark(event.target.value)} placeholder="Contoh: Transfer BCA dari Principal" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">Upload Bukti PNG
                <input type="file" accept="image/png" onChange={handleReceiptAttachment} className="mt-1 w-full text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-cyan-500/20 file:px-2 file:py-1.5 file:text-cyan-200" />
              </label>
              <div className="md:col-span-2 xl:col-span-5 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-slate-500">{receiptAttachment ? `File: ${receiptAttachment.name}` : 'Bukti transfer PNG opsional.'}</span>
                  {receiptAmountError && <div className="mt-1 text-xs font-semibold text-rose-300">{receiptAmountError}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Simpan Penerimaan</button>
                  <button
                    type="button"
                    onClick={handleReceivePrincipalPayment}
                    title={jobAROutstanding > 0 ? 'Catat seluruh penerimaan terlebih dahulu.' : 'Tandai AR PAID; job tidak ditutup.'}
                    className="px-4 py-2 rounded-xl border-2 border-sky-500 bg-sky-200 text-sky-950 text-xs font-black shadow-sm hover:bg-sky-300"
                  >
                    PAID
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">History Penerimaan Uang Masuk</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3">No</th>
                      <th className="p-3">Tanggal Masuk</th>
                      <th className="p-3">Jenis</th>
                      <th className="p-3 text-right">Nominal</th>
                      <th className="p-3">Remark Bank</th>
                      <th className="p-3">Bukti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {receiptHistory.length === 0 ? (
                      <tr><td colSpan={6} className="p-5 text-center text-slate-500">Belum ada history penerimaan uang masuk.</td></tr>
                    ) : receiptHistory.map((receipt, index) => (
                      <tr key={receipt.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-slate-300">{index + 1}</td>
                        <td className="p-3 text-slate-300">{formatDateDisplay(receipt.receivedDate)}</td>
                        <td className="p-3 text-slate-300">{receipt.paymentType === 'ADVANCE_PAYMENT' ? 'Advance Payment' : 'Invoice'}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-300">{jobCurrency === receipt.currency ? formatJobCurrency(receipt.amount) : `${receipt.currency} ${receipt.amount.toLocaleString('en-US')}`}</td>
                        <td className="p-3 text-slate-300">{receipt.bankRemark}</td>
                        <td className="relative p-3 text-center">
                          <div className="flex items-center justify-center text-center">
                            {receipt.attachmentDataUrl ? (
                              <button
                                type="button"
                                onClick={() => openImageInNewTab(receipt.attachmentDataUrl || '')}
                                className="mx-auto inline-block text-cyan-300 hover:text-cyan-200"
                              >
                                Lihat PNG
                              </button>
                            ) : <span className="mx-auto text-slate-500">-</span>}
                            <button
                              type="button"
                              onClick={() => handleDeleteReceipt(receipt.id)}
                              title="Hapus entry penerimaan"
                              aria-label={`Hapus entry penerimaan ${receipt.id}`}
                              className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AR (ACCOUNTS RECEIVABLE) TAB */}
      {subTab === 'AR' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-base font-bold text-white uppercase tracking-wider">
                  Accounts Receivable (Piutang Principal)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Monitoring penerimaan dana port disbursement account dari {activeJob.customerName}
                </p>
              </div>

              <button
                onClick={() => setSubTab('JOB_INVOICE_OPEN')}
                className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold hover:bg-slate-800"
              >
                ← Back
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Total Ditagihkan (AR)</span>
                <span className="text-base font-bold text-cyan-400">
                  {formatJobCurrency(jobARTotal)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Advance Payment</span>
                <span className="text-base font-bold text-violet-300">
                  {formatJobCurrency(jobAdvancePayment)}
                </span>
                <span className="text-[10px] text-slate-500 ml-2">
                  {jobCurrency === 'USD' ? ` / ${formatIDR(jobAdvancePayment * (activeJob.exchangeRateUSDToIDR || 15800))}` : ''}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Total Diterima (Received)</span>
                <span className="text-base font-bold text-emerald-400">
                  {formatJobCurrency(jobARReceived)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Sisa Saldo Belum Bayar</span>
                <span className="text-base font-bold text-amber-400">
                  {formatJobCurrency(jobAROutstanding)}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              {isClosedJob(activeJob) ? (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Job Vessel sudah selesai</span>
                </div>
              ) : jobAROutstanding > 0 ? (
                <button
                  onClick={() => setSubTab('AP')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Bukukan Pelunasan Piutang</span>
                </button>
              ) : (
                <button
                  onClick={handleCloseCollectedJob}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tutup Job Vessel</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'REPORTS' && (
        <div className="space-y-4">
          {closingDetailJobId && activeJob.jobId === closingDetailJobId ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-purple-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    CLOSING STAGE • {activeJob.jobId}
                  </span>
                  <h2 className="text-lg font-black text-white mt-1">Laporan Keuangan & Final Voyage Closing</h2>
                </div>
                <button
                  onClick={() => setClosingDetailJobId(null)}
                  className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold hover:bg-slate-800"
                >
                  ← Back
                </button>
              </div>

              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Total Ditagihkan (AR)</span>
                  <span className="font-bold text-cyan-300">{formatJobCurrency(jobARTotal)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Advance Payment</span>
                  <span className="font-bold text-amber-300">{formatJobCurrency(jobAdvancePayment)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Total Diterima (Received)</span>
                  <span className="font-bold text-emerald-300">{formatJobCurrency(jobTotalReceived)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1">
                  <span className="text-rose-300">Sisa Saldo Belum Bayar</span>
                  <span className="text-rose-300">{formatJobCurrency(Math.max(0, jobARTotal - jobAdvancePayment - jobTotalReceived))}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  <span>Status Pekerjaan: </span>
                  <strong className="text-white uppercase font-mono">{activeJob.status}</strong>
                  {activeJob.status === 'CLOSED' && <span className="ml-2 text-emerald-400 font-semibold">(Telah ditutup secara finansial)</span>}
                </div>
                {activeJob.status !== 'CLOSED' ? (
                  <button onClick={() => handleCloseJob(closingDetailJobId)} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span>Close Job Secara Resmi (Tahap 10: Closing)</span>
                  </button>
                ) : (
                  <div className="text-xs font-bold text-purple-300 bg-purple-950/60 border border-purple-800/60 px-4 py-2 rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    <span>Job ID {activeJob.jobId} Selesai & Terarsip</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <span className="text-xs font-mono font-bold text-purple-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    JOB CLOSING
                  </span>
                  <h2 className="text-base font-bold text-white uppercase tracking-wider mt-1">
                    Menu JOB Closing & Final Voyage
                  </h2>
                  <p className="text-xs text-slate-400">
                    Review job vessel yang sudah ditutup untuk pemeriksaan akhir keuangan dan penutupan voyage.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Job</span>
                  <span className="text-lg font-black text-white font-mono">{closingJobs.length}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3">No</th>
                      <th className="p-3">JOB ID / Vessel</th>
                      <th className="p-3">Vessel / Principal</th>
                      <th className="p-3">FDA Status</th>
                      <th className="p-3">Invoice No</th>
                      <th className="p-3">Invoice Status</th>
                      <th className="p-3 text-right">Total Invoice</th>
                      <th className="p-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {closingJobs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          Belum ada job vessel yang sudah close untuk review.
                        </td>
                      </tr>
                    ) : (
                      closingJobs.map((job, index) => {
                        const invoiceTotal = job.fda?.finalBilledToPrincipal || job.principalInvoice?.totalAmountUSD || job.quotation?.pda?.totalSellRate || job.quotation?.epda?.totalSellRate || 0;
                        const invoiceCurrency = getJobCurrency(job);
                        return (
                          <tr key={job.jobId} className="hover:bg-slate-800/40">
                            <td className="p-3 font-mono text-slate-300">{index + 1}</td>
                            <td className="p-3">
                              <span className="font-mono font-bold text-cyan-400 block">{job.jobId}</span>
                              <span className="text-[11px] text-slate-400">{job.vesselName}</span>
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-white block">{job.vesselName}</span>
                              <span className="text-[11px] text-slate-400">{job.customerName}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                                {isFDAApproved(job) ? 'APPROVED' : 'PENDING'}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-slate-300">
                              {job.principalInvoice?.invoiceNo || `INV-${job.jobId}`}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                job.principalInvoice?.status === 'SETTLED'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {job.principalInvoice?.status || 'DRAFT'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-cyan-300">
                              {formatCurrency(invoiceTotal, invoiceCurrency)}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => {
                                  onSelectJob(job.jobId);
                                  setClosingDetailJobId(job.jobId);
                                }}
                                title="Lihat Detail Closing"
                                aria-label={`Lihat Detail Closing ${job.jobId}`}
                                className="inline-flex items-center justify-center p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};


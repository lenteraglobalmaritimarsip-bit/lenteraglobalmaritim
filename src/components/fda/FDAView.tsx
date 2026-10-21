import React, { useEffect, useRef, useState } from 'react';
import {
  FileCheck2,
  Coins,
  Receipt,
  CheckCircle2,
  Plus,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Send,
  Eye,
  Download,
  Printer,
  Upload,
  Trash2,
} from 'lucide-react';
import { JobCall, FdaItem, ActiveTab, Vessel, FixTariff, ExpensesItem, Currency, DisbursementItem, PrincipalReceipt, formatPurposeOfCall } from '../../types';
import { db } from '../../db/storage';
import { calculateTariffForJob, CalculationBasis, describeTariffFormula, describeTariffService, matchesTariffGRT, parseTariffNumber, formatTariffNumber, getTariffRateForCurrency, filterTariffsByGRT, selectPreferredTariffOptions } from '../../utils/tariff';
import { formatDateDisplay, formatInquiryDate, getLatestInquiryMonthRange, isInquiryDateInRange, todayISO } from '../../utils/date';
import { InquiryDateRangePicker, InquiryDateRange } from '../shared/InquiryDateRangePicker';
import { DateInput } from '../shared/DateInput';
import { DateTimeInput } from '../shared/DateTimeInput';
import { formatCostCategoryLabel, getCostCategoryRank, normalizeCostCategory } from '../../utils/costCategories';
import { findMatchingExpensesItem, findMatchingFixTariff } from '../../utils/masterDataIdentity';
import { createMasterItemSearchOptions, MasterItemSearch, MasterItemSearchOption } from '../shared/MasterItemSearch';
import { ApprovedSalesPdaTotal, listApprovedFdaPdaTotals, loadFdaReceivableEntries } from '../../lib/api';

interface FDAViewProps {
  initialTab?: 'DASHBOARD' | 'JOB_ID' | 'FDA_AMOUNT' | 'QUOTES_VIEW' | 'APPROVAL';
  printPreviewOnly?: boolean;
  jobCalls: JobCall[];
  vessels: Vessel[];
  activeJob: JobCall;
  activeUserBranch?: string;
  onSelectJob: (jobId: string) => void;
  fixTariffs?: FixTariff[];
  expensesItems?: ExpensesItem[];
  onNavigate: (tab: ActiveTab) => void;
}

export const FDAView: React.FC<FDAViewProps> = ({
  initialTab = 'DASHBOARD',
  printPreviewOnly = false,
  jobCalls,
  vessels,
  activeJob,
  activeUserBranch,
  onSelectJob,
  fixTariffs = [],
  expensesItems = [],
  onNavigate,
}) => {
  const toDateTimeInput = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace(' ', 'T').slice(0, 16);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const [subTab, setSubTab] = useState<'DASHBOARD' | 'JOB_ID' | 'FDA_AMOUNT' | 'QUOTES_VIEW' | 'APPROVAL'>(initialTab);
  const [approvedFpdaTotals, setApprovedFpdaTotals] = useState<ApprovedSalesPdaTotal[]>([]);
  const [financeReceivableEntries, setFinanceReceivableEntries] = useState<Awaited<ReturnType<typeof loadFdaReceivableEntries>>>([]);
  const [financeReceivableError, setFinanceReceivableError] = useState('');
  const isFDAApproved = Boolean(activeJob.fda?.fdaApproved || activeJob.fda?.approvalStatus === 'APPROVED');
  const isFDASubmitted = activeJob.fda?.approvalStatus === 'SUBMITTED';
  const isFDAReadOnly = isFDAApproved || isFDASubmitted;
  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    void listApprovedFdaPdaTotals()
      .then((totals) => { if (!cancelled) setApprovedFpdaTotals(totals); })
      .catch((error) => console.error('Approved FPDA totals failed to load:', error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshFinanceReceivables = () => {
      void loadFdaReceivableEntries(activeJob.jobId)
        .then((entries) => {
          if (cancelled) return;
          setFinanceReceivableEntries(entries);
          setFinanceReceivableError('');
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setFinanceReceivableError(error instanceof Error ? error.message : 'Riwayat penerimaan Finance gagal dimuat.');
            console.error('Gagal memuat penerimaan Finance untuk FDA:', error);
          }
        });
    };
    setFinanceReceivableEntries([]);
    setFinanceReceivableError('');
    refreshFinanceReceivables();
    const intervalId = window.setInterval(refreshFinanceReceivables, 30000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshFinanceReceivables();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeJob.jobId]);

  useEffect(() => {
    const stopEnterSubmit = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      const isEnter = event.key === 'Enter' || event.key === 'NumpadEnter';

      if (isEnter && isTextField) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', stopEnterSubmit, true);
    return () => window.removeEventListener('keydown', stopEnterSubmit, true);
  }, []);

  const [showAddActualModal, setShowAddActualModal] = useState(false);
  const [editingActualId, setEditingActualId] = useState<string | null>(null);
  const [editingResultAmountId, setEditingResultAmountId] = useState<string | null>(null);
  const [resultAmountDraft, setResultAmountDraft] = useState({ description: '', tariff: '', amount: '', remarks: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [advancePaymentDate, setAdvancePaymentDate] = useState(todayISO());
  const [advancePaymentAmount, setAdvancePaymentAmount] = useState('');
  const [advancePaymentRemark, setAdvancePaymentRemark] = useState('');
  const [advancePaymentError, setAdvancePaymentError] = useState('');
  const [isSavingAdvancePayment, setIsSavingAdvancePayment] = useState(false);
  const [editingAdvanceReceipt, setEditingAdvanceReceipt] = useState<PrincipalReceipt | null>(null);
  const [advanceReceiptEditDate, setAdvanceReceiptEditDate] = useState('');
  const [advanceReceiptEditAmount, setAdvanceReceiptEditAmount] = useState('');
  const [advanceReceiptEditRemark, setAdvanceReceiptEditRemark] = useState('');
  const [advanceReceiptEditError, setAdvanceReceiptEditError] = useState('');
  const [isSavingAdvanceReceiptEdit, setIsSavingAdvanceReceiptEdit] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<string | null>(null);
  const iframePreviewRef = useRef<HTMLIFrameElement | null>(null);
  const [pdfUploadMeta, setPdfUploadMeta] = useState<{ fileName: string; dataUrl: string } | null>(
    activeJob.fda?.pdfDataUrl && activeJob.fda?.pdfFileName
      ? { fileName: activeJob.fda.pdfFileName, dataUrl: activeJob.fda.pdfDataUrl }
      : null
  );
  useEffect(() => {
    setPdfUploadMeta(
      activeJob.fda?.pdfDataUrl && activeJob.fda?.pdfFileName
        ? { fileName: activeJob.fda.pdfFileName, dataUrl: activeJob.fda.pdfDataUrl }
        : null
    );
  }, [activeJob.jobId, activeJob.fda?.pdfDataUrl, activeJob.fda?.pdfFileName]);
  const [viewCurrency, setViewCurrency] = useState<'USD' | 'IDR'>(
    activeJob.fda?.currency || activeJob.fdaItems?.[0]?.currency || activeJob.quotation?.epda?.currency || activeJob.currency || 'USD'
  );
  const [exchangeRateInput, setExchangeRateInput] = useState(() =>
    activeJob.fda?.exchangeRateUSDToIDR
      ? String(activeJob.fda.exchangeRateUSDToIDR)
      : ''
  );
  const exchangeRateRef = useRef(activeJob.fda?.exchangeRateUSDToIDR || 0);
  const [jobDateRange, setJobDateRange] = useState<InquiryDateRange>(() =>
    getLatestInquiryMonthRange(jobCalls.map((job) => job.inquiry?.date))
  );
  const [jobSearch, setJobSearch] = useState('');
  const [actualEntryMode, setActualEntryMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualItemReference, setManualItemReference] = useState<MasterItemSearchOption | null>(null);
  const [autoSelectedItemKey, setAutoSelectedItemKey] = useState('');
  const manualTypeDefaultedRef = useRef(false);
  const [manualTariffText, setManualTariffText] = useState('');
  const [actualQuantity, setActualQuantity] = useState(1);
  const [actualList, setActualList] = useState<FdaItem[]>(activeJob.fdaItems || []);
  const [fdaSchedule, setFdaSchedule] = useState(() => ({
    eta: toDateTimeInput(activeJob.fda?.eta),
    etd: toDateTimeInput(activeJob.fda?.etd),
    etaRemarks: activeJob.fda?.etaRemarks || '',
    etdRemarks: activeJob.fda?.etdRemarks || '',
  }));

  useEffect(() => {
    setAdvancePaymentDate(todayISO());
    setAdvancePaymentAmount('');
    setAdvancePaymentRemark('');
    setAdvancePaymentError('');
    setEditingAdvanceReceipt(null);
  }, [activeJob.jobId]);

  useEffect(() => {
    setFdaSchedule({
      eta: toDateTimeInput(activeJob.fda?.eta),
      etd: toDateTimeInput(activeJob.fda?.etd),
      etaRemarks: activeJob.fda?.etaRemarks || '',
      etdRemarks: activeJob.fda?.etdRemarks || '',
    });
  }, [activeJob.jobId, activeJob.fda?.eta, activeJob.fda?.etd, activeJob.fda?.etaRemarks, activeJob.fda?.etdRemarks]);

  const updateFDASchedule = (field: keyof typeof fdaSchedule, value: string) => {
    if (isFDAReadOnly) return;
    setFdaSchedule((schedule) => ({ ...schedule, [field]: value }));
    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) return;
    db.updateJob(activeJob.jobId, {
      fda: {
        ...currentJob.fda,
        [field]: value,
      },
    });
  };

  const setFDAGlobalVatApplied = (checked: boolean) => {
    if (isFDAReadOnly) return;
    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) return;
    db.updateJob(activeJob.jobId, {
      fda: { ...currentJob.fda, globalVatApplied: checked },
    });
  };

  const handleAddAdvancePayment = async () => {
    if (isFDAReadOnly || isSavingAdvancePayment) return;
    const amount = Number(advancePaymentAmount);
    if (!advancePaymentDate || !Number.isFinite(amount) || amount <= 0 || !advancePaymentRemark.trim()) {
      setAdvancePaymentError('Lengkapi tanggal, nominal, dan remark Advance Received.');
      return;
    }
    if (viewCurrency === 'IDR' && !Number.isInteger(amount)) {
      setAdvancePaymentError('Nominal IDR harus berupa angka bulat tanpa desimal.');
      return;
    }

    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) {
      setAdvancePaymentError('Data job tidak ditemukan. Penerimaan tidak disimpan.');
      return;
    }

    const receipt: PrincipalReceipt = {
      id: `RECEIPT-${activeJob.jobId}-${Date.now()}`,
      jobId: activeJob.jobId,
      receivedDate: advancePaymentDate,
      amount: viewCurrency === 'IDR' ? Math.round(amount) : Math.round((amount + Number.EPSILON) * 100) / 100,
      currency: viewCurrency,
      exchangeRateUSDToIDR: effectiveExchangeRate,
      paymentType: 'ADVANCE_PAYMENT',
      bankRemark: advancePaymentRemark.trim(),
    };

    setIsSavingAdvancePayment(true);
    setAdvancePaymentError('');
    try {
      const result = await db.updateJobAndPersist(activeJob.jobId, {
        principalReceipts: [...(currentJob.principalReceipts || []), receipt],
      });
      if (!result.saved) {
        setAdvancePaymentError(result.error
          ? `Penerimaan gagal disimpan ke database: ${result.error}. Data form tetap dipertahankan.`
          : 'Penerimaan tidak tersimpan. Periksa status FDA dan hak akses.');
        return;
      }

      setAdvancePaymentAmount('');
      setAdvancePaymentRemark('');
      setMsg('Advance Received berhasil ditambahkan.');
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setIsSavingAdvancePayment(false);
    }
  };

  const openAdvanceReceiptEdit = (receipt: PrincipalReceipt) => {
    if (isFDAReadOnly) return;
    setEditingAdvanceReceipt(receipt);
    setAdvanceReceiptEditDate(receipt.receivedDate);
    setAdvanceReceiptEditAmount(String(receipt.amount));
    setAdvanceReceiptEditRemark(receipt.bankRemark || '');
    setAdvanceReceiptEditError('');
  };

  const handleSaveAdvanceReceiptEdit = async () => {
    if (isFDAReadOnly || isSavingAdvanceReceiptEdit || !editingAdvanceReceipt) return;
    const amount = Number(advanceReceiptEditAmount);
    if (!advanceReceiptEditDate || !Number.isFinite(amount) || amount <= 0 || !advanceReceiptEditRemark.trim()) {
      setAdvanceReceiptEditError('Lengkapi tanggal, nominal, dan remark Advance Received.');
      return;
    }
    if (editingAdvanceReceipt.currency === 'IDR' && !Number.isInteger(amount)) {
      setAdvanceReceiptEditError('Nominal IDR harus berupa angka bulat tanpa desimal.');
      return;
    }

    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) {
      setAdvanceReceiptEditError('Data job tidak ditemukan. Perubahan tidak disimpan.');
      return;
    }
    const currentReceipt = (currentJob.principalReceipts || []).find((receipt) => receipt.id === editingAdvanceReceipt.id);
    if (!currentReceipt || currentReceipt.paymentType !== 'ADVANCE_PAYMENT') {
      setAdvanceReceiptEditError('Data Advance Received tidak ditemukan. Perubahan tidak disimpan.');
      return;
    }

    setIsSavingAdvanceReceiptEdit(true);
    setAdvanceReceiptEditError('');
    try {
      const result = await db.updateJobAndPersist(activeJob.jobId, {
        principalReceipts: (currentJob.principalReceipts || []).map((receipt) => receipt.id === currentReceipt.id
          ? {
            ...currentReceipt,
            receivedDate: advanceReceiptEditDate,
            amount: currentReceipt.currency === 'IDR'
              ? Math.round(amount)
              : Math.round((amount + Number.EPSILON) * 100) / 100,
            bankRemark: advanceReceiptEditRemark.trim(),
          }
          : receipt),
      });
      if (!result.saved) {
        setAdvanceReceiptEditError(result.error
          ? `Perubahan gagal disimpan ke database: ${result.error}. Data form tetap dipertahankan.`
          : 'Perubahan tidak tersimpan. Periksa status FDA dan hak akses.');
        return;
      }

      setEditingAdvanceReceipt(null);
      setMsg('Advance Received berhasil diperbarui.');
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setIsSavingAdvanceReceiptEdit(false);
    }
  };

  const handleDeleteAdvanceReceipt = async () => {
    if (isFDAReadOnly || isSavingAdvanceReceiptEdit || !editingAdvanceReceipt) return;
    if (!window.confirm('Hapus data Advance Received ini?')) return;

    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) {
      setAdvanceReceiptEditError('Data job tidak ditemukan. Data tidak dihapus.');
      return;
    }
    const receiptExists = (currentJob.principalReceipts || []).some(
      (receipt) => receipt.id === editingAdvanceReceipt.id && receipt.paymentType === 'ADVANCE_PAYMENT',
    );
    if (!receiptExists) {
      setAdvanceReceiptEditError('Data Advance Received tidak ditemukan. Data tidak dihapus.');
      return;
    }

    setIsSavingAdvanceReceiptEdit(true);
    setAdvanceReceiptEditError('');
    try {
      const result = await db.updateJobAndPersist(activeJob.jobId, {
        principalReceipts: (currentJob.principalReceipts || []).filter(
          (receipt) => receipt.id !== editingAdvanceReceipt.id,
        ),
      });
      if (!result.saved) {
        setAdvanceReceiptEditError(result.error
          ? `Data gagal dihapus dari database: ${result.error}.`
          : 'Data tidak terhapus. Periksa status FDA dan hak akses.');
        return;
      }

      setEditingAdvanceReceipt(null);
      setMsg('Advance Received berhasil dihapus.');
      setTimeout(() => setMsg(null), 3500);
    } finally {
      setIsSavingAdvanceReceiptEdit(false);
    }
  };

  useEffect(() => {
    const latestActualCosts = activeJob.fdaItems || [];
    setActualList((previous) => {
      const hasLocalEntries = previous.length > 0 && previous.some((item) => item.jobId === activeJob.jobId);
      const dbIsTemporarilyEmpty = latestActualCosts.length === 0 && hasLocalEntries;

      if (dbIsTemporarilyEmpty) {
        return previous;
      }

      const hasSameSnapshot = previous.length === latestActualCosts.length
        && previous.every((item, index) => {
          const next = latestActualCosts[index];
          return !!next && item.id === next.id && item.amount === next.amount && item.description === next.description && item.currency === next.currency;
        });
      return hasSameSnapshot ? previous : latestActualCosts;
    });
  }, [activeJob.jobId, activeJob.fdaItems]);

  const handleViewCurrencyChange = (currency: 'USD' | 'IDR') => {
    if (isFDAReadOnly) return;
    setViewCurrency(currency);
    db.updateJob(activeJob.jobId, { fda: { ...activeJob.fda, currency } });
    if (actualEntryMode !== 'AUTO') return;
    const selected = buildAutoServiceOptions(currency).find((option) => option.name === newActual.description && option.category === newActual.category);
    setNewActual((current) => selected
      ? { ...current, rate: selected.rate, minCharge: selected.minCharge }
      : { ...current, description: '', rate: 0, minCharge: 0 });
  };

  const setFDAFormPph23Applied = (checked: boolean) => {
    if (isFDAReadOnly) return;
    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) return;
    db.updateJob(activeJob.jobId, {
      fda: { ...currentJob.fda, pph23Applied: checked },
    });
  };

  useEffect(() => {
    setViewCurrency(activeJob.fda?.currency || activeJob.fdaItems?.[0]?.currency || activeJob.quotation?.epda?.currency || activeJob.currency || 'USD');
  }, [activeJob.jobId, activeJob.fda?.currency, activeJob.fdaItems, activeJob.quotation?.epda?.currency, activeJob.currency]);

  useEffect(() => {
    const savedRate = activeJob.fda?.exchangeRateUSDToIDR;
    exchangeRateRef.current = savedRate || 0;
    setExchangeRateInput(savedRate ? String(savedRate) : '');
  }, [activeJob.jobId]);

  const effectiveExchangeRate = Number(exchangeRateInput) > 0
    ? Number(exchangeRateInput)
    : activeJob.fda?.exchangeRateUSDToIDR || activeJob.exchangeRateUSDToIDR || 15800;

  // Form states for adding actual cost
  const [newActual, setNewActual] = useState({
    description: '',
    category: 'PORT_EXPENSES',
    vendorName: '',
    vendorInvoiceNo: '',
    amountBuy: 0,
    amountSellBilled: 0,
    notes: '',
    attachmentName: '',
    calculationBasis: 'PER_GRT' as CalculationBasis,
    tariffType: 'VARIABLE' as 'FIXED' | 'VARIABLE' | 'QTY_CARGO',
    rate: 0,
    minCharge: 0,
    vatApplied: false,
  });



  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const formatVesselDate = (value?: string, includeTime = false) => {
    if (!value) return '-';
    const [datePart, timePart] = value.split(/[T ]/);
    const [year, month, day] = (datePart || '').split('-');
    if (!(year && month && day)) return value;
    const formattedDate = `${day}-${month}-${year}`;
    if (!includeTime || !timePart) return formattedDate;
    const [hour, minute] = timePart.split(':');
    return `${formattedDate} ${hour || '00'}:${minute || '00'}`;
  };
  const getFDAScheduleDisplay = (dateTime: string, remarks: string) =>
    dateTime ? formatVesselDate(dateTime, true) : remarks.trim() || '-';

  const formatAccountingNumber = (value: number, _currency: 'USD' | 'IDR') => {
    const normalized = Number(value || 0);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(normalized);
  };

  const formatRateAmount = (value: number) =>
    new Intl.NumberFormat('en-US', { useGrouping: true, maximumFractionDigits: 8 }).format(value);

  const formatTariffInput = (value: number) => value > 0
    ? new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    : '';

  const parseTariffInput = (value: string) => {
    return parseTariffNumber(value);
  };

  const fdaEpdaDisplayNo = activeJob.quotation?.epda?.quoteNo || `EPDA-${activeJob.jobId}`;
  const vesselMaster = vessels.find((vessel) => vessel.id === activeJob.vesselId);
  const rateForCurrency = (currency: 'IDR' | 'USD', rateIDR: number | undefined, rateUSD: number | undefined, legacyRate: number, legacyCurrency?: 'IDR' | 'USD') => {
    return getTariffRateForCurrency(currency, rateIDR, rateUSD, legacyRate, legacyCurrency);
  };
  const portMatches = (portId?: string, portName?: string) => {
    const currentPortId = (activeJob.portId || activeJob.inquiry?.portId || '').trim();
    const currentPortName = (activeJob.portName || activeJob.inquiry?.portName || '').trim();
    const targetPortId = portId?.trim();
    const targetPortName = portName?.trim();

    return (!!currentPortId && !!targetPortId && currentPortId === targetPortId)
      || (!!currentPortName && !!targetPortName && currentPortName.toLowerCase() === targetPortName.toLowerCase());
  };
  const buildAutoServiceOptions = (currency: Currency) => {
    const portFixTariffs = fixTariffs.filter((tariff) => portMatches(tariff.portId, tariff.portName));
    const currentCurrencyFixTariffs = portFixTariffs.filter((tariff) =>
      rateForCurrency(currency, tariff.rateIDR, tariff.rateUSD, 0) > 0
    );
    const applicableFixTariffs = filterTariffsByGRT(
      currentCurrencyFixTariffs
        .map((tariff) => ({ ...tariff, name: tariff.serviceName, category: tariff.costCategory || 'PORT_EXPENSES' })),
      vesselMaster?.grt,
    );

    const options = selectPreferredTariffOptions([
    ...applicableFixTariffs
      .map((tariff) => ({
        name: tariff.serviceName,
        category: tariff.costCategory || 'PORT_EXPENSES',
        tariffType: tariff.tariffType || (tariff.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE'),
        calculationBasis: tariff.calculationBasis === 'LUMP_SUM' && tariff.tariffType === 'VARIABLE'
          ? 'PER_GRT'
          : tariff.calculationBasis,
        rate: rateForCurrency(currency, tariff.rateIDR, tariff.rateUSD, 0),
        rateIDR: tariff.rateIDR,
        rateUSD: tariff.rateUSD,
        minCharge: 0,
        currency,
        source: 'FIX_TARIFF' as const,
        grtMin: tariff.grtMin,
        grtMax: tariff.grtMax,
      })),
    ...expensesItems
      .filter((item) =>
        portMatches(item.portId, item.portName)
        && rateForCurrency(currency, item.rateIDR, item.rateUSD, 0) > 0
      )
      .map((item) => ({
        name: item.name,
        category: item.category,
        calculationBasis: 'PER_GRT' as CalculationBasis,
        tariffType: item.calculationType === 'FIXED'
          ? 'FIXED'
          : item.calculationType === 'QTY_CARGO'
            ? 'QTY_CARGO'
            : 'VARIABLE',
        rate: rateForCurrency(currency, item.rateIDR, item.rateUSD, 0),
        rateIDR: item.rateIDR,
        rateUSD: item.rateUSD,
        legacyRate: 0,
        minCharge: 0,
        currency,
        source: 'EXPENSES_ITEM' as const,
      })),
          ]);
    return options.sort((a, b) =>
      (getCostCategoryRank(a.category) - getCostCategoryRank(b.category))
      || a.name.localeCompare(b.name)
    );
        };
  const autoServiceOptions = buildAutoServiceOptions(viewCurrency);
  const masterItemSearchOptions = createMasterItemSearchOptions(
    fixTariffs,
    expensesItems,
    new Set(autoServiceOptions.map((option) => JSON.stringify([option.name, option.category]))),
  );

  const autoServiceOptionKey = (name: string, category: string) => JSON.stringify([name, category]);
  const keepIncompatibleItemAsReference = (option: MasterItemSearchOption) => {
    setManualItemReference(option);
    setAutoSelectedItemKey('');
    setNewActual((current) => ({ ...current, description: '', rate: 0, minCharge: 0 }));
  };
  const applySelectedAutoService = (selectedKey: string) => {
    const selected = autoServiceOptions.find((option) => autoServiceOptionKey(option.name, option.category) === selectedKey);
    if (!selected) {
      setAutoSelectedItemKey('');
      setNewActual({ ...newActual, description: '', rate: 0, minCharge: 0 });
      return;
    }

    setAutoSelectedItemKey(selectedKey);
    setManualItemReference(null);
    setNewActual({
      ...newActual,
      description: selected.name,
      category: selected.category,
      calculationBasis: selected.tariffType === 'FIXED' ? 'LUMP_SUM' : selected.calculationBasis,
      tariffType: selected.tariffType,
      rate: selected.rate,
      minCharge: selected.minCharge,
    });
  };
  const filteredJobList = jobCalls.filter((j) => {
    const matchesMonth = isInquiryDateInRange(j.inquiry?.date, jobDateRange.from, jobDateRange.to);
    const searchText = jobSearch.trim().toLowerCase();
    const haystack = [j.jobId, j.vesselName, j.customerName, j.portName, j.inquiry?.inquiryNo || '', j.inquiry?.createdBy || '']
      .join(' ')
      .toLowerCase();
    const matchesSearch = !searchText || haystack.includes(searchText);

    return matchesMonth && matchesSearch;
  }).sort((first, second) => second.jobId.localeCompare(first.jobId, undefined, { numeric: true }));

  const epdaItems = activeJob.quotation?.epda?.items || [];
  const normalizeActualCategory = (category?: string) => normalizeCostCategory(category ?? '');
  const getActualCategory = (item: FdaItem) => {
    const itemName = item.description.trim().toLowerCase();
    const epdaItem = activeJob.quotation?.epda?.items?.find(
      (entry) => entry.name.trim().toLowerCase() === itemName
    );
    const category = normalizeActualCategory(item.category);
    if (category) return category;

    if (epdaItem?.category) return normalizeActualCategory(epdaItem.category);

    const matchingTariff = fixTariffs.find((tariff) =>
      tariff.serviceName.trim().toLowerCase() === itemName
      && (tariff.costCategory || '').trim().toUpperCase() === 'PORT_SERVICE'
      && portMatches(tariff.portId, tariff.portName)
      && tariff.costCategory
    );
    if (matchingTariff?.costCategory) return normalizeActualCategory(matchingTariff.costCategory);

    const matchingExpense = expensesItems.find((expense) =>
      expense.name.trim().toLowerCase() === itemName
      && portMatches(expense.portId, expense.portName)
    );
    return matchingExpense?.category ? normalizeActualCategory(matchingExpense.category) : 'UNCATEGORIZED';
  };
  const getActualTariff = (item: FdaItem) => {
    if (item.tariffDescription !== undefined) return item.tariffDescription;
    const serviceDescription = describeTariffService(item.description);
    const itemCurrency = item.currency || viewCurrency;
    const epdaItem = activeJob.quotation?.epda?.items?.find(
      (entry) => entry.name.trim().toLowerCase() === item.description.trim().toLowerCase()
    );
    const masterOption = buildAutoServiceOptions(itemCurrency).find((option) =>
      option.name.trim().toLowerCase() === item.description.trim().toLowerCase()
      && option.category === item.category
    );
    if (!serviceDescription && item.tariffType !== 'QTY_CARGO' && masterOption?.tariffType !== 'QTY_CARGO') return '';
    return describeTariffFormula({
      description: item.description,
      category: item.category,
      basis: item.calculationBasis || masterOption?.calculationBasis,
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : (Number(epdaItem?.quantity) > 0 ? Number(epdaItem.quantity) : 1),
      cargoQuantity: Number(activeJob.inquiry?.cargoQuantity || 0),
      absoluteValue: vesselMaster?.grt,
      rate: item.tariffRate ?? epdaItem?.tariffRate ?? masterOption?.rate ?? epdaItem?.unitBuyRate ?? (item.quantity ? item.amount / item.quantity : item.amount),
      tariffType: item.tariffType || epdaItem?.tariffType || masterOption?.tariffType,
    });
  };
  const findFDAItemForEPDAItem = (item: DisbursementItem) => actualList.find((actual) =>
    actual.itemCode === `EPDA:${item.id}`
  ) || actualList.find((actual) =>
    actual.description.trim().toLowerCase() === item.name.trim().toLowerCase()
    && actual.estimatedAmount === item.amount
  );
  const getEPDAItemTariff = (item: DisbursementItem) => {
    const serviceDescription = describeTariffService(item.name);
    if (!serviceDescription && item.tariffType !== 'QTY_CARGO') return '';
    return describeTariffFormula({
      description: item.name,
      category: item.category,
      basis: item.calculationBasis || item.basis,
      quantity: item.quantity || 1,
      cargoQuantity: Number(activeJob.inquiry?.cargoQuantity || 0),
      absoluteValue: vesselMaster?.grt,
      rate: item.tariffRate ?? (item.quantity ? item.amount / item.quantity : item.amount),
      tariffType: item.tariffType,
    });
  };
  const fdaResultRows = epdaItems.map((item) => {
    const actualItem = findFDAItemForEPDAItem(item);
    return {
      id: actualItem?.id || item.id,
      sourceItemId: item.id,
      category: normalizeCostCategory(item.category),
      description: actualItem?.description || item.name,
      amount: Number(actualItem?.amount ?? item.amount) || 0,
      currency: item.currency || viewCurrency,
      tariff: actualItem?.tariffDescription ?? getEPDAItemTariff(item),
      remarks: actualItem ? actualItem.remarks || '' : item.remarks || '',
      vatApplied: item.vatApplied ?? false,
      pph23Applied: item.pph23Applied ?? false,
    };
  });
  const totalEPDAAmount = Math.round((fdaResultRows.reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
  const sortFDACategories = (categories: string[]) => [...categories].sort((a, b) => {
    const rankDifference = getCostCategoryRank(a) - getCostCategoryRank(b);
    return rankDifference || a.localeCompare(b);
  });
  const orderedFDAResultRows = [...fdaResultRows];
  const fdaResultCategories = sortFDACategories(Array.from(new Set<string>(orderedFDAResultRows.map((item) => normalizeCostCategory(item.category)))));
  const fdaSubTotalLabel = fdaResultCategories.length
    ? 'TOTAL AMOUNT'
    : 'TOTAL';
  const globalVatApplied = activeJob.fda?.globalVatApplied ?? false;
  const formatCategoryCost = (category: string) => formatCostCategoryLabel(category);
  const categoryVatAmount = (categoryItems: typeof fdaResultRows) => {
    if (globalVatApplied) return 0;
    const taxableAmount = categoryItems.reduce((sum, item) =>
      sum + (item.vatApplied ? item.amount : 0), 0);
    return Math.round((taxableAmount * 0.11 + Number.EPSILON) * 100) / 100;
  };
  const totalEPDAWithVat = fdaResultCategories.reduce((total, category) => {
    const categoryItems = orderedFDAResultRows.filter((item) => item.category === category);
    return total + Math.round((categoryItems.reduce((sum, item) => sum + item.amount, 0) + categoryVatAmount(categoryItems) + Number.EPSILON) * 100) / 100;
  }, 0);
  const roundedTotalEPDAWithVat = Math.round((totalEPDAWithVat + Number.EPSILON) * 100) / 100;
  const epdaVatAmount = Math.round((roundedTotalEPDAWithVat - totalEPDAAmount + Number.EPSILON) * 100) / 100;
  const pph23Applied = activeJob.fda?.pph23Applied ?? orderedFDAResultRows.some((item) => item.pph23Applied);
  const totalQuotedEPDA = activeJob.quotation?.epda?.totalAmount || 0;
  const categoryPph23Amount = (categoryItems: typeof fdaResultRows) => {
    if (!pph23Applied || !categoryItems.some((item) => item.vatApplied)) return 0;
    const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);
    return Math.round((categoryTotal * 0.02 + Number.EPSILON) * 100) / 100;
  };
  const pph23Amount = fdaResultCategories.reduce((total, category) => {
    const categoryItems = orderedFDAResultRows.filter((item) => item.category === category);
    return total + categoryPph23Amount(categoryItems);
  }, 0);
  const totalEPDAAfterPph23 = Math.round((roundedTotalEPDAWithVat - pph23Amount + Number.EPSILON) * 100) / 100;
  const globalVatBaseAmount = fdaResultRows.length > 0 ? totalEPDAAmount : totalQuotedEPDA;
  const globalVatAmount = globalVatApplied
    ? Math.round((globalVatBaseAmount * 0.11 + Number.EPSILON) * 100) / 100
    : 0;
  const totalEPDAAfterGlobalVat = Math.round(((fdaResultRows.length > 0 ? totalEPDAAfterPph23 : totalQuotedEPDA - pph23Amount) + globalVatAmount + Number.EPSILON) * 100) / 100;
  const totalEPDASubtotal = Math.round(((fdaResultRows.length > 0 ? roundedTotalEPDAWithVat : totalQuotedEPDA) + Number.EPSILON) * 100) / 100;
  const fdaGrandTotal = globalVatApplied ? totalEPDAAfterGlobalVat : totalEPDAAfterPph23;
  const convertReceiptCurrency = (amount: number, from: Currency, to: Currency, exchangeRate = effectiveExchangeRate) => {
    if (from === to) return amount;
    return from === 'USD' ? amount * exchangeRate : amount / exchangeRate;
  };
  const principalReceipts = activeJob.principalReceipts || [];
  const advancePaymentHistory = principalReceipts
    .filter((receipt) => receipt.paymentType === 'ADVANCE_PAYMENT' && !receipt.id.startsWith('FIN-AR-'))
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
  const advanceReceived = advancePaymentHistory
    .reduce((total, receipt) => {
      const receiptCurrency = receipt.currency || activeJob.currency || 'IDR';
      const receiptRate = receipt.exchangeRateUSDToIDR || effectiveExchangeRate;
      const received = convertReceiptCurrency(Number(receipt.amount || 0), receiptCurrency, viewCurrency, receiptRate);
      const refunded = receipt.refundStatus === 'PAID'
        ? convertReceiptCurrency(
            Number(receipt.refundAmount || 0),
            receiptCurrency,
            viewCurrency,
            receipt.refundExchangeRateUSDToIDR || receiptRate,
          )
        : 0;
      return total + received - refunded;
    }, 0) + financeReceivableEntries.filter((entry) => entry.invoiceType === 'FDA').reduce((total, entry) => total
      + convertReceiptCurrency(Number(entry.idrAmount || 0), 'IDR', viewCurrency)
      + convertReceiptCurrency(
        Number(entry.usdAmount || 0),
        'USD',
        viewCurrency,
        Number(entry.exchangeRateUSDToIDR) || effectiveExchangeRate,
      ), 0);
  const fdaAmountDue = activeJob.fda?.finalBilledToPrincipal
    ? convertReceiptCurrency(
      activeJob.fda.finalBilledToPrincipal,
      activeJob.fda.currency || viewCurrency,
      viewCurrency,
    )
    : totalEPDAAfterGlobalVat;
  const balanceDue = Math.max(0, fdaAmountDue - advanceReceived);
  const totalEPDAReady = jobCalls.filter((job) => job.managerApproval?.status === 'APPROVED').length;
  const totalPendingFDA = jobCalls.filter(
    (job) => job.managerApproval?.status === 'APPROVED' && job.currentStage !== 'CLOSED' && !(job.fda?.fdaApproved)
  ).length;
  const totalFinish = jobCalls.filter(
    (job) => job.currentStage === 'CLOSED' || job.fda?.fdaApproved || job.status === 'CLOSED'
  ).length;
  const normalizeGrandTotalToIDR = (job: JobCall) => {
    const currency = (job.fda?.currency || job.quotation?.epda?.currency || job.currency || 'IDR') as 'USD' | 'IDR';
    const exchangeRate = Number(job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800);
    const grandTotal = job.fda?.finalBilledToPrincipal
      ?? job.principalInvoice?.totalAmountUSD
      ?? job.principalInvoice?.totalAmountIDR
      ?? job.quotation?.epda?.totalAmount
      ?? 0;

    return currency === 'USD' ? grandTotal * exchangeRate : grandTotal;
  };
  const handleExchangeRateChange = (nextValue: string) => {
    if (isFDAReadOnly) return;
    setExchangeRateInput(nextValue);
    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    exchangeRateRef.current = numericValue;
    const currentJob = db.getJob(activeJob.jobId);
    if (!currentJob) return;
    db.updateJob(activeJob.jobId, {
      fda: { ...currentJob.fda, exchangeRateUSDToIDR: numericValue },
    });
  };
  const visibleJobIds = new Set(jobCalls.map((job) => job.jobId));
  const approvedFpdaTotalIDR = approvedFpdaTotals.reduce((sum, fpda) => {
    if (!visibleJobIds.has(fpda.jobId)) return sum;
    const normalizedTotal = fpda.currency === 'USD'
      ? Math.round((fpda.total + Number.EPSILON) * 100) / 100
      : fpda.total;
    return sum + (fpda.currency === 'USD' ? normalizedTotal * fpda.exchangeRate : normalizedTotal);
  }, 0);
  const totalCost = jobCalls.reduce((sum, job) => sum + normalizeGrandTotalToIDR(job), 0) + approvedFpdaTotalIDR;
  const approvedJobs = jobCalls.filter((job) => job.managerApproval?.status === 'APPROVED');
  const actualQuantityValue = Number(actualQuantity) || 1;
  const actualTariff = Number(newActual.amountBuy) || 0;
  const currentTariffType = newActual.tariffType || (newActual.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
  const autoTariffPreview = calculateTariffForJob({
    vesselGRT: vesselMaster?.grt || 0,
    cargoQuantity: Number(activeJob.inquiry?.cargoQuantity || 0),
    estimatedDays: Number(activeJob.inquiry?.estimatedDays || 0),
    hours: 1,
    moveCount: 1,
    rate: Number(newActual.rate) || 0,
    minCharge: Number(newActual.minCharge) || 0,
    calculationBasis: newActual.calculationBasis || 'PER_GRT',
    tariffType: currentTariffType,
  });
  const manualTariffPreview = calculateTariffForJob({
    vesselGRT: vesselMaster?.grt || 0,
    cargoQuantity: Number(activeJob.inquiry?.cargoQuantity || 0),
    estimatedDays: Number(activeJob.inquiry?.estimatedDays || 0),
    hours: 1,
    moveCount: 1,
    rate: actualTariff,
    minCharge: Number(newActual.minCharge) || 0,
    calculationBasis: newActual.calculationBasis || 'PER_GRT',
    tariffType: currentTariffType,
  });
  const actualAmount = actualQuantityValue * (actualEntryMode === 'AUTO' ? autoTariffPreview : manualTariffPreview);

  const handleQuickAddMasterData = async () => {
    const itemName = (newActual.description || '').trim();
    const rateValue = Number(newActual.amountBuy) || Number(newActual.rate) || 0;
    if (isFDAReadOnly || !itemName || rateValue <= 0) {
      window.alert('Isi nama item service dan tarif sebelum menambah data master.');
      return;
    }

    const portId = (activeJob.portId || activeJob.inquiry?.portId || '').trim();
    const portName = (activeJob.portName || activeJob.inquiry?.portName || '').trim();
    const isTariffCategory = newActual.category === 'PORT_SERVICE';

    const vesselGRT = Number(vesselMaster?.grt) || 0;
    const vesselDWT = Number(vesselMaster?.dwt) || 0;

    if (isTariffCategory) {
      const tariffPayload = {
        portId,
        portName,
        costCategory: newActual.category,
        serviceName: itemName,
        grtMin: vesselGRT || undefined,
        grtMax: vesselGRT || undefined,
        dwt: vesselDWT || undefined,
        calculationBasis: newActual.calculationBasis || 'LUMP_SUM',
        tariffType: newActual.tariffType || 'FIXED',
        rateIDR: viewCurrency === 'IDR' ? rateValue : 0,
        rateUSD: viewCurrency === 'USD' ? rateValue : 0,
        remarks: newActual.notes || '',
      };
      const existing = findMatchingFixTariff(fixTariffs, tariffPayload);
      if (existing) {
        window.alert('Data master untuk item ini sudah ada. Perubahan tarif hanya dapat dilakukan oleh administrator. Item manual FDA tetap bisa ditambahkan dengan tombol TAMBAH ITEM.');
        return;
      } else {
        await db.addFixTariff(tariffPayload);
      }
    } else {
      const expensePayload = {
        portId: portId || undefined,
        portName: portName || undefined,
        code: `FDA-${Date.now().toString().slice(-6)}`,
        category: newActual.category as ExpensesItem['category'],
        name: itemName,
        rateIDR: viewCurrency === 'IDR' ? rateValue : 0,
        rateUSD: viewCurrency === 'USD' ? rateValue : 0,
        calculationType: newActual.tariffType || 'FIXED',
      };
      const existing = findMatchingExpensesItem(expensesItems, expensePayload);
      if (existing) {
        window.alert('Data master untuk item ini sudah ada. Perubahan tarif hanya dapat dilakukan oleh administrator. Item manual FDA tetap bisa ditambahkan dengan tombol TAMBAH ITEM.');
        return;
      } else {
        await db.addExpensesItem(expensePayload);
      }
    }

    window.alert('Rate master data berhasil diperbarui atau item baru berhasil ditambahkan.');
  };

  const handleAddActualCost = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isFDAReadOnly) return;
    if (actualEntryMode === 'AUTO' && !autoSelectedItemKey) {
      setMsg('Pilih item master yang sesuai, atau gunakan mode Manual.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    if (activeJob.managerApproval?.status !== 'APPROVED') {
      setMsg('Actual Cost belum dapat diinput. Tunggu Manager Approval.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }

    const quantity = Number(actualQuantity) || 1;
    const autoTariffValue = calculateTariffForJob({
      vesselGRT: vesselMaster?.grt || 0,
      cargoQuantity: Number(activeJob.inquiry?.cargoQuantity || 0),
      estimatedDays: Number(activeJob.inquiry?.estimatedDays || 0),
      hours: 1,
      moveCount: 1,
      rate: Number(newActual.rate) || 0,
      minCharge: Number(newActual.minCharge) || 0,
      calculationBasis: newActual.calculationBasis || 'PER_GRT',
      tariffType: currentTariffType,
    });
    const tariff = actualEntryMode === 'AUTO' ? autoTariffValue : manualTariffPreview;
    const calculatedAmount = quantity * tariff;

    const normalizedDescription = newActual.description || {
      PORT_EXPENSES: 'Port Expenses',
      OWNER_MATTER: 'Owner Matter',
      AGENCY_FEE: 'Agency Fee',
    }[newActual.category] || 'Biaya FDA';
    const quotedReferenceValue = 0;

    if (editingActualId) {
      const updated = actualList.map(it => it.id === editingActualId ? {
        ...it, description: normalizedDescription, category: newActual.category, vendorName: newActual.vendorName || 'Vendor / Pelindo',
        invoiceOrVoucherNo: newActual.vendorInvoiceNo || `AUTO-${Date.now()}`, quantity: quantity,
        amount: calculatedAmount, estimatedAmount: quotedReferenceValue,
        varianceAmount: calculatedAmount - quotedReferenceValue, remarks: newActual.notes, tariffType: currentTariffType, calculationBasis: newActual.calculationBasis, tariffRate: actualEntryMode === 'AUTO' ? Number(newActual.rate) || 0 : actualTariff,
        vatApplied: newActual.vatApplied,
        attachmentName: newActual.attachmentName || it.attachmentName, status: 'APPROVED_BY_FDA' as const,
      } : it);
      setActualList(updated);
      db.updateJob(activeJob.jobId, { fdaItems: updated, currentStage: 'FDA' });
      setMsg('Actual Cost diperbarui.');
    } else {
      const item: FdaItem = {
        id: `ACT-${Date.now()}`, jobId: activeJob.jobId, itemCode: `EXP-${Math.floor(100 + Math.random() * 900)}`,
        description: normalizedDescription, category: newActual.category, vendorName: newActual.vendorName || 'Vendor / Pelindo',
        invoiceOrVoucherNo: newActual.vendorInvoiceNo || `AUTO-${Date.now()}`, date: todayISO(), quantity,
        amount: calculatedAmount, currency: viewCurrency, estimatedAmount: quotedReferenceValue,
        varianceAmount: calculatedAmount - quotedReferenceValue, remarks: newActual.notes, tariffType: currentTariffType, calculationBasis: newActual.calculationBasis, tariffRate: actualEntryMode === 'AUTO' ? Number(newActual.rate) || 0 : actualTariff,
        vatApplied: newActual.vatApplied,
        status: 'APPROVED_BY_FDA', attachmentName: newActual.attachmentName || undefined,
      };
      const next = [...actualList, item];
      setActualList(next);
      db.updateJob(activeJob.jobId, { fdaItems: next, currentStage: 'FDA' });
      setMsg('Actual Cost berhasil dicatat.');
    }

    setShowAddActualModal(false);
    setEditingActualId(null);
    setManualTariffText('');
    setNewActual({ description: '', category: 'PORT_EXPENSES', vendorName: '', vendorInvoiceNo: '', amountBuy: 0, amountSellBilled: 0, notes: '', attachmentName: '', calculationBasis: 'PER_GRT', tariffType: 'FIXED', rate: 0, minCharge: 0, vatApplied: false });
    setActualQuantity(1);
    manualTypeDefaultedRef.current = false;
    setAutoSelectedItemKey('');
    setManualItemReference(null);
    setTimeout(() => setMsg(null), 3000);
  };

  const openEditActual = (it: FdaItem) => {
    if (isFDAReadOnly || activeJob.managerApproval?.status !== 'APPROVED') return;
    const quantity = Number(it.quantity) || 1;
    const calculationBasis = it.calculationBasis || 'PER_GRT';
    const tariffType = it.tariffType || (calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
    const amountDivisor = quantity * (tariffType === 'FIXED' ? 1 : (vesselMaster?.grt || 1));
    const tariff = Number(it.tariffRate) || Number(it.amount || 0) / amountDivisor;
    setEditingActualId(it.id);
    setActualEntryMode('MANUAL');
    manualTypeDefaultedRef.current = true;
    setActualQuantity(quantity);
    setManualTariffText(formatTariffInput(tariff));
    setNewActual({
      description: it.description,
      category: it.category,
      vendorName: it.vendorName,
      vendorInvoiceNo: it.invoiceOrVoucherNo,
      amountBuy: tariff,
      amountSellBilled: it.estimatedAmount,
      notes: it.remarks || '',
      attachmentName: it.attachmentName || '',
      calculationBasis,
      tariffType,
      rate: tariff,
      minCharge: 0,
      vatApplied: it.vatApplied ?? false,
    });
    setShowAddActualModal(true);
  };

  const updateActualRemark = (actualId: string, remarks: string) => {
    if (isFDAReadOnly) return;
    const updated = actualList.map((item) =>
      item.id === actualId ? { ...item, remarks } : item
    );
    setActualList(updated);
    db.updateJob(activeJob.jobId, { fdaItems: updated, currentStage: 'FDA' });
  };

  const deleteActualCost = (actualId: string) => {
    if (isFDAReadOnly) return;
    const updated = actualList.filter((item) => item.id !== actualId);
    setActualList(updated);
    db.updateJob(activeJob.jobId, {
      fdaItems: updated,
      currentStage: 'FDA',
    });
  };

  const startEditResultAmount = (item: typeof fdaResultRows[number]) => {
    if (isFDAReadOnly || activeJob.managerApproval?.status !== 'APPROVED') return;
    setEditingResultAmountId(item.id);
    const sourceItem = epdaItems.find((source) => source.id === item.sourceItemId);
    const actualItem = sourceItem ? findFDAItemForEPDAItem(sourceItem) : undefined;
    setResultAmountDraft({
      description: item.description,
      tariff: actualItem?.tariffDescription ?? item.tariff,
      amount: String(item.amount),
      remarks: actualItem?.remarks || '',
    });
  };

  const getTariffQuantity = (tariff: string) => {
    const match = /[x×]\s*([\d,]+(?:\.\d+)?)\s*(?:[A-Za-z][A-Za-z/ -]*)?\s*$/i.exec(tariff);
    return match ? parseTariffNumber(match[1], Number.NaN) : Number.NaN;
  };

  const updateResultTariffDraft = (item: typeof fdaResultRows[number], tariff: string) => {
    const sourceItem = epdaItems.find((source) => source.id === item.sourceItemId);
    const originalQuantity = sourceItem ? getTariffQuantity(getEPDAItemTariff(sourceItem)) : Number.NaN;
    const updatedQuantity = getTariffQuantity(tariff);
    if (!Number.isFinite(originalQuantity) || originalQuantity <= 0
      || !Number.isFinite(updatedQuantity) || updatedQuantity < 0) {
      setResultAmountDraft((draft) => ({ ...draft, tariff }));
      return;
    }
    const sourceAmount = sourceItem ? Number(sourceItem.amount) : Number.NaN;
    if (!Number.isFinite(sourceAmount)) {
      setResultAmountDraft((draft) => ({ ...draft, tariff }));
      return;
    }
    const amount = Math.round((sourceAmount / originalQuantity * updatedQuantity + Number.EPSILON) * 100) / 100;
    setResultAmountDraft((draft) => ({ ...draft, tariff, amount: amount.toFixed(2) }));
  };

  const saveResultAmount = (item: typeof fdaResultRows[number]) => {
    if (isFDAReadOnly || activeJob.managerApproval?.status !== 'APPROVED') return;
    const amount = parseTariffNumber(resultAmountDraft.amount, Number.NaN);
    if (!resultAmountDraft.description.trim() || !Number.isFinite(amount) || amount < 0) {
      setMsg('Description wajib diisi dan Amount harus berupa angka nol atau lebih.');
      setTimeout(() => setMsg(null), 3500);
      return;
    }
    const sourceItem = epdaItems.find((source) => source.id === item.sourceItemId);
    if (!sourceItem) {
      setMsg('Item EPDA sumber tidak ditemukan. Perubahan FDA tidak disimpan.');
      setTimeout(() => setMsg(null), 3500);
      return;
    }
    const existing = findFDAItemForEPDAItem(sourceItem);
    const estimatedAmount = existing?.estimatedAmount ?? sourceItem.amount;
    const updatedItem: FdaItem = {
      id: existing?.id || `ACT-EPDA-${Date.now()}-${sourceItem.id}`,
      jobId: activeJob.jobId,
      itemCode: `EPDA:${sourceItem.id}`,
      description: resultAmountDraft.description.trim(),
      category: existing?.category || sourceItem.category,
      vendorName: existing?.vendorName || '',
      invoiceOrVoucherNo: existing?.invoiceOrVoucherNo || '',
      date: existing?.date || todayISO(),
      quantity: existing?.quantity ?? sourceItem.quantity,
      amount,
      currency: existing?.currency || sourceItem.currency,
      tariffType: existing?.tariffType || sourceItem.tariffType,
      estimatedAmount,
      calculationBasis: existing?.calculationBasis || sourceItem.calculationBasis,
      tariffRate: existing?.tariffRate ?? sourceItem.tariffRate,
      tariffDescription: resultAmountDraft.tariff.trim(),
      varianceAmount: amount - estimatedAmount,
      status: existing?.status || 'APPROVED_BY_FDA',
      attachmentName: existing?.attachmentName,
      attachmentDataUrl: existing?.attachmentDataUrl,
      remarks: resultAmountDraft.remarks,
      vatApplied: sourceItem.vatApplied ?? false,
      pph23Applied: sourceItem.pph23Applied ?? false,
    };
    const updated = existing
      ? actualList.map((actual) => actual.id === existing.id ? updatedItem : actual)
      : [...actualList, updatedItem];
    setActualList(updated);
    db.updateJob(activeJob.jobId, { fdaItems: updated, currentStage: 'FDA' });
    setEditingResultAmountId(null);
    setResultAmountDraft({ description: '', tariff: '', amount: '', remarks: '' });
  };

  const cancelEditResultAmount = () => {
    setEditingResultAmountId(null);
    setResultAmountDraft({ description: '', tariff: '', amount: '', remarks: '' });
  };

  const handleInlineInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  };

  const fdaDate = new Date(activeJob.fda?.date || activeJob.createdAt);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fdaBranch = activeUserBranch || activeJob.inquiry?.createdByBranch || 'JKT';
  const fdaNo = activeJob.fda?.fdaNo || db.getNextFDAFormNumber(fdaBranch, today);

  const buildFDAHtmlSalesTemplate = (print: boolean) => {
    const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const groups = fdaResultCategories.map((category) => ({
      category,
      items: orderedFDAResultRows.filter((item) => item.category === category),
    }));
    const money = (value: number, currency: 'USD' | 'IDR') => currency === 'IDR'
      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
      : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const rows = groups.map((group, categoryIndex) => {
      const total = group.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      const vat = categoryVatAmount(group.items);
      const subtotal = total + vat;
      const currency = (group.items[0]?.currency || viewCurrency) as 'USD' | 'IDR';
      const vatRow = !globalVatApplied && group.items.some((item) => item.vatApplied) ? `<tr class="vat"><td colspan="3">VAT 11%</td><td class="amount">${money(vat, currency)}</td><td></td></tr>` : '';
      return `<tr class="section"><td colspan="5" style="text-indent:1em">${escape(formatCategoryCost(String(group.category)))}</td></tr>${group.items.map((item, index) => { const itemCurrency = (item.currency || viewCurrency) as 'USD' | 'IDR'; return `<tr class="item-row"><td>${index + 1}</td><td>${escape(item.description)}</td><td>${escape(item.tariff)}</td><td class="amount">${money(item.amount || 0, itemCurrency)}</td><td>${escape(item.remarks || '')}</td></tr>`; }).join('')}<tr class="total"><td colspan="3">TOTAL</td><td class="amount">${money(total, currency)}</td><td></td></tr>${vatRow}<tr class="subtotal"><td colspan="3">SUB TOTAL ${categoryIndex + 1}</td><td class="amount">${money(subtotal, currency)}</td><td></td></tr>`;
    }).join('');
    const total = totalEPDAAfterGlobalVat;
    const totalBeforeGlobalVat = totalEPDASubtotal;
    const globalVatRows = `${globalVatApplied ? `<tr class="global-vat"><td colspan="3">TOTAL VAT11%</td><td class="amount">${money(globalVatAmount, viewCurrency)}</td><td></td></tr>` : ''}${pph23Amount > 0 ? `<tr class="pph23"><td colspan="3">TOTAL TAX 23</td><td class="amount">-${money(pph23Amount, viewCurrency)}</td><td></td></tr>` : ''}${globalVatApplied || pph23Amount > 0 ? `<tr class="net-total"><td colspan="3">GRAND TOTAL</td><td class="amount">${money(total, viewCurrency)}</td><td></td></tr>` : ''}`;
    const vessel = vessels.find((item) => item.id === activeJob.vesselId);
    const bank = viewCurrency === 'USD'
      ? '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK MANDIRI (Persero) Tbk</b><br>Address:<br>BANK MANDIRI TEBET SUPOMO<br>Jl. Prof. Dr.Supomo SH No 43, Tebet, RT.04/RW.03<br>Tebet barat , Kec. Tebet, Kota Jakarta Selatan,<br>Daerah Khusus Ibukota Jakarta 12810<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number (USD) : 120-00-5575599-0</b><br><b>Swift Code Bank : BMRIIDJAXXX</b></div><div class="signature"><div class="signature-main">Sincerely,<br>PT. Lentera Global Maritim</div><div class="signature-role">Finance</div></div>'
      : '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address:<br>BNI BIDAKARA<br>Jl. Gatot Subroto Kab 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-09</b><br><b>Swift Code Bank : BNINIDJAXXX</b></div><div class="signature"><div class="signature-main">Sincerely,<br>PT. Lentera Global Maritim</div><div class="signature-role">Finance</div></div>';
    const officeFooter = '<div class="office-footer" style="position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3;">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span style="color:#e11d48;text-decoration:underline">email : maritim@lentera-global.com / web : www.lentera-global.com</span></div>';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${fdaNo}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}html,body{margin:0;padding:0}.brand-row{text-align:center;margin:0 0 2px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:82px;height:62px;object-fit:contain}.brand{font-weight:700;font-size:21px;color:#3562a8}.tag{color:#3562a8;font-size:12px;margin-top:3px}.divider{border-bottom:2px solid #315db2;margin:6px 0 12px}.title-block{margin:0 0 10px}.title-block h2{text-align:center;background:#182a50;color:#fff;padding:5px;font-size:12px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 28px;margin-bottom:4px}.meta-col{display:flex;flex-direction:column;gap:2px}.meta-row{display:grid;grid-template-columns:105px 8px minmax(0,1fr);line-height:1.25}.meta-col.right .meta-row{grid-template-columns:82px 8px minmax(0,1fr)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #9ca3af;padding:4px 5px}th{background:#dbe8f2;text-align:center;font-size:9px}th:nth-child(1),td:nth-child(1){width:5%;text-align:center}th:nth-child(2),td:nth-child(2){width:42%;text-align:left}th:nth-child(3),td:nth-child(3){width:8%;text-align:center}th:nth-child(4),td:nth-child(4){width:17%;text-align:right;white-space:nowrap}th:nth-child(5),td:nth-child(5){width:28%;text-align:left}.section td{background:#182a50;color:#fff;font-weight:700;text-align:left;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact}.subtotal{background:#dbe8f2;font-weight:700}.subtotal td:first-child{text-align:right}.amount{text-align:right;white-space:nowrap}.grand,.net-total{background:#dbe8f2;font-weight:800;color:#f00}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.footer{margin-top:22px;text-align:center;font-size:9px;line-height:1.45;font-weight:600}.footer span{color:#e11d48;text-decoration:underline}font-size:9px;line-height:1.35;font-weight:600}.footer span{color:#e11d48;text-decoration:underline}</style></head><body><div class="brand-row"><div class="brand-wrap"><img class="logo" src="/lgm-logo.png"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>FINAL DISBURSEMENT ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><b>No FDA</b><span>:</span><span>${escape(fdaNo)}</span></div><div class="meta-row"><b>Date Inquiry</b><span>:</span><span>${escape(activeJob.inquiry?.date || '-')}</span></div><div class="meta-row"><b>Principal</b><span>:</span><span>${escape(activeJob.customerName)}</span></div><div class="meta-row"><b>GRT</b><span>:</span><span>${vessel?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><b>Port</b><span>:</span><span>${escape(activeJob.portName)}</span></div><div class="meta-row"><b>ETA</b><span>:</span><span>${escape(getFDAScheduleDisplay(fdaSchedule.eta, fdaSchedule.etaRemarks))}</span></div></div><div class="meta-col right"><div class="meta-row"><b>Vessel</b><span>:</span><span>${escape(activeJob.vesselName)}</span></div><div class="meta-row"><b>Estimated Day</b><span>:</span><span>${activeJob.inquiry?.estimatedDays || '-'}</span></div><div class="meta-row"><b>Flag</b><span>:</span><span>${escape(vessel?.flag || '-')}</span></div><div class="meta-row"><b>Cargo Details</b><span>:</span><span>${escape(activeJob.inquiry?.cargoDetails || '-')}</span></div><div class="meta-row"><b>IMO</b><span>:</span><span>${escape(vessel?.imoNumber || '-')}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>CURRENCY</th><th>AMOUNT</th><th>REMARKS</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="3">${fdaSubTotalLabel}</td><td class="amount">${money(totalBeforeGlobalVat, viewCurrency)}</td><td></td></tr>${globalVatRows}</tbody></table>${bank}${officeFooter}</body></html>`;
  };

  const buildFDAResultDocument = () => {
    const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const money = (value: number, _code: 'USD' | 'IDR') => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const categories = fdaResultCategories;
    const rows = categories.map((category, categoryIndex) => {
      const items = orderedFDAResultRows.filter((item) => item.category === category);
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const vat = categoryVatAmount(items);
      const subtotal = total + vat;
      const itemRows = items.map((item, index) => { const code = (item.currency || viewCurrency) as 'USD' | 'IDR'; return `<tr><td>${index + 1}</td><td>${escape(item.description)}</td><td>${code}</td><td class="amount">${money(item.amount, code)}</td><td>${escape(item.remarks || '')}</td></tr>`; }).join('');
      const currency = (items[0]?.currency || viewCurrency) as 'USD' | 'IDR';
      const vatRow = !globalVatApplied && items.some((item) => item.vatApplied) ? `<tr class="vat"><td colspan="3">VAT 11%</td><td class="amount">${money(vat, currency)}</td><td></td></tr>` : '';
      return `<tr class="section"><td colspan="5">${escape(formatCategoryCost(String(category)))}</td></tr>${itemRows}<tr class="total"><td colspan="3">TOTAL</td><td class="amount">${money(total, currency)}</td><td></td></tr>${vatRow}<tr class="subtotal"><td colspan="3">SUB TOTAL ${categoryIndex + 1}</td><td class="amount">${money(subtotal, currency)}</td><td></td></tr>`;
    }).join('');
    const total = totalEPDAAfterGlobalVat;
    const totalBeforeGlobalVat = totalEPDASubtotal;
    const globalVatRows = `${globalVatApplied ? `<tr class="global-vat"><td colspan="3">TOTAL VAT11%</td><td class="amount">${money(globalVatAmount, viewCurrency)}</td><td></td></tr>` : ''}${pph23Amount > 0 ? `<tr class="pph23"><td colspan="3">TOTAL TAX 23</td><td class="amount">-${money(pph23Amount, viewCurrency)}</td><td></td></tr>` : ''}${globalVatApplied || pph23Amount > 0 ? `<tr class="net-total"><td colspan="3">GRAND TOTAL</td><td class="amount">${money(total, viewCurrency)}</td><td></td></tr>` : ''}`;
    const vessel = vessels.find((item) => item.id === activeJob.vesselId);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${fdaNo}</title><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;color:#172033;font-size:10px}.brand{text-align:center;margin-bottom:8px}.brand-wrap{display:inline-flex;align-items:center;gap:12px;text-align:left}.logo{width:78px;height:58px;object-fit:contain}.brand-name{font-size:20px;font-weight:700;color:#3562a8}.tagline{font-size:11px;color:#3562a8;margin-top:3px}.divider{border-bottom:2px solid #315db2;margin:6px 0 10px}.title-block{margin:0 0 8px}.title-block h2{margin:0;background:#214f84;color:#fff;text-align:center;padding:5px;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 28px;margin-bottom:9px}.meta-col{display:flex;flex-direction:column;gap:2px}.meta-row{display:grid;grid-template-columns:105px 8px minmax(0,1fr);line-height:1.25}.right .meta-row{grid-template-columns:82px 8px minmax(0,1fr)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #9ca3af;padding:4px 5px}th{background:#dbe8f2;text-align:center;font-size:9px}th:nth-child(1),td:nth-child(1){width:5%;text-align:center}th:nth-child(2),td:nth-child(2){width:42%;text-align:left}th:nth-child(3),td:nth-child(3){width:8%;text-align:center}th:nth-child(4),td:nth-child(4){width:17%;text-align:right;white-space:nowrap}th:nth-child(5),td:nth-child(5){width:28%;text-align:left}.section td{background:#808080;color:#fff;font-weight:700;text-align:left;text-transform:uppercase}.subtotal{background:#dbe8f2;font-weight:700}.grand,.net-total{background:#dbe8f2;color:#f00;font-weight:800}.amount{text-align:right;white-space:nowrap}.bank{display:inline-block;width:42%;margin-top:16px;border:1px solid #777;padding:8px;font-size:8px;line-height:1.3;vertical-align:top}.signature{display:inline-block;width:42%;margin:52px 0 0 12%;text-align:center;vertical-align:top;font-size:9px;padding-top:8px}.footer{margin-top:16px;text-align:center;font-size:9px;line-height:1.35;font-weight:600}.footer span{color:#e11d48;text-decoration:underline}</style></head><body><div class="brand"><div class="brand-wrap"><img class="logo" src="/lgm-logo.png"><div><div class="brand-name">PT Lentera Global Maritim</div><div class="tagline">Seamless Agent, Global Reach</div></div></div></div><h2>FINAL DISBURSEMENT ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><b>No FDA</b><span>:</span><span>${escape(fdaNo)}</span></div><div class="meta-row"><b>Date Inquiry</b><span>:</span><span>${escape(activeJob.inquiry?.date || '-')}</span></div><div class="meta-row"><b>Principal</b><span>:</span><span>${escape(activeJob.customerName)}</span></div><div class="meta-row"><b>GRT</b><span>:</span><span>${vessel?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><b>Port</b><span>:</span><span>${escape(activeJob.portName)}</span></div><div class="meta-row"><b>ETA</b><span>:</span><span>${escape(activeJob.eta || '-')}</span></div></div><div class="meta-col right"><div class="meta-row"><b>Vessel</b><span>:</span><span>${escape(activeJob.vesselName)}</span></div><div class="meta-row"><b>Estimated Day</b><span>:</span><span>${activeJob.inquiry?.estimatedDays || '-'}</span></div><div class="meta-row"><b>Flag</b><span>:</span><span>${escape(vessel?.flag || '-')}</span></div><div class="meta-row"><b>Cargo Details</b><span>:</span><span>${escape(activeJob.inquiry?.cargoDetails || '-')}</span></div><div class="meta-row"><b>IMO</b><span>:</span><span>${escape(vessel?.imoNumber || '-')}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>CURRENCY</th><th>AMOUNT</th><th>REMARKS</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="3">${fdaSubTotalLabel}</td><td class="amount">${money(totalBeforeGlobalVat, viewCurrency)}</td><td></td></tr>${globalVatRows}</tbody></table><div class="bank">Please kindly remit to our Bank Account<br>Bank Account Detail of PT. Lentera Global Maritim asf:<br><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address: BNI Bidakara<br>Jl. Gatot Subroto Kav 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, DKI Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-69</b><br><b>Swift Code Bank : BNIIDNAXXX</b></div><div class="signature">Sincerely,<br>PT. Lentera Global Maritim<br><br><br>Finance</div><div class="footer">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span>email : maritim@lentera-global.com / web : www.lentera-global.com</span></div></body></html>`;
  };

  const pushFinanceSignatureDown = (html: string) => html
    .replaceAll('.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}', '.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}')
    .replaceAll('.signature{display:inline-block;width:42%;margin:16px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}', '.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}')
    .replaceAll('margin-top:54px;padding-top:8px', 'margin-top:120px;padding-top:12px')
    .replaceAll('margin-top:22px;padding-top:4px', 'margin-top:120px;padding-top:12px')
    .replaceAll('margin:24px 0 0 12%;', 'margin:24px 0 0 12%;')
    .replaceAll('margin:16px 0 0 12%;', 'margin:24px 0 0 12%;');

  const formatFDAExportDates = (html: string) => {
    const inquiryDate = activeJob.inquiry?.date || activeJob.createdAt;
    const fdaFormDate = activeJob.fda?.date || todayISO();
    const currentFDAFallback = new Date().toLocaleDateString('id-ID');
    const formattedFDAFallback = formatInquiryDate(fdaFormDate);
    const isoDatePattern = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;
    return (activeJob.eta ? html.replaceAll(activeJob.eta, formatVesselDate(activeJob.eta, true)) : html)
      .replace(/<div class="meta-row"><b>Date Inquiry<\/b><span>:\<\/span><span>.*?<\/span><\/div>/g, `<div class="meta-row"><b>Date</b><span>:</span><span>${formattedFDAFallback}</span></div>`)
      .replaceAll(new Date(inquiryDate).toLocaleDateString('id-ID'), formatInquiryDate(inquiryDate))
      .replaceAll(activeJob.fda?.date || currentFDAFallback, formattedFDAFallback)
      .replaceAll('AMOUNT</th>', `AMOUNT ${viewCurrency}</th>`)
      .replace(isoDatePattern, (value) => value.startsWith(String(inquiryDate).slice(0, 10))
        ? formatInquiryDate(inquiryDate)
        : formatDateDisplay(value));
  };

  const normalizeFDAExportLayoutBase = (html: string) => pushFinanceSignatureDown(formatFDAExportDates(html.replaceAll('>CURRENCY<', '>TARIFF<').replace('</style>', 'h2{background:#28598e!important;color:#fff!important;text-align:center!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.section td{background:#28598e!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.subtotal,.grand{background:#dbe8f2!important}.grand{color:#f00!important}.grand,.grand td,.grand td:first-child{font-weight:400!important}.bank,.signature{box-sizing:border-box}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}.meta-col.right{justify-self:stretch;width:100%;padding:0;transform:none}.meta-col.right .meta-row{grid-template-columns:85px 10px minmax(0,1fr)}table th:nth-child(2),table td:nth-child(2){width:20%!important}table th:nth-child(3),table td:nth-child(3){width:35%!important;text-align:center!important;white-space:nowrap}table th:nth-child(4),table td:nth-child(4){width:12%!important;white-space:nowrap}</style>')));

  const normalizeFDAExportLayout = (html: string) => normalizeFDAExportLayoutBase(html).replace('</style>', 'table th{text-align:center!important}table thead th:nth-child(2){text-align:center!important}table tr.item-row td:nth-child(1){text-align:center!important}table tr.item-row td:nth-child(2),table tr.item-row td:nth-child(5){text-align:left!important}table tr.item-row td:nth-child(3){text-align:center!important}table tr.item-row td:nth-child(4){text-align:right!important}table tr.section td{text-align:left!important}table tr.subtotal td:first-child{font-weight:700;text-align:right!important}table tr.grand td:first-child{text-align:right!important}table tr.global-vat td:first-child{text-align:right!important}table tr.subtotal td.amount,table tr.grand td.amount,table tr.advance td.amount,table tr.balance td.amount{font-variant-numeric:tabular-nums;text-align:right!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}table tr.advance td:first-child,table tr.balance td:first-child{text-align:center!important}</style>');
  const addA4PageFrame = (html: string) => html
    .replace('<body>', '<body><div class="a4-page-frame" aria-hidden="true"></div>')
    .replace('</head>', `<style>
      @page { size: A4 portrait; margin: 15mm 10mm; }
      @media screen, print {
        body { font-size: 12px !important; }
        h2, .title-block h2 { font-size: 14px !important; }
        .meta-row, .meta-row b { font-size: 12px !important; line-height: 1.15 !important; }
        .meta-col { min-width: 0; }
        .meta-col.right { justify-self: stretch !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; padding: 0 !important; transform: none !important; }
        .meta-row { grid-template-columns: minmax(0, 105px) 8px minmax(0, 1fr) !important; min-width: 0; }
        .meta-row > span:last-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
        th, td { padding: 2px 3px !important; font-size: 12px !important; line-height: 1.15 !important; }
        table { table-layout: fixed !important; }
        table th:nth-child(1), table td:nth-child(1) { width: 5% !important; }
        table th:nth-child(2), table td:nth-child(2) { width: 32% !important; }
        table th:nth-child(3), table td:nth-child(3) { width: 28% !important; }
        table th:nth-child(4), table td:nth-child(4) { width: 17% !important; }
        table th:nth-child(5), table td:nth-child(5) { width: 18% !important; }
        table tr.item-row td:nth-child(3) { white-space: nowrap !important; }
        table tr.total td:first-child,
        table tr.vat td:first-child,
        table tr.pph23 td:first-child { text-align: right !important; }
        table tr.total td.amount,
        table tr.vat td.amount,
        table tr.pph23 td.amount { text-align: right !important; }
        .section td { font-size: 12px !important; }
        .bank { width: 52% !important; margin-top: 30px !important; padding: 4px !important; font-size: 13px !important; line-height: 1.2 !important; }
        .signature { width: 43% !important; margin: 30px 0 0 3% !important; font-size: 9px !important; }
        .office-footer { position: absolute !important; left: 50% !important; bottom: 15mm !important; transform: translateX(-50%) !important; width: 100% !important; margin: 0 !important; font-size: 9px !important; line-height: 1.1 !important; }
        .brand { margin-bottom: 4px !important; }
        .meta { margin-bottom: 5px !important; }
        .title-block { margin-bottom: 5px !important; }
      }
      @media screen {
        html, body { min-height: 100%; height: auto; overflow: visible; background: #e2e8f0; }
        body { position: relative; box-sizing: border-box; width: 210mm; height: 297mm; min-height: 297mm; max-width: none; margin: 0 auto; padding: 15mm; background: #fff; }
        .meta-col.right { justify-self: stretch !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; }
        .brand { margin-top: 0 !important; }
        .a4-page-frame { position: absolute; top: 10mm; left: 10mm; width: 190mm; height: 277mm; box-sizing: border-box; border: 0.3mm solid #1f2937; pointer-events: none; z-index: 9; }
        .office-footer { position: absolute !important; left: 50% !important; bottom: 15mm !important; transform: translateX(-50%) !important; width: 100% !important; margin: 0 !important; }
      }
      @media print {
        html, body { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible; background: #fff; }
        body { position: static !important; max-width: none; padding: 0 3mm !important; box-sizing: border-box; }
        .brand-row { position: static !important; display: block !important; margin: 0 auto 2mm !important; padding: 0 !important; }
        .brand-wrap { min-height: 0 !important; }
        .title-block, h2 { margin-top: 0 !important; }
        table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; page-break-inside: auto !important; break-inside: auto !important; }
        tbody tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        .meta-col.right { justify-self: stretch !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; }
        .brand { margin-top: 0 !important; }
        .a4-page-frame { position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; box-sizing: border-box; border: 0.5mm solid #1f2937; pointer-events: none; z-index: 9999; }
        .office-footer { position: fixed !important; left: 3mm !important; bottom: 3mm !important; transform: none !important; display: block !important; width: calc(100% - 6mm) !important; max-width: none !important; margin: 0 !important; text-align: center !important; }
      }
    </style></head>`);
  const addCargoQuantityAfterIMO = (html: string) => html.replace(
    /(<div class="meta-row"><b>IMO<\/b><span>:\<\/span><span>.*?<\/span><\/div>)/,
    (imoRow) => {
      const etdDisplay = getFDAScheduleDisplay(fdaSchedule.etd, fdaSchedule.etdRemarks)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `${imoRow}<div class="meta-row"><b>Cargo Quantity</b><span>:</span><span>${activeJob.inquiry?.cargoQuantity || 0} ${activeJob.inquiry?.quantityUnit || 'TON'}</span></div><div class="meta-row"><b>ETD</b><span>:</span><span>${etdDisplay}</span></div>`;
    }
  );
  const fdaPrintSpacingStyles = `@page{size:A4 portrait;margin:10mm}body{font-size:12px!important}.brand-row{margin:0 0 8px!important}.brand-wrap{min-height:58px!important;gap:12px!important}.logo{width:78px!important;height:58px!important}.brand{font-size:20px!important}.tag{font-size:11px!important;margin-top:3px!important}.divider{margin:6px 0 9px!important}.title-block{margin:0 0 9px!important}.title-block h2,h2{padding:5px!important;font-size:14px!important}.meta{gap:2px 28px!important;margin-bottom:9px!important}.meta-col{gap:2px!important}.meta-row{line-height:1.25!important}th,td{padding:4px 5px!important;font-size:12px!important}`;
  const centerFDAExportColumns = (html: string) => addA4PageFrame(addCargoQuantityAfterIMO(
    normalizeFDAExportLayout(html
      .replace(/<div class="meta-row"><b>Estimated Day<\/b><span>:\<\/span><span>.*?<\/span><\/div>/, '')
      .replace('</style>', `${fdaPrintSpacingStyles}</style>`))
  )).replace('</head>', `<style>
    @media print {
      html, body, body * { font-family: Helvetica, Arial, sans-serif !important; }
      body, .meta, .meta-row, .meta-row b, .section td, table th, table td { font-size: 11px !important; }
      .brand-name { font-size: 20px !important; }
      .tagline { font-size: 11px !important; }
      h2, .title-block h2 { font-size: 14px !important; }
      .bank { font-size: 13px !important; }
      .signature { font-size: 13px !important; }
      .footer, .office-footer { font-size: 9px !important; }
      table tr.global-vat td.amount,
      table tr.net-total td.amount { text-align: right !important; }
      table thead th:first-child, table tbody tr.item-row td:first-child {
        text-align: center !important;
        vertical-align: middle !important;
      }
    }
  </style></head>`);

  const addFDAReceiptSummary = (html: string) => {
    const summaryRows = `<tr class="advance"><td colspan="3">Advance Payment</td><td class="amount">-${formatAccountingNumber(advanceReceived, viewCurrency)}</td><td></td></tr><tr class="balance"><td colspan="3">Balance Due</td><td class="amount">${formatAccountingNumber(balanceDue, viewCurrency)}</td><td></td></tr>`;
    return html.replace('</tbody></table>', `${summaryRows}</tbody></table>`);
  };

  const openFDAWindow = (print = false, getHtml = false): string | undefined => {
    const onePageHtml = pushFinanceSignatureDown(addFDAReceiptSummary(buildFDAHtmlSalesTemplate(false).replace('</style>', '@page{size:A4;margin:14mm}body{font-size:9px}.brand-row{margin:0 0 2px}.brand-wrap{min-height:48px;gap:10px}.logo{width:70px;height:52px}.brand{font-size:17px}.tag{font-size:10px;margin-top:2px}h2{font-size:10px;padding:4px;margin:2px 0 4px}.meta{gap:1px 20px;margin-bottom:3px}.meta-col{gap:1px}.meta-row{line-height:1.15}.meta-row .label{font-size:9px}table{page-break-inside:avoid;table-layout:fixed}table th:first-child,table td:first-child{width:5%;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:42%;text-align:center!important}table th:nth-child(3),table td:nth-child(3){width:8%;text-align:center!important}table th:nth-child(4),table td:nth-child(4){width:17%;text-align:center!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%;text-align:center!important}tr{page-break-inside:avoid}th,td{padding:3px 4px;font-size:8px}.subtotal td:first-child,.grand td:first-child{font-weight:700;text-align:center!important}.subtotal td.amount,.grand td.amount,.subtotal td:nth-child(2),.grand td:nth-child(2){font-variant-numeric:tabular-nums;text-align:center!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}.section td{padding-left:0!important}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:22px;padding-top:4px}.office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:8px;line-height:1.2;font-weight:600;color:#111;z-index:3}.office-footer span{color:#e11d48;text-decoration:underline}</style>')));
    if (getHtml) return centerFDAExportColumns(onePageHtml);
    const windowRef = window.open('', '_blank', 'width=900,height=1100');
    if (!windowRef) return;
    windowRef.document.write(centerFDAExportColumns(onePageHtml));
    windowRef.document.close();
    if (print) windowRef.onload = () => { windowRef.focus(); windowRef.print(); };
  };
  const printFDA = () => {
    const onePageHtml = pushFinanceSignatureDown(addFDAReceiptSummary(buildFDAHtmlSalesTemplate(true).replace('</style>', '@page{size:A4;margin:14mm}body{font-size:9px}.brand-row{margin:0 0 2px}.brand-wrap{min-height:48px;gap:10px}.logo{width:70px;height:52px}.brand{font-size:17px}.tag{font-size:10px;margin-top:2px}h2{font-size:10px;padding:4px;margin:2px 0 4px}.meta{gap:1px 20px;margin-bottom:3px}.meta-col{gap:1px}.meta-row{line-height:1.15}.meta-row .label{font-size:9px}table{page-break-inside:avoid;table-layout:fixed}table th:first-child,table td:first-child{width:5%;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:42%;text-align:center!important}table th:nth-child(3),table td:nth-child(3){width:8%;text-align:center!important}table th:nth-child(4),table td:nth-child(4){width:17%;text-align:center!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%;text-align:center!important}tr{page-break-inside:avoid}th,td{padding:3px 4px;font-size:8px}.subtotal td:first-child,.grand td:first-child{font-weight:700;text-align:center!important}.subtotal td.amount,.grand td.amount,.subtotal td:nth-child(2),.grand td:nth-child(2){font-variant-numeric:tabular-nums;text-align:center!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}.section td{padding-left:0!important}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:22px;padding-top:4px}.office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:8px;line-height:1.2;font-weight:600;color:#111;z-index:3}.office-footer span{color:#e11d48;text-decoration:underline}</style>')));
    setPreviewDocument(centerFDAExportColumns(onePageHtml));
  };

  const handleFDAFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isFDAReadOnly) {
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setMsg('File FDA harus berformat PDF.');
      setTimeout(() => setMsg(null), 3000);
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const nextPdf = { fileName: file.name, dataUrl };
      setPdfUploadMeta(nextPdf);
      db.updateJob(activeJob.jobId, {
        fda: {
          ...activeJob.fda,
          pdfFileName: file.name,
          pdfDataUrl: dataUrl,
        },
      });
      setMsg(`File PDF FDA berhasil diupload: ${file.name}`);
      setTimeout(() => setMsg(null), 3000);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleViewUploadedPdf = () => {
    if (!pdfUploadMeta?.dataUrl) {
      setMsg('Belum ada file PDF FDA yang dapat dilihat.');
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    setShowPdfPreview(true);
  };

  const downloadFDAExcel = () => {
    const rows = fdaResultCategories.flatMap((category, categoryIndex) => {
      const categoryRows = orderedFDAResultRows.filter((item) => item.category === category);
      const total = categoryRows.reduce((sum, item) => sum + item.amount, 0);
      const vat = categoryVatAmount(categoryRows);
      return [
        [formatCategoryCost(category), '', '', '', ''],
        ...categoryRows.map((item, index) => [index + 1, item.description, item.tariff, item.amount, item.remarks]),
        ['', '', 'TOTAL', total, ''],
        ...(!globalVatApplied && categoryRows.some((item) => item.vatApplied) ? [['', '', 'VAT 11%', vat, '']] : []),
        ['', '', `SUB TOTAL ${categoryIndex + 1}`, total + vat, ''],
      ];
    });
    const globalVatRows = globalVatApplied ? [['', '', 'TOTAL VAT11%', globalVatAmount, '']] : [];
    const pph23Row = pph23Amount > 0 ? [['', '', 'TOTAL TAX 23', -pph23Amount, '']] : [];
    const grandTotalRow = globalVatApplied || pph23Amount > 0 ? [['', '', 'GRAND TOTAL', totalEPDAAfterGlobalVat, '']] : [];
    const text = [['NO','DESCRIPTION','TARIFF','AMOUNT','REMARKS'],...rows,['','','TOTAL AMOUNT',totalEPDASubtotal,''],...globalVatRows,...pph23Row,...grandTotalRow].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join('\t')).join('\n');
    const blob=new Blob([text],{type:'application/vnd.ms-excel;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${fdaNo.replaceAll('/','-')}.xls`; a.click(); URL.revokeObjectURL(url);
  };




  const handleFinalizeFDA = () => {
    const guard = db.canFinalizeFDA(activeJob.jobId);
    if (!guard.ok) {
      setMsg(guard.message || 'FDA belum dapat difinalisasi.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    const rawTotalActualBilled = totalEPDAAfterGlobalVat;
    const invoicePrecision = viewCurrency === 'IDR' ? 1 : 100;
    const totalActualBilled = Math.round((rawTotalActualBilled + Number.EPSILON) * invoicePrecision) / invoicePrecision;
    const exchangeRate = effectiveExchangeRate;
    const totalBilledUSD = Math.round(((viewCurrency === 'USD' ? totalActualBilled : totalActualBilled / exchangeRate) + Number.EPSILON) * 100) / 100;
    const totalBilledIDR = Math.round((viewCurrency === 'IDR' ? totalActualBilled : totalActualBilled * exchangeRate) + Number.EPSILON);

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const today = new Date(nowDate.getTime() - nowDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const invoiceNo = activeJob.principalInvoice?.invoiceNo || `INV-${activeJob.jobId}`;
    const fdaNoGenerated = activeJob.fda?.fdaNo || db.getNextFDAFormNumber(fdaBranch, today);
    const currentAPItems = activeJob.ap || [];
    const arFromInvoice = activeJob.ar?.length ? activeJob.ar : [{
      id: `AR-${activeJob.jobId}-001`, jobId: activeJob.jobId, referenceNo: invoiceNo, principalName: activeJob.customerName,
      description: `FDA ${activeJob.jobId}`, requestedAmount: totalActualBilled, receivedAmount: 0, currency: viewCurrency, status: 'AWAITING_REMITTANCE' as const,
    }];

    const submitted = db.submitFDAForManager(activeJob.jobId, {
      fda: { ...activeJob.fda, fdaNo: fdaNoGenerated, date: today, currency: viewCurrency, exchangeRateUSDToIDR: exchangeRate,
        pph23Applied, globalVatApplied,
        finalBilledToPrincipal: totalActualBilled,
        fdaApproved: false, notes: 'FDA dikirim untuk approval Manager Ops.' },
      ap: currentAPItems, ar: arFromInvoice,
      principalInvoice: { ...activeJob.principalInvoice, invoiceNo, invoiceDate: today,
        dueDate: new Date(new Date(now).getTime() + 30 * 86400000).toISOString().slice(0, 10),
        totalAmountUSD: totalBilledUSD, totalAmountIDR: totalBilledIDR, balanceDueUSD: totalBilledUSD, balanceDueIDR: totalBilledIDR, status: 'ISSUED', pdfGenerated: false },
    }, 'FDA User');

    if (!submitted) {
      setMsg('FDA gagal dikirim untuk approval Manager Ops.');
      setTimeout(() => setMsg(null), 3500);
      return;
    }

    setMsg('Final Disbursement Account (FDA) berhasil dikirim untuk approval Manager Ops.');
    setTimeout(() => setMsg(null), 3500);
  };

  if (printPreviewOnly) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button type="button" onClick={() => iframePreviewRef.current?.contentWindow?.print()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600">
            Cetak / Simpan PDF
          </button>
        </div>
        <iframe
          ref={iframePreviewRef}
          title={`Pratinjau FDA ${activeJob.jobId}`}
          srcDoc={openFDAWindow(false, true) || ''}
          className="h-[75vh] min-h-[560px] w-full rounded-lg border border-slate-300 bg-white"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 fda-form-root" aria-readonly={isFDAReadOnly}>
      {msg && (
        <div role="status" className="p-3 bg-cyan-500/20 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{msg}</span>
        </div>
      )}

      {previewDocument && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewDocument(null); }}
        >
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Preview FDA</div>
                <div className="truncate text-sm text-white">Final Disbursement Account</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => iframePreviewRef.current?.contentWindow?.print()}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDocument(null)}
                  className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Tutup
                </button>
              </div>
            </div>
            <iframe
              ref={iframePreviewRef}
              srcDoc={previewDocument}
              title="FDA Preview"
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      )}

      {showPdfPreview && pdfUploadMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPdfPreview(false); }}
        >
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Preview PDF FDA</div>
                <div className="truncate text-sm text-white">{pdfUploadMeta.fileName}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfPreview(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Tutup
              </button>
            </div>
            <iframe
              src={pdfUploadMeta.dataUrl}
              title={pdfUploadMeta.fileName}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      )}

      {/* FDA JOB ID QUEUE */}
      {subTab === 'JOB_ID' && (
        <div className="space-y-5">
          <div className="fda-results-card bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-bold text-cyan-400 uppercase">FDA / JOB ID</div>
                <h2 className="text-xl font-black text-white mt-1">Job Vessel Siap Diproses FDA</h2>
              </div>
              <span className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 text-xs font-bold">{filteredJobList.filter(j => j.managerApproval?.status === 'APPROVED').length} Vessel Call</span>
            </div>

            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
              <div className="flex flex-col gap-3 p-3 md:flex-row md:items-end md:justify-between">
                <div className="flex w-full flex-col items-stretch gap-3 md:w-auto md:flex-row md:items-end">
                  <div className="relative flex items-center">
                    <InquiryDateRangePicker
                      value={jobDateRange}
                      onChange={setJobDateRange}
                      className="w-full md:w-auto"
                    />
                  </div>
                  <div className="flex h-12 flex-1 items-center gap-3 rounded-full border border-slate-600 bg-slate-900 px-4 shadow-inner shadow-slate-950/30 md:h-[34px] md:min-w-[520px]">
                    <span className="text-slate-400">⌕</span>
                    <input
                      type="text"
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      placeholder="Cari nomor Vessel Call, kapal, customer, port..."
                      className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-visible">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">No</th>
                    <th className="p-3 text-center">Job ID</th>
                    <th className="p-3">Vessel</th>
                    <th className="p-3">Principal</th>
                    <th className="p-3">ETA</th>
                    <th className="p-3">ETD</th>
                    <th className="p-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredJobList.filter(j => j.managerApproval?.status === 'APPROVED').map((j, index) => (
                    <tr key={j.jobId} className="hover:bg-slate-800/40 align-middle">
                      <td className="p-3 text-slate-300">{index + 1}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => { onSelectJob(j.jobId); setSubTab('FDA_AMOUNT'); }}
                          className="font-mono font-bold text-cyan-300 hover:text-cyan-200 hover:underline"
                        >
                          {j.jobId}
                        </button>
                      </td>
                      <td className="p-3 font-bold text-white">{j.vesselName}</td>
                      <td className="p-3 text-slate-300">{j.customerName}</td>
                      <td className="p-3 text-slate-200">{formatVesselDate(j.eta, true)}</td>
                      <td className="p-3 text-slate-200">{formatVesselDate(j.etd, true)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => { onSelectJob(j.jobId); setSubTab('FDA_AMOUNT'); }}
                            className="px-2.5 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 text-[10px] font-bold hover:bg-cyan-600/30"
                          >
                            BUAT FDA
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredJobList.filter(j => j.managerApproval?.status === 'APPROVED').length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">Tidak ada Job yang cocok dengan filter saat ini.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {subTab === 'DASHBOARD' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {[
              {
                label: 'TOTAL EPDA',
                value: totalEPDAReady,
                note: 'Jumlah vessel call yang sudah masuk tahap EPDA dan siap diproses',
                icon: FileSpreadsheet,
                cls: 'blue',
              },
              {
                label: 'TOTAL PENDING FDA',
                value: totalPendingFDA,
                note: 'Jumlah FDA yang belum selesai sampai invoice terbit ke principal',
                icon: FileText,
                cls: 'cyan',
              },
              {
                label: 'TOTAL FINISH',
                value: totalFinish,
                note: 'Jumlah FDA yang sudah diproses hingga invoice terbit',
                icon: CheckCircle2,
                cls: 'green',
              },
              {
                label: 'TOTAL COST',
                value: new Intl.NumberFormat('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                  maximumFractionDigits: 0,
                }).format(totalCost),
                note: 'Kumulatif grand total final ke principal, USD dikonversi ke IDR sesuai kurs FDA',
                icon: Coins,
                cls: 'orange',
              },
            ].map((card) => {
              const Icon = card.icon;
              const gradients: Record<string, string> = {
                blue: 'linear-gradient(135deg,#2563eb,#2e58d4)',
                cyan: 'linear-gradient(135deg,#0e9bb5,#128da5)',
                green: 'linear-gradient(135deg,#11866f,#0f7a67)',
                orange: 'linear-gradient(135deg,#f59e0b,#ee8c00)',
              };
              const labelColor: Record<string, string> = {
                blue: '#1670bd',
                cyan: '#1670bd',
                green: '#168b67',
                orange: '#d67b00',
              };

              return (
                <div
                  key={card.label}
                  style={{
                    background: gradients[card.cls],
                    borderRadius: 13,
                    padding: '15px 16px',
                    color: '#fff',
                    minHeight: 128,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 16px rgba(26,78,140,.12)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      right: -24,
                      top: -22,
                      width: 110,
                      height: 110,
                      border: '1px solid rgba(255,255,255,.18)',
                      borderRadius: '50%',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: 'rgba(255,255,255,.18)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Icon size={17} />
                    </div>
                    <span
                      style={{
                        background: '#fff',
                        color: labelColor[card.cls],
                        borderRadius: 999,
                        padding: '4px 9px',
                        fontSize: 9,
                        fontWeight: 850,
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase',
                        lineHeight: 1.2,
                      }}
                    >
                      {card.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(1.2rem, 1.8vw, 2.1rem)',
                      fontWeight: 900,
                      marginTop: 11,
                      lineHeight: 1,
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                    }}
                  >
                    {card.value}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.78, marginTop: 7, lineHeight: 1.35 }}>{card.note}</div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-bold uppercase text-cyan-400">FDA Processing Queue</div>
                <h2 className="mt-1 text-xl font-black text-white">Inquiry & Vessel Siap Diproses</h2>
                <p className="mt-1 text-xs text-slate-400">EPDA yang disetujui Manager OPS dan siap diproses FDA.</p>
              </div>
              <span className="rounded-lg bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">{approvedJobs.length} Vessel Call</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[1100px] table-fixed text-xs">
                <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="w-[4%] whitespace-nowrap p-3 text-center">No</th>
                    <th className="w-[11%] whitespace-nowrap p-3 text-center">Inquiry</th>
                    <th className="w-[14%] whitespace-nowrap p-3 text-center">Inquiry Date</th>
                    <th className="w-[11%] whitespace-nowrap p-3 text-center">Job ID</th>
                    <th className="w-[10%] p-3 text-center">Vessel</th>
                    <th className="w-[7%] whitespace-nowrap p-3 text-center">IMO</th>
                    <th className="w-[6%] whitespace-nowrap p-3 text-right">GT</th>
                    <th className="w-[17%] whitespace-nowrap p-3 text-center">Customer / Principal</th>
                    <th className="w-[8%] p-3 text-center">Port</th>
                    <th className="w-[12%] whitespace-nowrap p-3 text-center">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {approvedJobs.map((job, index) => (
                    <tr key={job.jobId} className="transition-colors hover:bg-slate-800/50">
                      <td className="whitespace-nowrap p-3 text-center font-mono font-bold tabular-nums text-slate-400">{index + 1}</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono font-bold text-cyan-300">{job.inquiry.inquiryNo}</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono tabular-nums text-slate-300">{formatInquiryDate(job.inquiry.date)}</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono font-bold text-blue-300">{job.jobId}</td>
                      <td className="break-words p-3 text-center font-bold text-white">{job.vesselName}</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono tabular-nums text-slate-300">{vessels.find((vessel) => vessel.id === job.vesselId)?.imoNumber || '-'}</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono tabular-nums text-slate-300">{formatTariffNumber(vessels.find((vessel) => vessel.id === job.vesselId)?.grt)}</td>
                      <td className="break-words p-3 text-center text-slate-300">{job.customerName}</td>
                      <td className="break-words p-3 text-center text-slate-300">{job.portName}</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono tabular-nums text-slate-300">{formatVesselDate(job.eta, true)}</td>
                    </tr>
                  ))}
                  {!approvedJobs.length && (
                    <tr><td colSpan={10} className="p-8 text-center text-slate-500">Belum ada vessel call yang disetujui Manager OPS.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'FDA_AMOUNT' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Operator / FDA</span>
                <span className="text-cyan-300">• JOB ID: {activeJob.jobId}</span>
              </div>
              <h1 className="text-2xl font-black text-white mt-1">Create FDA</h1>
              <p className="text-xs text-slate-400">Entry final port disbursement account untuk diteruskan ke Finance.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="account-toolbar-panel account-currency-switch flex items-center gap-2 rounded-xl border p-1.5">
                <button
                  type="button"
                  disabled={isFDAReadOnly}
                  onClick={() => handleViewCurrencyChange('IDR')}
                  className={`h-12 px-5 rounded-lg text-base font-bold ${viewCurrency === 'IDR' ? 'bg-emerald-600 text-white' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  IDR (Rp)
                </button>
                <button
                  type="button"
                  disabled={isFDAReadOnly}
                  onClick={() => handleViewCurrencyChange('USD')}
                  className={`h-12 px-5 rounded-lg text-base font-bold ${viewCurrency === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  USD ($)
                </button>
              </div>
              <label className="account-toolbar-panel account-rate-control flex h-16 items-center gap-2 rounded-xl border px-5 text-base">
                Kurs USD
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={exchangeRateInput}
                  readOnly={isFDAReadOnly}
                  onChange={(e) => handleExchangeRateChange(e.target.value)}
                  onBlur={(e) => handleExchangeRateChange(e.currentTarget.value)}
                  className="account-rate-input h-9 w-28 rounded-lg border px-3 text-right text-base"
                />
              </label>
              {isFDAApproved ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-100 px-3.5 py-2 text-xs font-bold text-blue-700">
                  <CheckCircle2 className="h-4 w-4" />
                  VIEW ONLY · APPROVED
                </span>
              ) : isFDASubmitted ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800">
                  <CheckCircle2 className="h-4 w-4" />
                  MENUNGGU APPROVAL MANAGER OPS
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalizeFDA}
                  className="h-[54px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-bold flex items-center gap-2"
                >
                  <Send className="w-6 h-6" />
                  Kirim ke Manager untuk Approval
                </button>
              )}
            </div>
          </div>

          {isFDAApproved && <div role="status" className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><div><b>FDA sudah difinalisasi dan diteruskan ke Finance.</b><div className="mt-1">Data biaya terkunci. Hasil FDA tetap bisa dilihat, diunduh, dan dicetak.</div></div></div>}
          {isFDASubmitted && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><div><b>FDA sudah dikirim ke Manager Ops dan menunggu approval.</b><div className="mt-1">Data biaya terkunci sampai disetujui atau dikembalikan untuk revisi.</div></div></div>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs uppercase font-bold text-slate-400">No. FDA</span>
              <b className="block mt-1 text-cyan-300 font-mono">{fdaNo}</b>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs uppercase font-bold text-slate-400">No. EPDA</span>
              <b className="block mt-1 text-cyan-300 font-mono">{fdaEpdaDisplayNo}</b>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs uppercase font-bold text-slate-400">Principal / Vessel</span>
              <b className="block mt-1 text-white">{activeJob.customerName} • {activeJob.vesselName}</b>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs uppercase font-normal text-slate-400">Grand Total</span>
              <span className="mt-1 block break-all text-sm font-normal font-mono leading-tight text-emerald-300 sm:text-base lg:text-lg">
                {viewCurrency === 'IDR'
                  ? formatAccountingNumber(fdaGrandTotal, 'IDR')
                  : formatUSD(fdaGrandTotal)}
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
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Inquiry No</div><div className="mt-1 font-bold text-cyan-300 font-mono">{activeJob.inquiry?.inquiryNo || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Tanggal Inquiry</div><div className="mt-1 font-bold text-white">{formatInquiryDate(activeJob.inquiry?.date)}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Status Inquiry</div><div className="mt-1 font-bold text-emerald-300">{activeJob.inquiry?.status || 'CONVERTED'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Dibuat Oleh</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.createdBy || '-'}</div></div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Branch</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.createdByBranch || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel</div><div className="mt-1 font-bold text-white">{activeJob.vesselName || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">IMO</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.imoNumber || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Call Sign / Flag</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.callSign || '-'} / {vesselMaster?.flag || '-'}</div></div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Principal</div><div className="mt-1 font-bold text-white">{activeJob.customerName || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Port</div><div className="mt-1 font-bold text-white">{activeJob.portName || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETA</div><div className="mt-1 font-bold text-white font-mono">{getFDAScheduleDisplay(fdaSchedule.eta, fdaSchedule.etaRemarks)}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETD</div><div className="mt-1 font-bold text-white font-mono">{getFDAScheduleDisplay(fdaSchedule.etd, fdaSchedule.etdRemarks)}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Cargo Quantity</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.cargoQuantity || 0} {activeJob.inquiry?.quantityUnit || 'TON'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Purpose</div><div className="mt-1 font-bold text-white">{activeJob.purposeOfCall || '-'}</div></div>
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Purpose</div><div className="mt-1 font-bold text-white">{formatPurposeOfCall(activeJob.purposeOfCall)}</div></div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Estimated Days</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.estimatedDays || 0} hari</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Cargo Details</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.cargoDetails || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel Type</div><div className="mt-1 font-bold text-white">{vesselMaster?.vesselType || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Gross / Net / DWT</div><div className="mt-1 font-bold text-white font-mono">{formatTariffNumber(vesselMaster?.grt)} / {formatTariffNumber(vesselMaster?.nrt)} / {formatTariffNumber(vesselMaster?.dwt)}</div></div>

              <div className="md:col-span-2 xl:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="text-slate-400 uppercase tracking-wider">Special Requirements</div>
                <div className="mt-1 text-white leading-relaxed">{activeJob.inquiry?.specialRequirements || 'Tidak ada requirement khusus.'}</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="mb-4">
              <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">FDA</div>
              <h2 className="mt-1 text-lg font-black text-white">Inquiry form FDA</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <label className="block text-slate-400">
                ETA
                <DateTimeInput value={fdaSchedule.eta} disabled={isFDAReadOnly} onChange={(value) => updateFDASchedule('eta', value)} ariaLabel="ETA" inputClassName="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-60" />
              </label>
              <label className="block text-slate-400">
                ETD
                <DateTimeInput value={fdaSchedule.etd} disabled={isFDAReadOnly} onChange={(value) => updateFDASchedule('etd', value)} ariaLabel="ETD" inputClassName="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-60" />
              </label>
              <label className="block text-slate-400">
                Keterangan ETA
                <input type="text" value={fdaSchedule.etaRemarks} disabled={isFDAReadOnly} onChange={(event) => updateFDASchedule('etaRemarks', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-60" />
              </label>
              <label className="block text-slate-400">
                Keterangan ETD
                <input type="text" value={fdaSchedule.etdRemarks} disabled={isFDAReadOnly} onChange={(event) => updateFDASchedule('etdRemarks', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-60" />
              </label>
            </div>
            <div className="mt-4 text-right text-xs text-slate-400">Perubahan disimpan otomatis.</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white uppercase tracking-wider">Hasil FDA</h2>
                <span className="text-xs text-slate-400">Melihat hasil entry Final Cost FDA</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600/20 text-cyan-200 border border-cyan-500/30 text-xs font-bold ${isFDAReadOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  <Upload className="w-3.5 h-3.5"/>
                  <span>Upload File</span>
                  <input type="file" accept="application/pdf" className="hidden" disabled={isFDAReadOnly} onChange={handleFDAFileUpload} />
                </label>
                {pdfUploadMeta && (
                  <button
                    type="button"
                    onClick={handleViewUploadedPdf}
                    className="px-3 py-2 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5"/>
                    Lihat PDF
                  </button>
                )}
                <button type="button" onClick={downloadFDAExcel} className="px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5"/>Download Excel</button>
                <button type="button" onClick={() => openFDAWindow(true)} className="px-3 py-2 rounded-lg bg-white text-slate-900 text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5"/>Cetak / PDF</button>
              </div>
            </div>

            <div className="erp-tax-controls mb-3 flex flex-wrap gap-2">
              <label className={`erp-tax-option erp-tax-option-pph ${pph23Applied ? 'is-active' : ''} ${isFDAReadOnly ? 'is-disabled' : ''}`}>
                <input type="checkbox" checked={pph23Applied} disabled={isFDAReadOnly} onChange={(event) => setFDAFormPph23Applied(event.target.checked)} />
                <span>PPH 23 (2%)<small>Untuk kategori yang memiliki item VAT 11%</small></span>
              </label>
              <label className={`erp-tax-option erp-tax-option-vat ${globalVatApplied ? 'is-active' : ''} ${isFDAReadOnly ? 'is-disabled' : ''}`}>
                <input type="checkbox" checked={globalVatApplied} disabled={isFDAReadOnly} onChange={(event) => setFDAGlobalVatApplied(event.target.checked)} />
                <span>VAT 11%<small>11% dari jumlah TOTAL kategori, ditambahkan ke SUB TOTAL</small></span>
              </label>
            </div>
            <div className="mb-1 px-2 text-right text-[9px] normal-case tracking-normal text-cyan-300">
              Ekuivalen kurs: 1 USD = Rp {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(effectiveExchangeRate)}
            </div>
            <div className="fda-results-card pda-results-card overflow-x-auto rounded-lg">
              <table className="w-full min-w-[900px] table-fixed text-left text-xs border-separate border-spacing-0">
                <colgroup>
                  <col className="w-[7%]" />
                  <col className="w-[32%]" />
                  <col className="w-[23%]" />
                  <col className="w-[18%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="border-l border-slate-700 p-3.5 text-center">No</th>
                    <th className="border-l border-slate-700 p-3.5 text-center">Description</th>
                    <th className="border-l border-slate-700 p-3.5 text-center">Tariff</th>
                    <th className="border-l border-slate-700 p-3.5 text-center">Amount ({viewCurrency})</th>
                    <th className="border-l border-slate-700 p-3.5 text-center">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {fdaResultRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-5 text-center text-slate-400">Belum ada item biaya final FDA.</td>
                    </tr>
                  ) : fdaResultCategories.map((category, categoryIndex) => {
                    const categoryRows = orderedFDAResultRows.filter((item) => item.category === category);
                    const categoryAmountTotal = categoryRows.reduce((sum, item) => sum + item.amount, 0);
                    const categoryVat = categoryVatAmount(categoryRows);
                    const categoryCurrency = categoryRows[0]?.currency || viewCurrency;
                    return (
                      <React.Fragment key={category}>
                        <tr className="fda-category-row">
                          <td colSpan={5} className="border-l border-slate-700 text-left">
                            <span className="fda-category-label">{formatCategoryCost(category)}</span>
                          </td>
                        </tr>
                        {categoryRows.map((it, idx) => (
                          <tr key={it.id} className="transition-colors hover:bg-slate-700/40">
                            <td className="border-l border-slate-800 p-3.5 text-center font-mono text-slate-300">{idx + 1}{it.vatApplied && <span className="ml-0.5 font-bold text-blue-400" title="VAT 11%" aria-label="VAT 11%">*</span>}</td>
                            <td className="border-l border-slate-800 p-3.5 font-bold text-white">
                              {editingResultAmountId === it.id
                                ? <input value={resultAmountDraft.description} onChange={(event) => setResultAmountDraft({ ...resultAmountDraft, description: event.target.value })} aria-label={`Description ${it.description}`} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 font-normal text-white" />
                                : it.description}
                            </td>
                            <td className="border-l border-slate-800 p-3.5 font-mono text-cyan-300">
                              {editingResultAmountId === it.id
                                ? <input type="text" value={resultAmountDraft.tariff} onChange={(event) => updateResultTariffDraft(it, event.target.value)} aria-label={`Tariff ${it.description}`} className="w-full min-w-48 rounded border border-slate-600 bg-slate-950 px-2 py-1 font-normal text-white" />
                                : it.tariff}
                            </td>
                            <td className="border-l border-slate-800 p-3.5 text-right text-xs font-mono font-bold text-white">
                              <div className="flex items-center justify-end gap-2">
                                {editingResultAmountId === it.id ? (
                                  <>
                                    <input autoFocus inputMode="decimal" value={resultAmountDraft.amount} onChange={(event) => setResultAmountDraft({ ...resultAmountDraft, amount: event.target.value })} aria-label={`Amount ${it.description}`} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-right text-xs font-normal text-white" />
                                    <button type="button" onClick={() => saveResultAmount(it)} className="rounded p-1 text-emerald-300 hover:bg-emerald-500/20" title="Simpan perubahan item" aria-label={`Simpan perubahan ${it.description}`}><Check className="h-4 w-4" /></button>
                                    <button type="button" onClick={cancelEditResultAmount} className="rounded p-1 text-slate-400 hover:bg-slate-700" title="Batal edit" aria-label="Batal edit amount"><X className="h-4 w-4" /></button>
                                  </>
                                ) : (
                                  <>
                                    {formatAccountingNumber(it.amount, it.currency)}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="border-l border-slate-800 p-3.5 text-slate-300">
                              <div className="flex items-center justify-between gap-3">
                                {editingResultAmountId === it.id
                                  ? <input value={resultAmountDraft.remarks} onChange={(event) => setResultAmountDraft({ ...resultAmountDraft, remarks: event.target.value })} aria-label={`Remark ${it.description}`} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 font-normal text-white" />
                                  : <span>{it.remarks}</span>}
                                <div className="flex items-center gap-1">
                                  {!isFDAReadOnly && activeJob.managerApproval?.status === 'APPROVED' && editingResultAmountId !== it.id && <button type="button" onClick={() => startEditResultAmount(it)} className="rounded-md p-1.5 text-cyan-300 hover:bg-cyan-500/20" title="Edit item" aria-label={`Edit ${it.description}`}><Pencil className="h-3.5 w-3.5" /></button>}
                                  {!isFDAReadOnly && <button type="button" onClick={() => deleteActualCost(it.id)} className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200" title="Hapus item FDA" aria-label={`Hapus ${it.description}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-950/70 font-bold">
                          <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">TOTAL</td>
                          <td className="fda-subtotal-amount border-l border-slate-800 p-2.5 text-right text-xs font-mono font-bold text-white">
                            {categoryCurrency === 'IDR'
                              ? formatAccountingNumber(categoryAmountTotal, 'IDR')
                              : formatAccountingNumber(categoryAmountTotal, 'USD')}
                          </td>
                              <td className="border-l border-slate-800" />
                        </tr>
                        {!globalVatApplied && categoryRows.some((item) => item.vatApplied) && (
                          <tr className="bg-slate-950/70 font-bold">
                            <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">VAT 11%</td>
                            <td className="border-l border-slate-800 p-2.5 text-right text-xs font-mono font-bold text-white">
                              {formatAccountingNumber(categoryVat, categoryCurrency)}
                            </td>
                            <td className="border-l border-slate-800" />
                          </tr>
                        )}
                        <tr className="fda-category-subtotal bg-slate-950/70 font-bold">
                          <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">SUB TOTAL {categoryIndex + 1}</td>
                          <td className="fda-subtotal-amount border-l border-slate-800 p-2.5 text-right text-xs font-mono font-bold text-white">
                            {formatAccountingNumber(categoryAmountTotal + categoryVat, categoryCurrency)}
                          </td>
                          <td className="border-l border-slate-800" />
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {fdaResultRows.length > 0 && (
                    <>
                      <tr aria-hidden="true">
                        <td colSpan={5} className="h-8 border-0 p-0" />
                      </tr>
                      <tr className="fda-grand-total-row bg-slate-950/80">
                        <td colSpan={3} className="border-l border-slate-800 p-3 text-right font-normal uppercase text-slate-200">{fdaSubTotalLabel}</td>
                        <td className="border-l border-slate-800 p-3 text-right text-xs font-mono font-normal text-white">
                          {viewCurrency === 'IDR'
                            ? formatAccountingNumber(totalEPDASubtotal, 'IDR')
                            : formatAccountingNumber(totalEPDASubtotal, 'USD')}
                        </td>
                        <td className="border-l border-slate-800" />
                      </tr>
                    </>
                  )}
                  {globalVatApplied && fdaResultRows.length > 0 && (
                    <>
                      <tr className="bg-slate-950/70 font-bold">
                        <td colSpan={3} className="border-l border-slate-800 p-3 text-right font-bold uppercase text-amber-300">TOTAL VAT11%</td>
                        <td className="border-l border-slate-800 p-3 text-right text-xs font-mono font-bold text-amber-300">{formatAccountingNumber(globalVatAmount, viewCurrency)}</td>
                        <td className="border-l border-slate-800" />
                      </tr>
                    </>
                  )}
                  {pph23Amount > 0 && fdaResultRows.length > 0 && (
                    <tr className="bg-slate-950/70 font-bold">
                      <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-rose-300">TOTAL TAX 23</td>
                      <td className="border-l border-slate-800 p-2.5 text-right text-xs font-mono font-bold text-rose-300">-{formatAccountingNumber(pph23Amount, viewCurrency)}</td>
                      <td className="border-l border-slate-800" />
                    </tr>
                  )}
                  {(globalVatApplied || pph23Amount > 0) && fdaResultRows.length > 0 && (
                    <tr className="bg-slate-950/80">
                      <td colSpan={3} className="border-l border-slate-800 p-3 text-right font-bold uppercase text-slate-200">GRAND TOTAL</td>
                      <td className="border-l border-slate-800 p-3 text-right text-xs font-mono font-bold text-white">{formatAccountingNumber(totalEPDAAfterGlobalVat, viewCurrency)}</td>
                      <td className="border-l border-slate-800" />
                    </tr>
                  )}
                  <tr className="bg-slate-950/70">
                    <td colSpan={3} className="border-l border-slate-800 p-3 text-right font-normal uppercase text-slate-200">Advance Payment</td>
                    <td className="border-l border-slate-800 p-3 text-right text-xs font-mono font-normal text-rose-300">
                      -{formatAccountingNumber(advanceReceived, viewCurrency)}
                    </td>
                    <td className="border-l border-slate-800" />
                  </tr>
                  <tr className="bg-slate-950/80">
                    <td colSpan={3} className="border-l border-slate-800 p-3 text-right font-bold uppercase text-slate-200">BALANCE DUE</td>
                    <td className="border-l border-slate-800 p-3 text-right text-xs font-mono font-bold text-emerald-300">
                      {formatAccountingNumber(balanceDue, viewCurrency)}
                    </td>
                    <td className="border-l border-slate-800" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

            <div className="fda-entry-panel rounded-2xl border border-slate-300 bg-[#edf2f4] p-5 font-normal shadow-sm">
            <fieldset disabled={isFDAReadOnly} className="contents">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2 text-emerald-600">
                <Plus className="h-4 w-4" />
                <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">
                  {actualEntryMode === 'AUTO' ? 'Tambah Item FDA Otomatis' : 'Tambah Item FDA Manual'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setActualEntryMode('AUTO'); setAutoSelectedItemKey(''); }} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${actualEntryMode === 'AUTO' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
                  Otomatis
                </button>
                <button type="button" onClick={() => { setActualEntryMode('MANUAL'); setNewActual((current) => ({ ...current, ...(!editingActualId && manualItemReference ? { description: manualItemReference.name, category: normalizeCostCategory(manualItemReference.category) || current.category } : {}), ...(!manualTypeDefaultedRef.current && !editingActualId ? { tariffType: 'FIXED' as const } : {}) })); if (!manualTypeDefaultedRef.current && !editingActualId) manualTypeDefaultedRef.current = true; }} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${actualEntryMode === 'MANUAL' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
                  Manual
                </button>
              </div>

              <div className="flex items-center gap-2">
                {actualEntryMode === 'MANUAL' && (
                  <button type="button" onClick={handleQuickAddMasterData} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 shadow-sm">
                    <Plus className="h-4 w-4" />
                    TAMBAH DATA MASTER
                  </button>
                )}
                <button type="button" onClick={handleAddActualCost} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 shadow-sm">
                  <Plus className="h-4 w-4" />
                  TAMBAH ITEM
                </button>
              </div>
            </div>

            <p className="mb-2 text-xs text-slate-500">
              {actualEntryMode === 'AUTO'
                ? 'Mode otomatis: Type VARIABLE dihitung dengan rumus GRT x tarif x QTY.'
                : 'Mode manual: data diisi langsung. Jika Type VARIABLE, rumusnya GRT x tarif x QTY.'}
            </p>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
            </div>

            {actualEntryMode === 'AUTO' ? (
              <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-6">
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-slate-600">Item Service</label>
                  <MasterItemSearch
                    options={masterItemSearchOptions}
                    value={autoSelectedItemKey}
                    onSelect={applySelectedAutoService}
                    onIncompatibleSelect={keepIncompatibleItemAsReference}
                    placeholder="Search disini"
                    ariaLabel="Cari item service master FDA"
                  />
                  {!masterItemSearchOptions.length && (
                    <p className="mt-1 text-[10px] text-slate-500">Belum ada item tarif atau Expenses Item di master data.</p>
                  )}
                </div>
                <div><label className="mb-1 block text-slate-600">Category Cost</label><select value={newActual.category} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"><option value="PORT_SERVICE">PORT SERVICE</option><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></div>
                <div><label className="mb-1 block text-slate-600">Type</label><select value={newActual.tariffType} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_CARGO">QTY_CARGO</option></select></div>
                <div><label className="mb-1 block text-slate-600">Rate</label><input type="text" inputMode="decimal" readOnly value={formatRateAmount(Number(newActual.rate) || 0)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" /></div>
                <div><label className="mb-1 block text-slate-600">QTY</label><input type="number" min="1" value={actualQuantity} onChange={(e) => setActualQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" /></div>
                <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div><label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label><input readOnly value={formatAccountingNumber(autoTariffPreview, viewCurrency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" /></div>
                  <div><label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label><input readOnly value={formatAccountingNumber(actualAmount, viewCurrency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500" /></div>
                </div>
                <div className="lg:col-span-6"><label className="mb-1 block text-slate-600">Remark</label><input value={newActual.notes} onChange={(e) => setNewActual({ ...newActual, notes: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" /></div>
                <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2"><label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" checked={newActual.vatApplied} onChange={(e) => setNewActual({ ...newActual, vatApplied: e.target.checked })} /> VAT 11%</label></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-6">
                <div className="lg:col-span-2"><label className="mb-1 block text-slate-600">Item Service{manualItemReference && newActual.description === manualItemReference.name ? ' (referensi Master Data)' : ''}</label><input required value={newActual.description} onChange={(e) => setNewActual({ ...newActual, description: e.target.value })} placeholder="Nama biaya final manual" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" /></div>
                <div><label className="mb-1 block text-slate-600">Category Cost</label><select value={newActual.category} onChange={(e) => setNewActual({ ...newActual, category: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"><option value="PORT_SERVICE">PORT SERVICE</option><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></div>
                <div><label className="mb-1 block text-slate-600">Type</label><select value={newActual.tariffType} onChange={(e) => setNewActual({ ...newActual, tariffType: e.target.value as 'FIXED' | 'VARIABLE' | 'QTY_CARGO' })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="QTY_CARGO">QTY_CARGO</option></select></div>
                <div><label className="mb-1 block text-slate-600">QTY</label><input type="number" min="1" value={actualQuantity} onChange={(e) => setActualQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" /></div>
                <div><label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label><input type="text" inputMode="decimal" placeholder="0.0000" value={manualTariffText} onChange={(e) => { const text = e.target.value; setManualTariffText(text); setNewActual({ ...newActual, amountBuy: parseTariffInput(text) }); }} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" /></div>
                <div><label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label><input readOnly value={formatAccountingNumber(actualAmount, viewCurrency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500" /></div>
                <div className="lg:col-span-6"><label className="mb-1 block text-slate-600">Remark</label><input value={newActual.notes} onChange={(e) => setNewActual({ ...newActual, notes: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" /></div>
                <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2"><label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" checked={newActual.vatApplied} onChange={(e) => setNewActual({ ...newActual, vatApplied: e.target.checked })} /> VAT 11%</label></div>
              </div>
            )}

            <div className="mt-3 text-[10px] text-slate-500">
              {actualEntryMode === 'AUTO'
                ? 'Otomatis: FIXED = Tarif x QTY; VARIABLE = GRT x Tarif x QTY; QTY_CARGO = Quantity Cargo x Tarif x QTY.'
                : 'Manual: FIXED = Tarif x QTY; VARIABLE = GRT x Tarif x QTY; QTY_CARGO = Quantity Cargo x Tarif x QTY.'}
            </div>
            </fieldset>
          </div>
        </div>
      )}

      {subTab === 'FDA_AMOUNT' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h3 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-emerald-800">
            Advance Received
          </h3>
          <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-slate-600">Advance Received</label>
              <div className="rounded-lg border border-slate-300 bg-white p-2.5 font-semibold text-slate-700">
                Advance Payment
              </div>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Date Advance Payment</label>
              <DateInput
                value={advancePaymentDate}
                disabled={isFDAReadOnly || isSavingAdvancePayment}
                onChange={setAdvancePaymentDate}
                ariaLabel="tanggal uang muka"
                inputClassName="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label>
              <input
                type="number"
                min="0"
                step={viewCurrency === 'IDR' ? '1' : '0.01'}
                value={advancePaymentAmount}
                disabled={isFDAReadOnly || isSavingAdvancePayment}
                onChange={(event) => setAdvancePaymentAmount(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-right text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Remark</label>
              <input
                type="text"
                value={advancePaymentRemark}
                disabled={isFDAReadOnly || isSavingAdvancePayment}
                onChange={(event) => setAdvancePaymentRemark(event.target.value)}
                placeholder="Keterangan pembayaran"
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </div>
          </div>
          {advancePaymentError && (
            <p className="mt-3 text-xs font-semibold text-rose-600">{advancePaymentError}</p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleAddAdvancePayment}
              disabled={isFDAReadOnly || isSavingAdvancePayment}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isSavingAdvancePayment ? 'MENYIMPAN...' : 'TAMBAH DATA'}
            </button>
          </div>
          <div className="mt-5 overflow-x-auto">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">History Payment</h4>
            {financeReceivableError && <p role="alert" className="mb-2 text-xs font-semibold text-rose-600">{financeReceivableError}</p>}
            {(advancePaymentHistory.length > 0 || financeReceivableEntries.length > 0) && (
              <div className="space-y-1 text-xs text-slate-700">
                {financeReceivableEntries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                    {formatDateDisplay(entry.incomeDate)} · {formatAccountingNumber(
                      convertReceiptCurrency(Number(entry.idrAmount || 0), 'IDR', viewCurrency)
                        + convertReceiptCurrency(Number(entry.usdAmount || 0), 'USD', viewCurrency),
                      viewCurrency,
                    )} {viewCurrency} · Finance ({entry.invoiceType}: {entry.invoiceNo}) · {entry.bankName} · {entry.remark}
                  </div>
                ))}
                {advancePaymentHistory.map((receipt) => (
                  <React.Fragment key={receipt.id}>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-white px-3 py-2">
                      <span>
                        {formatDateDisplay(receipt.receivedDate)} · {formatAccountingNumber(
                          convertReceiptCurrency(
                            Number(receipt.amount || 0),
                            receipt.currency || activeJob.currency || 'IDR',
                            viewCurrency,
                          ),
                          viewCurrency,
                        )} {viewCurrency} · {receipt.bankRemark || '-'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openAdvanceReceiptEdit(receipt)}
                        disabled={isFDAReadOnly || isSavingAdvanceReceiptEdit}
                        className="shrink-0 rounded p-1.5 text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Edit atau hapus Advance Received"
                        aria-label={`Edit atau hapus Advance Received ${formatDateDisplay(receipt.receivedDate)}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingAdvanceReceipt?.id === receipt.id && !isFDAReadOnly && (
                      <div className="rounded-lg border border-cyan-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-wide text-slate-700">Edit Advance Received</h5>
                            <p className="mt-1 text-[11px] text-slate-500">Perbarui data penerimaan ini atau hapus jika tidak diperlukan.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAdvanceReceipt(null);
                              setAdvanceReceiptEditError('');
                            }}
                            disabled={isSavingAdvanceReceiptEdit}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                            aria-label="Batal edit Advance Received"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-slate-600">Date Advance Payment</label>
                            <DateInput
                              value={advanceReceiptEditDate}
                              disabled={isSavingAdvanceReceiptEdit}
                              onChange={setAdvanceReceiptEditDate}
                              ariaLabel="tanggal uang muka"
                              inputClassName="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 disabled:bg-slate-100"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-slate-600">Amount ({receipt.currency})</label>
                            <input
                              type="number"
                              min="0"
                              step={receipt.currency === 'IDR' ? '1' : '0.01'}
                              value={advanceReceiptEditAmount}
                              disabled={isSavingAdvanceReceiptEdit}
                              onChange={(event) => setAdvanceReceiptEditAmount(event.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-right text-slate-700 disabled:bg-slate-100"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-slate-600">Remark</label>
                            <input
                              type="text"
                              value={advanceReceiptEditRemark}
                              disabled={isSavingAdvanceReceiptEdit}
                              onChange={(event) => setAdvanceReceiptEditRemark(event.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 disabled:bg-slate-100"
                            />
                          </div>
                        </div>
                        {advanceReceiptEditError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{advanceReceiptEditError}</p>}
                        <div className="mt-4 flex flex-wrap justify-between gap-2">
                          <button
                            type="button"
                            onClick={handleDeleteAdvanceReceipt}
                            disabled={isSavingAdvanceReceiptEdit}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            HAPUS DATA
                          </button>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAdvanceReceipt(null);
                                setAdvanceReceiptEditError('');
                              }}
                              disabled={isSavingAdvanceReceiptEdit}
                              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveAdvanceReceiptEdit}
                              disabled={isSavingAdvanceReceiptEdit}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50"
                            >
                              {isSavingAdvanceReceiptEdit ? 'MENYIMPAN...' : 'SIMPAN PERUBAHAN'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUOTES VIEW TAB */}
      {subTab === 'QUOTES_VIEW' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">
              Quotes Reference EPDA
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Rincian Amount EPDA yang menjadi dasar Final Disbursement Account.
            </p>

            <div className="overflow-visible">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">Item Layanan EPDA</th>
                    <th className="p-3">Kategori</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {activeJob.quotation?.epda?.items?.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-white">{it.name}</td>
                      <td className="p-3 text-slate-400">{it.category}</td>
                      <td className="p-3 text-right font-mono text-slate-300">{it.quantity}</td>
                      <td className="p-3 text-right font-mono text-cyan-300 font-bold">{formatAccountingNumber(it.amount, it.currency || viewCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL & FDA CLOSE TAB */}
      {subTab === 'APPROVAL' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">
              Generate & Finalize Final Disbursement Account (FDA)
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Tinjau Amount EPDA dan kirim FDA ke Manager Ops untuk approval. FDA yang disetujui diteruskan ke Finance.
            </p>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-xs font-mono font-bold text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                    {activeJob.jobId}
                  </span>
                  <h3 className="text-lg font-black text-white font-mono mt-1">
                    {activeJob.vesselName} ({activeJob.customerName})
                  </h3>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Status FDA Saat Ini:</span>
                  {isFDAApproved ? (
                    <span className="mt-1 inline-flex rounded-lg border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs font-bold uppercase text-blue-700">APPROVED & READY</span>
                  ) : isFDASubmitted ? (
                    <span className="mt-1 inline-flex rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold uppercase text-amber-800">MENUNGGU APPROVAL MANAGER</span>
                  ) : (
                    <span className="text-xs font-mono font-bold uppercase text-slate-200">{activeJob.fda?.approvalStatus === 'REJECTED' ? 'DIKEMBALIKAN · SIAP REVISI' : 'DRAFT · SIAP DIKIRIM'}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs pt-2">
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Amount EPDA</span>
                  <span className="mt-1 block break-all text-sm font-bold leading-tight text-slate-200 sm:text-base">
                    {formatAccountingNumber(totalEPDAAmount, viewCurrency)} {viewCurrency}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">VAT/PPN & PPh 23</span>
                  <span className="mt-1 block break-all text-sm font-bold leading-tight text-slate-200 sm:text-base">
                    {formatAccountingNumber(epdaVatAmount + globalVatAmount - pph23Amount, viewCurrency)} {viewCurrency}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Final Amount FDA</span>
                  <span className="mt-1 block break-all text-sm font-bold leading-tight text-emerald-400 sm:text-base">
                    {formatAccountingNumber(fdaGrandTotal, viewCurrency)} {viewCurrency}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                {!isFDAReadOnly && <button
                  onClick={handleFinalizeFDA}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition flex items-center gap-2"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>Kirim FDA ke Manager untuk Approval</span>
                </button>}
                {isFDAApproved && <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-100 px-3.5 py-2.5 text-xs font-bold text-blue-700"><CheckCircle2 className="h-4 w-4"/>VIEW ONLY · APPROVED</span>}
                {isFDASubmitted && <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-800"><CheckCircle2 className="h-4 w-4"/>TERKIRIM · MENUNGGU MANAGER OPS</span>}
                {activeJob.fda?.fdaApproved && (
                  <>
                    <button onClick={downloadFDAExcel} className="px-4 py-2.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-2"><Download className="w-4 h-4"/>Download Excel</button>
                    <button onClick={() => openFDAWindow(true)} className="px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold transition flex items-center gap-2"><Printer className="w-4 h-4" /> Cetak / PDF FDA</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Actual Cost Modal */}
      {showAddActualModal && !isFDAReadOnly && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <h3 className="text-base font-bold text-white mb-1">{editingActualId ? 'Edit Amount FDA' : 'Tambah Item / Amount FDA'}</h3>
            <p className="text-[11px] text-slate-400 mb-4">Sesuai revisi PDF, user FDA fokus mengisi Amount aktual untuk 1 Job/Vessel Call. Data vendor dan nomor voucher dibuat otomatis bila kosong.</p>
            <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); handleAddActualCost(); }} className="space-y-3 text-xs font-normal">
              <div><label className="text-slate-400 block mb-1">Description:</label><input type="text" required value={newActual.description} onChange={e=>setNewActual({...newActual,description:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"/></div>
              <div><label className="text-slate-400 block mb-1">Category:</label><select value={newActual.category} onChange={e=>setNewActual({...newActual,category:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"><option value="PORT_SERVICE">PORT SERVICE</option><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="AGENCY_FEE">AGENCY FEE</option></select></div>
              <div><label className="text-slate-400 block mb-1">Tarif ({viewCurrency}):</label><input type="text" inputMode="decimal" required value={formatTariffInput(newActual.amountBuy)} onChange={e=>setNewActual({...newActual,amountBuy:parseTariffInput(e.target.value),amountSellBilled:parseTariffInput(e.target.value)})} className="w-full bg-slate-950 border border-cyan-700 rounded-lg p-2.5 text-white font-mono text-lg"/></div>
              <div><label className="text-slate-400 block mb-1">Remark (opsional):</label><input value={newActual.notes} onChange={e=>setNewActual({...newActual,notes:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"/></div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-300"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={newActual.vatApplied} onChange={e=>setNewActual({...newActual,vatApplied:e.target.checked})} /> VAT 11%</label></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800"><button type="button" onClick={()=>{setShowAddActualModal(false);setEditingActualId(null)}} className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300">Batal</button><button type="submit" className="px-4 py-1.5 rounded-lg bg-cyan-600 text-white font-bold">Simpan Amount</button></div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

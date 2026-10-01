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
import { JobCall, ActualCostItem, ActiveTab, Vessel, FixTariff, ExpensesItem, Currency } from '../../types';
import { db, buildBranchAwareFDANumber, buildBranchAwareInvoiceNumber, getCurrentBranchName, formatEPDAQuoteNoForDisplay } from '../../db/storage';
import { calculateTariffForJob, CalculationBasis, describeTariffFormula, describeTariffService, matchesTariffGRT, parseTariffNumber, formatTariffNumber, getTariffRateForCurrency, filterTariffsByGRT, hasTariffGRTRestriction, selectPreferredTariffOptions } from '../../utils/tariff';
import { formatDateDisplay } from '../../utils/date';

interface FDAViewProps {
  initialTab?: 'DASHBOARD' | 'JOB_ID' | 'ACTUAL_COST' | 'QUOTES_VIEW' | 'APPROVAL';
  jobCalls: JobCall[];
  vessels: Vessel[];
  activeJob: JobCall;
  onSelectJob: (jobId: string) => void;
  fixTariffs?: FixTariff[];
  expensesItems?: ExpensesItem[];
  onNavigate: (tab: ActiveTab) => void;
}

export const FDAView: React.FC<FDAViewProps> = ({
  initialTab = 'DASHBOARD',
  jobCalls,
  vessels,
  activeJob,
  onSelectJob,
  fixTariffs = [],
  expensesItems = [],
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'DASHBOARD' | 'JOB_ID' | 'ACTUAL_COST' | 'QUOTES_VIEW' | 'APPROVAL'>(initialTab);
  const isFDAApproved = Boolean(activeJob.fda?.fdaApproved || activeJob.fda?.approvalStatus === 'APPROVED');
  const isFDASubmitted = activeJob.fda?.approvalStatus === 'SUBMITTED';
  const isFDAReadOnly = isFDAApproved || isFDASubmitted;
  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

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
  const [resultAmountDraft, setResultAmountDraft] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
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
    activeJob.fda?.currency || activeJob.actualCosts?.[0]?.currency || activeJob.quotation?.epda?.currency || activeJob.currency || 'USD'
  );
  const [exchangeRateInput, setExchangeRateInput] = useState<number>(activeJob.fda?.exchangeRateUSDToIDR || activeJob.exchangeRateUSDToIDR || 15800);
  const [jobMonthFilter, setJobMonthFilter] = useState<string>('');
  const [jobSearch, setJobSearch] = useState('');
  const [actualEntryMode, setActualEntryMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualTariffText, setManualTariffText] = useState('');
  const [actualQuantity, setActualQuantity] = useState(1);
  const [actualList, setActualList] = useState<ActualCostItem[]>(activeJob.actualCosts || []);

  useEffect(() => {
    const latestActualCosts = activeJob.actualCosts || [];
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
  }, [activeJob.jobId, activeJob.actualCosts]);

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

  useEffect(() => {
    setViewCurrency(activeJob.fda?.currency || activeJob.actualCosts?.[0]?.currency || activeJob.quotation?.epda?.currency || activeJob.currency || 'USD');
  }, [activeJob.jobId, activeJob.fda?.currency, activeJob.actualCosts, activeJob.quotation?.epda?.currency, activeJob.currency]);

  useEffect(() => {
    setExchangeRateInput(activeJob.fda?.exchangeRateUSDToIDR || activeJob.exchangeRateUSDToIDR || 15800);
  }, [activeJob.jobId, activeJob.fda?.exchangeRateUSDToIDR, activeJob.exchangeRateUSDToIDR]);

  const effectiveExchangeRate = Number(exchangeRateInput || activeJob.exchangeRateUSDToIDR || 15800);

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
    tariffType: 'VARIABLE' as 'FIXED' | 'VARIABLE' | 'RANGE',
    rate: 0,
    minCharge: 0,
  });



  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const formatInquiryDate = (value?: string) => {
    return formatDateDisplay(value);
  };

  const formatAccountingNumber = (value: number, currency: 'USD' | 'IDR') => {
    const normalized = Number(value || 0);
    const fractionDigits = 2;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: fractionDigits,
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

  const fdaEpdaDisplayNo = formatEPDAQuoteNoForDisplay(
    activeJob.quotation?.epda?.quoteNo,
    activeJob.jobId,
    getCurrentBranchName(),
    new Date(activeJob.quotation?.epda?.date || activeJob.inquiry?.date || activeJob.createdAt)
  );
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
    const serviceKey = (name: string, category: string) => `${name.trim().toLowerCase()}|${category.trim().toUpperCase()}`;
    const currentCurrencyFixTariffs = fixTariffs.filter((tariff) =>
      portMatches(tariff.portId, tariff.portName)
      && rateForCurrency(currency, tariff.rateIDR, tariff.rateUSD, tariff.rate, tariff.currency) > 0
    );
    const rangedFixTariffKeys = new Set(currentCurrencyFixTariffs
      .filter(hasTariffGRTRestriction)
      .map((tariff) => serviceKey(tariff.serviceName, tariff.costCategory || 'PORT_EXPENSES')));
    const applicableFixTariffs = filterTariffsByGRT(
      currentCurrencyFixTariffs
        .map((tariff) => ({ ...tariff, name: tariff.serviceName, category: tariff.costCategory || 'PORT_EXPENSES' })),
      vesselMaster?.grt,
    );

    return selectPreferredTariffOptions([
    ...applicableFixTariffs
      .map((tariff) => ({
        name: tariff.serviceName,
        category: tariff.costCategory || 'PORT_EXPENSES',
        tariffType: tariff.tariffType || (tariff.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE'),
        calculationBasis: tariff.calculationBasis === 'LUMP_SUM' && (tariff.tariffType === 'VARIABLE' || tariff.tariffType === 'RANGE')
          ? 'PER_GRT'
          : tariff.calculationBasis,
        rate: rateForCurrency(currency, tariff.rateIDR, tariff.rateUSD, tariff.rate, tariff.currency),
        rateIDR: tariff.rateIDR,
        rateUSD: tariff.rateUSD,
        legacyRate: tariff.rate,
        minCharge: tariff.minCharge,
        currency: tariff.currency,
        source: 'FIX_TARIFF' as const,
        grtMin: tariff.grtMin ?? tariff.grt,
        grtMax: tariff.grtMax ?? tariff.grt,
      })),
    ...expensesItems
      .filter((item) =>
        portMatches(item.portId, item.portName)
        && rateForCurrency(currency, item.rateIDR, item.rateUSD, item.standardCostSell || 0, item.defaultCurrency) > 0
        && !rangedFixTariffKeys.has(serviceKey(item.name, item.category))
      )
      .map((item) => ({
        name: item.name,
        category: item.category,
        calculationBasis: 'PER_GRT' as CalculationBasis,
        tariffType: item.calculationType === 'FIXED' ? 'FIXED' : 'VARIABLE',
        rate: rateForCurrency(currency, item.rateIDR, item.rateUSD, item.standardCostSell || 0, item.defaultCurrency),
        rateIDR: item.rateIDR,
        rateUSD: item.rateUSD,
        legacyRate: item.standardCostSell || 0,
        minCharge: item.standardCostBuy || 0,
        currency: item.defaultCurrency,
          source: 'EXPENSES_ITEM' as const,
      })),
          ]);
        };
  const autoServiceOptions = buildAutoServiceOptions(viewCurrency);

  const autoServiceOptionKey = (name: string, category: string) => JSON.stringify([name, category]);
  const applySelectedAutoService = (selectedKey: string) => {
    const selected = autoServiceOptions.find((option) => autoServiceOptionKey(option.name, option.category) === selectedKey);
    if (!selected) {
      setNewActual({ ...newActual, description: '', rate: 0, minCharge: 0 });
      return;
    }

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
  const monthSet = new Set<string>();

  jobCalls.forEach((job) => {
    const target = job.eta || job.etd || job.inquiry?.date || '';
    if (!target) return;
    const date = new Date(target);
    if (Number.isNaN(date.getTime())) return;
    monthSet.add(`${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`);
  });

  const monthOptions = Array.from(monthSet).sort((a, b) => {
    const [aMonth, aYear] = a.split(' ');
    const [bMonth, bYear] = b.split(' ');
    const aDate = new Date(`${aMonth} 1, ${aYear}`);
    const bDate = new Date(`${bMonth} 1, ${bYear}`);
    return bDate.getTime() - aDate.getTime();
  });
  const activeMonthFilter = jobMonthFilter === 'ALL' ? '' : jobMonthFilter || monthOptions[0] || '';
  const filteredJobList = jobCalls.filter((j) => {
    const monthValue = (() => {
      const target = j.eta || j.etd || j.inquiry?.date || '';
      if (!target) return '';
      const date = new Date(target);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`;
    })();

    const matchesMonth = !activeMonthFilter || monthValue === activeMonthFilter;
    const searchText = jobSearch.trim().toLowerCase();
    const haystack = [j.jobId, j.vesselName, j.customerName, j.portName, j.inquiry?.inquiryNo || '', j.inquiry?.createdBy || '']
      .join(' ')
      .toLowerCase();
    const matchesSearch = !searchText || haystack.includes(searchText);

    return matchesMonth && matchesSearch;
  });

  const totalActualBuy = actualList.reduce((s, i) => s + (i.amount || 0), 0);
  const getActualTariff = (item: ActualCostItem) => {
    const serviceDescription = describeTariffService(item.description);
    const itemCurrency = item.currency || viewCurrency;
    const masterOption = buildAutoServiceOptions(itemCurrency).find((option) =>
      option.name.trim().toLowerCase() === item.description.trim().toLowerCase()
      && option.category === item.category
    );
    if (!serviceDescription) return '';
    return describeTariffFormula({
      description: item.description,
      category: item.category,
      basis: item.calculationBasis || masterOption?.calculationBasis,
      quantity: item.quantity,
      absoluteValue: vesselMaster?.grt,
      rate: item.tariffRate ?? masterOption?.rate ?? (item.quantity ? item.amount / item.quantity : item.amount),
      tariffType: item.tariffType || masterOption?.tariffType,
    });
  };
  const fdaResultRows = actualList.map((item) => ({
    id: item.id,
    category: item.category,
    description: item.description,
    amount: item.amount || 0,
    currency: item.currency || viewCurrency,
    tariff: getActualTariff(item),
    remarks: item.remarks || '-',
  }));
  const categoryRank: Record<string, number> = {
    PORT_EXPENSES: 1,
    PORT_DUES: 1,
    BERTHING: 1,
    PILOTAGE_TOWAGE: 1,
    CLEARANCE: 2,
    IMMIGRATION_CUSTOMS: 2,
    GENERAL_EXPENSES: 3,
    LOGISTICS_SUPPLIES: 3,
    SUNDRY: 3,
    CREW_EXPENSES: 4,
    CREW_CHANGE: 4,
    AGENCY_FEE: 5,
    OWNER_MATTER: 6,
    TAX_CONTINGENCY: 7,
  };
  const orderedFDAResultRows = [...fdaResultRows];
  const fdaResultCategories: string[] = Array.from(new Set<string>(orderedFDAResultRows.map((item) => item.category)));
  const formatCategoryCost = (category: string) => {
    const labelMap: Record<string, string> = {
      PORT_EXPENSES: 'PORT EXPENSES',
      CLEARANCE: 'CLEARANCE IN/OUT',
      GENERAL_EXPENSES: 'GENERAL EXPENSES',
      CREW_EXPENSES: 'CREW EXPENSES',
      AGENCY_FEE: 'AGENCY FEE',
      OWNER_MATTER: 'OWNER MATTER',
      TAX_CONTINGENCY: 'TAX & CONTINGENCY',
      VAT_11: 'VAT 11%',
      PPH_INCOME_TAX: 'PPH / INCOME TAX',
    };
    return labelMap[category] || category.replace(/_/g, ' ');
  };
  const totalQuotedPDA = activeJob.quotation?.pda?.totalSellRate || activeJob.quotation?.epda?.totalSellRate || 0;
  const varianceVsPDA = totalQuotedPDA - totalActualBuy;
  const totalEPDAReady = jobCalls.filter((job) => job.managerApproval?.status === 'APPROVED').length;
  const totalPendingFDA = jobCalls.filter(
    (job) => job.managerApproval?.status === 'APPROVED' && job.currentStage !== 'CLOSED' && !(job.fda?.fdaApproved)
  ).length;
  const totalFinish = jobCalls.filter(
    (job) => job.currentStage === 'CLOSED' || job.fda?.fdaApproved || job.status === 'CLOSED'
  ).length;
  const normalizeGrandTotalToIDR = (job: JobCall) => {
    const currency = (job.fda?.currency || job.actualCosts?.[0]?.currency || job.currency || 'IDR') as 'USD' | 'IDR';
    const exchangeRate = Number(job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800);
    const grandTotal = job.fda?.finalBilledToPrincipal
      ?? job.principalInvoice?.totalAmountUSD
      ?? job.principalInvoice?.totalAmountIDR
      ?? (job.actualCosts?.reduce((acc, item) => acc + (item.amount || 0), 0) || 0);

    return currency === 'USD' ? grandTotal * exchangeRate : grandTotal;
  };
  const handleExchangeRateChange = (nextValue: string) => {
    if (isFDAReadOnly) return;
    const numericValue = Number(nextValue);
    const safeRate = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
    setExchangeRateInput(safeRate || 15800);
    db.updateJob(activeJob.jobId, { fda: { ...activeJob.fda, exchangeRateUSDToIDR: safeRate || 15800 } });
  };
  const totalCost = jobCalls.reduce((sum, job) => sum + normalizeGrandTotalToIDR(job), 0);
  const approvedJobs = jobCalls.filter((job) => job.managerApproval?.status === 'APPROVED');
  const actualQuantityValue = Number(actualQuantity) || 1;
  const actualTariff = Number(newActual.amountBuy) || 0;
  const currentTariffType = newActual.tariffType || (newActual.calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
  const autoTariffPreview = calculateTariffForJob({
    vesselGRT: vesselMaster?.grt || 0,
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
    estimatedDays: Number(activeJob.inquiry?.estimatedDays || 0),
    hours: 1,
    moveCount: 1,
    rate: actualTariff,
    minCharge: Number(newActual.minCharge) || 0,
    calculationBasis: newActual.calculationBasis || 'PER_GRT',
    tariffType: currentTariffType,
  });
  const actualAmount = actualQuantityValue * (actualEntryMode === 'AUTO' ? autoTariffPreview : manualTariffPreview);

  const handleQuickAddMasterData = () => {
    const itemName = (newActual.description || '').trim();
    const rateValue = Number(newActual.amountBuy) || Number(newActual.rate) || 0;
    if (isFDAReadOnly || !itemName || rateValue <= 0) {
      window.alert('Isi nama item service dan tarif sebelum menambah data master.');
      return;
    }

    const portId = (activeJob.portId || activeJob.inquiry?.portId || '').trim();
    const portName = (activeJob.portName || activeJob.inquiry?.portName || '').trim();
    const normalizedItemName = itemName.toLowerCase();
    const isSamePort = (masterPortId?: string, masterPortName?: string) =>
      (!!portId && !!masterPortId && masterPortId === portId)
      || (!!portName && !!masterPortName && masterPortName.toLowerCase() === portName.toLowerCase());

    const duplicateExists = newActual.category === 'PORT_EXPENSES'
      ? fixTariffs.some((tariff) =>
          tariff.serviceName.trim().toLowerCase() === normalizedItemName
          && isSamePort(tariff.portId, tariff.portName)
          && (tariff.costCategory || 'PORT_EXPENSES') === newActual.category
          && rateForCurrency(viewCurrency, tariff.rateIDR, tariff.rateUSD, tariff.rate, tariff.currency) > 0
        )
      : expensesItems.some((expense) =>
          expense.name.trim().toLowerCase() === normalizedItemName
          && isSamePort(expense.portId, expense.portName)
          && expense.category === newActual.category
          && rateForCurrency(viewCurrency, expense.rateIDR, expense.rateUSD, expense.standardCostSell, expense.defaultCurrency) > 0
        );

    if (duplicateExists) {
      window.alert('Item service dengan Nama service, Port, Kategori, dan Currency yang sama sudah tersimpan di master data.');
      return;
    }

    if (newActual.category === 'PORT_EXPENSES') {
      db.addFixTariff({
        portId,
        portName,
        costCategory: newActual.category,
        serviceCode: '',
        serviceName: itemName,
        calculationBasis: newActual.calculationBasis || 'LUMP_SUM',
        tariffType: newActual.tariffType || 'FIXED',
        currency: viewCurrency,
        rate: rateValue,
        rateIDR: viewCurrency === 'IDR' ? rateValue : 0,
        rateUSD: viewCurrency === 'USD' ? rateValue : 0,
        minCharge: Number(newActual.minCharge) || rateValue,
        description: newActual.notes || 'Created from FDA manual entry',
      });
    } else {
      db.addExpensesItem({
        portId: portId || undefined,
        portName: portName || undefined,
        code: `FDA-${Date.now().toString().slice(-6)}`,
        category: newActual.category as any,
        name: itemName,
        unit: 'job',
        defaultCurrency: viewCurrency,
        standardCostBuy: rateValue,
        standardCostSell: rateValue,
        rateIDR: viewCurrency === 'IDR' ? rateValue : 0,
        rateUSD: viewCurrency === 'USD' ? rateValue : 0,
        preferredVendor: newActual.vendorName || '',
        calculationType: newActual.tariffType || 'FIXED',
      });
    }

    window.alert('Data master item berhasil ditambahkan untuk FDA. Item baru siap dipakai di mode otomatis.');
  };

  const handleAddActualCost = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isFDAReadOnly) return;
    if (activeJob.managerApproval?.status !== 'APPROVED') {
      setMsg('Actual Cost belum dapat diinput. Tunggu Manager Approval.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }

    const quantity = Number(actualQuantity) || 1;
    const autoTariffValue = calculateTariffForJob({
      vesselGRT: vesselMaster?.grt || 0,
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
        amount: calculatedAmount, pdaAmountEstimated: quotedReferenceValue,
        varianceAmount: calculatedAmount - quotedReferenceValue, remarks: newActual.notes, tariffType: currentTariffType, calculationBasis: newActual.calculationBasis, tariffRate: actualEntryMode === 'AUTO' ? Number(newActual.rate) || 0 : actualTariff,
        attachmentName: newActual.attachmentName || it.attachmentName, status: 'APPROVED_BY_FDA' as const,
      } : it);
      setActualList(updated);
      db.updateJob(activeJob.jobId, { actualCosts: updated, currentStage: 'ACTUAL_COST' });
      setMsg('Actual Cost diperbarui.');
    } else {
      const item: ActualCostItem = {
        id: `ACT-${Date.now()}`, jobId: activeJob.jobId, itemCode: `EXP-${Math.floor(100 + Math.random() * 900)}`,
        description: normalizedDescription, category: newActual.category, vendorName: newActual.vendorName || 'Vendor / Pelindo',
        invoiceOrVoucherNo: newActual.vendorInvoiceNo || `AUTO-${Date.now()}`, date: new Date().toISOString().slice(0, 10), quantity,
        amount: calculatedAmount, currency: viewCurrency, pdaAmountEstimated: quotedReferenceValue,
        varianceAmount: calculatedAmount - quotedReferenceValue, remarks: newActual.notes, tariffType: currentTariffType, calculationBasis: newActual.calculationBasis, tariffRate: actualEntryMode === 'AUTO' ? Number(newActual.rate) || 0 : actualTariff,
        status: 'APPROVED_BY_FDA', attachmentName: newActual.attachmentName || undefined,
      };
      const next = [...actualList, item];
      setActualList(next);
      db.updateJob(activeJob.jobId, { actualCosts: next, currentStage: 'ACTUAL_COST' });
      setMsg('Actual Cost berhasil dicatat.');
    }

    setShowAddActualModal(false);
    setEditingActualId(null);
    setManualTariffText('');
    setNewActual({ description: '', category: 'PORT_EXPENSES', vendorName: '', vendorInvoiceNo: '', amountBuy: 0, amountSellBilled: 0, notes: '', attachmentName: '', calculationBasis: 'PER_GRT', tariffType: 'VARIABLE', rate: 0, minCharge: 0 });
    setActualQuantity(1);
    setTimeout(() => setMsg(null), 3000);
  };

  const openEditActual = (it: ActualCostItem) => {
    if (isFDAReadOnly || activeJob.managerApproval?.status !== 'APPROVED') return;
    const quantity = Number(it.quantity) || 1;
    const calculationBasis = it.calculationBasis || 'PER_GRT';
    const tariffType = it.tariffType || (calculationBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
    const amountDivisor = quantity * (tariffType === 'FIXED' ? 1 : (vesselMaster?.grt || 1));
    const tariff = Number(it.tariffRate) || Number(it.amount || 0) / amountDivisor;
    setEditingActualId(it.id);
    setActualEntryMode('MANUAL');
    setActualQuantity(quantity);
    setManualTariffText(formatTariffInput(tariff));
    setNewActual({
      description: it.description,
      category: it.category,
      vendorName: it.vendorName,
      vendorInvoiceNo: it.invoiceOrVoucherNo,
      amountBuy: tariff,
      amountSellBilled: it.pdaAmountEstimated,
      notes: it.remarks || '',
      attachmentName: it.attachmentName || '',
      calculationBasis,
      tariffType,
      rate: tariff,
      minCharge: 0,
    });
    setShowAddActualModal(true);
  };

  const updateActualRemark = (actualId: string, remarks: string) => {
    if (isFDAReadOnly) return;
    const updated = actualList.map((item) =>
      item.id === actualId ? { ...item, remarks } : item
    );
    setActualList(updated);
    db.updateJob(activeJob.jobId, { actualCosts: updated, currentStage: 'ACTUAL_COST' });
  };

  const deleteActualCost = (actualId: string) => {
    if (isFDAReadOnly) return;
    const updated = actualList.filter((item) => item.id !== actualId);
    setActualList(updated);
    db.updateJob(activeJob.jobId, {
      actualCosts: updated,
      currentStage: 'ACTUAL_COST',
    });
  };

  const startEditResultAmount = (item: typeof fdaResultRows[number]) => {
    if (isFDAReadOnly || activeJob.managerApproval?.status !== 'APPROVED') return;
    setEditingResultAmountId(item.id);
    setResultAmountDraft(formatAccountingNumber(item.amount, item.currency));
  };

  const saveResultAmount = (actualId: string) => {
    if (isFDAReadOnly || activeJob.managerApproval?.status !== 'APPROVED') return;
    const amount = parseTariffNumber(resultAmountDraft, Number.NaN);
    if (!Number.isFinite(amount) || amount < 0) return;
    const updated = actualList.map((item) => item.id === actualId
      ? { ...item, amount, varianceAmount: amount - (item.pdaAmountEstimated || 0) }
      : item);
    setActualList(updated);
    db.updateJob(activeJob.jobId, { actualCosts: updated, currentStage: 'ACTUAL_COST' });
    setEditingResultAmountId(null);
    setResultAmountDraft('');
  };

  const cancelEditResultAmount = () => {
    setEditingResultAmountId(null);
    setResultAmountDraft('');
  };

  const handleInlineInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  };

  const createActualFromEPDA = () => {
    if (isFDAReadOnly) return;
    if (activeJob.managerApproval?.status !== 'APPROVED') {
      setMsg('Belum dapat membuat Actual Cost. Manager Approval harus APPROVED.');
      setTimeout(() => setMsg(null), 3500);
      return;
    }
    const epdaItems = activeJob.quotation?.epda?.items || [];
    const existingCodes = new Set(actualList.map(x => `${x.description}|${x.pdaAmountEstimated}`));
    const seeded = epdaItems.filter(it => !existingCodes.has(`${it.name}|${it.totalBuyRate}`)).map((it, idx) => ({
      id: `ACT-EPDA-${Date.now()}-${idx}`,
      jobId: activeJob.jobId,
      itemCode: it.expenseItemId || `EPDA-${idx + 1}`,
      description: it.name,
      category: it.category,
      vendorName: '',
      invoiceOrVoucherNo: '',
      date: new Date().toISOString().slice(0, 10),
      amount: it.totalBuyRate,
      currency: it.currency,
      tariffType: it.tariffType,
      calculationBasis: it.calculationBasis,
      tariffRate: it.tariffRate ?? it.unitBuyRate,
      pdaAmountEstimated: it.totalBuyRate,
      varianceAmount: 0,
      status: 'APPROVED_BY_FDA' as const,
    }));
    if (!seeded.length) {
      setMsg('Semua item EPDA sudah tersedia di Actual Cost.');
    } else {
      const next = [...actualList, ...seeded];
      setActualList(next);
      db.updateJob(activeJob.jobId, { actualCosts: next, currentStage: 'ACTUAL_COST' });
      setMsg(`${seeded.length} item biaya dari EPDA berhasil dibuat sebagai draft Actual Cost.`);
    }
    setTimeout(() => setMsg(null), 3500);
  };

  const fdaDate = new Date(activeJob.fda?.date || activeJob.createdAt);
  const activeBranchName = getCurrentBranchName();
  const fdaNo = buildBranchAwareFDANumber(activeJob.jobId, activeBranchName, fdaDate);

  const buildEPDAHtml = () => {
    const epda = activeJob.quotation?.epda || { quoteNo: 'EPDA', items: [], totalSellRate: 0, currency: 'USD' };
    const epdaItems = Array.isArray(epda.items) ? epda.items : [];
    const epdaNo = formatEPDAQuoteNoForDisplay(epda.quoteNo, activeJob.jobId, getCurrentBranchName(), new Date(activeJob.quotation?.epda?.date || activeJob.inquiry?.date || activeJob.createdAt));
    const categoryRank: Record<string, number> = {
      PORT_EXPENSES: 1,
      PORT_DUES: 1,
      BERTHING: 1,
      PILOTAGE_TOWAGE: 1,
      CLEARANCE: 2,
      IMMIGRATION_CUSTOMS: 2,
      GENERAL_EXPENSES: 3,
      LOGISTICS_SUPPLIES: 3,
      SUNDRY: 3,
      CREW_EXPENSES: 4,
      CREW_CHANGE: 4,
      AGENCY_FEE: 5,
    };
    const categoryLabel = (category: string) => category.replaceAll('_', ' ');
    const amount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const amountHeaderLabel = `AMOUNT ${epda.currency || 'USD'}`;
    const orderedItems = [...epdaItems];
    const groupedItems = orderedItems.reduce<Array<{ category: string; items: any[] }>>((groups, item) => {
      const existing = groups.find((group) => group.category === item.category);
      if (existing) existing.items.push(item);
      else groups.push({ category: item.category, items: [item] });
      return groups;
    }, []);

    const rows = groupedItems.map((group) => {
      const groupRows = group.items.map((it, idx) => `<tr class="item-row"><td>${idx + 1}</td><td>${escapeHtml(it.name || '')}</td><td style="text-align:center">${escapeHtml(describeTariffFormula({ description: it.name, category: it.category, basis: it.calculationBasis || it.basis, quantity: it.quantity, absoluteValue: vesselMaster?.grt, rate: it.tariffRate ?? it.unitSellRate, tariffType: it.tariffType }))}</td><td style="text-align:right">${amount(it.totalSellRate || 0)}</td><td>${escapeHtml(it.remarks || '')}</td></tr>`).join('');
      const subtotal = group.items.reduce((sum, item) => sum + (item.totalSellRate || 0), 0);
      return `<tr style="background:#808080;color:#fff;font-weight:700;text-transform:uppercase"><td colspan="5" style="text-align:left;padding-left:0">${escapeHtml(categoryLabel(group.category))}</td></tr>${groupRows}<tr class="subtotal" style="background:#dbe8f2;font-weight:700"><td colspan="3" style="text-align:right">SUB TOTAL</td><td class="amount" style="text-align:right">${amount(subtotal)}</td><td></td></tr>`;
    }).join('');

    const total = groupedItems.reduce((sum, group) => sum + group.items.reduce((inner, item) => inner + (item.totalSellRate || 0), 0), 0);
    const dynamicTableHeader = `<th style="width:5%">NO.</th><th style="width:20%">DESCRIPTION</th><th style="width:35%">TARIFF</th><th style="width:12%">${amountHeaderLabel}</th><th style="width:28%">REMARKS</th>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>${epdaNo}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}.brand-row{text-align:center;margin-bottom:10px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:76px;height:58px;object-fit:contain}.brand{font-weight:700;font-size:21px;line-height:1.15}.tag{color:#666;font-size:13px;margin-top:5px}h2{text-align:center;background:#182a50;color:white;padding:8px;font-size:13px;margin:18px 0 12px}.meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 34px;margin-bottom:12px}.meta-col{display:flex;flex-direction:column;gap:4px}.meta-col.right{justify-self:stretch}.meta-row{display:grid;grid-template-columns:125px 10px minmax(0,1fr);line-height:1.35}.meta-row .label{font-weight:700}.meta-row .colon{text-align:center}.meta-col.right .meta-row{grid-template-columns:85px 10px minmax(0,1fr)}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}.grand{font-weight:700}.sign{margin-top:34px;text-align:right}.footer{position:fixed;bottom:0;width:100%;text-align:center;font-size:8px;color:#666}</style></head><body><div class="brand-row"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>ESTIMATE PORT DISBURSEMENT OF ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No.</span><span class="colon">:</span><span>${epdaNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${new Date(activeJob.inquiry?.date || activeJob.createdAt).toLocaleDateString('id-ID')}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(activeJob.customerName)}</span></div><div class="meta-row"><span class="label">Job/Vessel Call ID</span><span class="colon">:</span><span>${activeJob.jobId}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(activeJob.portName)}</span></div><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(activeJob.vesselName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${escapeHtml(activeJob.eta || '')}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${escapeHtml(activeJob.grt || activeJob.inquiry?.quantity || '')}</span></div></div></div><table><thead><tr><th style="width:7%">NO.</th><th>DESCRIPTION</th><th style="width:20%">AMOUNT IDR</th><th style="width:20%">REMARKS</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="2" style="text-align:right">GRAND TOTAL</td><td style="text-align:right">${amount(total)}</td><td></td></tr></tbody></table><div class="sign"><div>Banjarjarmasin, ${new Date().toLocaleDateString('id-ID')}</div><div style="margin-top:16px">PT. Lentera Global Maritim</div></div><div class="footer">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span class="contact" style="color:#dc2626;text-decoration:underline">email : <a style="color:#dc2626" href="mailto:maritim@lentera-global.com">maritim@lentera-global.com</a> / web : <span style="color:#dc2626">www.lentera-global.com</span></span></div></body></html>`;
  };

  const previewEPDA = () => {
    const vessel = vessels.find((item) => item.id === activeJob.vesselId);
    const dynamicTableHeader = `<th style="width:5%">NO.</th><th style="width:20%">DESCRIPTION</th><th style="width:35%">TARIFF</th><th style="width:12%">AMOUNT ${viewCurrency}</th><th style="width:28%">REMARKS</th>`;
    const inquiryMeta = `<div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No EPDA</span><span class="colon">:</span><span>${fdaEpdaDisplayNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${new Date(activeJob.inquiry?.date || activeJob.createdAt).toLocaleDateString('id-ID')}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${activeJob.customerName}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vessel?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${activeJob.portName}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${activeJob.eta || '-'}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${activeJob.vesselName}</span></div><div class="meta-row"><span class="label">Estimated Day</span><span class="colon">:</span><span>${activeJob.inquiry?.estimatedDays || '-'}</span></div><div class="meta-row"><span class="label">Flag</span><span class="colon">:</span><span>${vessel?.flag || '-'}</span></div><div class="meta-row"><span class="label">Cargo Details</span><span class="colon">:</span><span>${activeJob.inquiry?.cargoDetails || '-'}</span></div><div class="meta-row"><span class="label">IMO</span><span class="colon">:</span><span>${vessel?.imoNumber || '-'}</span></div></div></div>`;
    const compactHtml = buildEPDAHtml().replaceAll('>CURRENCY<', '>TARIFF<').replace('</style>', '@page{size:A4;margin:7mm}body{font-size:9px}.brand-row{margin-bottom:5px}.brand-wrap{min-height:55px;gap:10px}.logo{width:70px;height:52px}.brand{font-size:17px}.tag{font-size:10px;margin-top:2px}h2{font-size:10px;padding:4px;margin:5px 0 7px}.meta{gap:1px 20px;margin-bottom:6px}.meta-col{gap:1px}.meta-row{line-height:1.15}.meta-row .label{font-size:9px}table{page-break-inside:avoid;table-layout:fixed}table th:first-child,table td:first-child{width:5%}table th:nth-child(2),table td:nth-child(2){width:38%}table th:nth-child(3),table td:nth-child(3){width:12%}table th:nth-child(4),table td:nth-child(4){width:17%}table th:nth-child(5),table td:nth-child(5){width:28%}tr{page-break-inside:avoid}th,td{padding:3px 4px;font-size:8px}.bank{margin-top:10px;padding:5px;font-size:7px;line-height:1.2}.footer{margin-top:7px;font-size:8px;line-height:1.2}</style>')
      .replace('<th style="width:7%">NO.</th><th>DESCRIPTION</th><th style="width:20%">AMOUNT IDR</th><th style="width:20%">REMARKS</th>', dynamicTableHeader)
      .replace('<tr class="grand"><td colspan="2" style="text-align:right">GRAND TOTAL</td><td style="text-align:right">', '<tr class="grand"><td colspan="3" style="text-align:right">GRAND TOTAL</td><td style="text-align:right">')
      .replace(/<div class="sign">[\s\S]*?<\/div>/, '')
      .replace(/<div class="meta">[\s\S]*?(?=<table(?:\s|>))/i, inquiryMeta)
      .replaceAll('>No.</span>', '>No EPDA</span>');
    const windowRef = window.open('', '_blank', 'width=900,height=1100');
    if (!windowRef) return;
    windowRef.document.write(compactHtml.replaceAll('.meta-col.right{justify-self:stretch}', '.meta-col.right{justify-self:end;width:100%;padding-left:0;transform:translateX(35%)}'));
    windowRef.document.close();
  };

  const buildFDAHtml = () => {
    const formatMoney = (value: number, currency: 'USD' | 'IDR' = 'USD') => {
      if (currency === 'IDR') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
      }
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    };

    const categoryOrder = Array.from(new Set(actualList.map((it) => it.category || 'UNKNOWN')));
    const groups = actualList.reduce<Record<string, ActualCostItem[]>>((acc, item) => {
      const key = item.category || 'UNKNOWN';
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
    const grandCurrency = actualList[0]?.currency || viewCurrency || 'USD';
    const amountHeaderLabel = `AMOUNT ${grandCurrency}`;

    const groupHtml = categoryOrder.map((category) => {
      const rows = groups[category] || [];
      const subtotal = rows.reduce((sum, it) => sum + (it.amount || 0), 0);
      const currency = rows[0]?.currency || 'USD';
      const safeCategory = String(category ?? 'UNKNOWN');
      return `<tr class="section"><td colspan="5">${safeCategory.replace(/_/g, ' ')}</td></tr>${rows.map((it, i) => `<tr class="item-row"><td style="text-align:center">${i + 1}</td><td>${it.description}</td><td style="text-align:center">${getActualTariff(it)}</td><td style="text-align:right">${formatMoney(it.amount, it.currency || 'USD')}</td><td>${it.remarks || ''}</td></tr>`).join('')}<tr class="subtotal"><td colspan="3" style="text-align:right">SUB TOTAL</td><td class="amount" style="text-align:right">${formatMoney(subtotal, currency)}</td><td></td></tr>`;
    }).join('');

    const rowMeta = `<div><b>Date</b> : ${activeJob.fda?.date || new Date().toLocaleDateString('id-ID')}</div><div><b>Number</b> : ${fdaNo}</div><div><b>To</b> : ${activeJob.customerName}</div><div><b>Vessel</b> : ${activeJob.vesselName}</div><div><b>TA / TD</b> : ${activeJob.eta}</div><div><b>Port</b> : ${activeJob.portName}</div><div><b>Job ID</b> : ${activeJob.jobId}</div><div><b>Next Port</b> : -</div>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>${fdaNo}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}.brand-row{text-align:center;margin-bottom:10px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:76px;height:58px;object-fit:contain}.brand{font-weight:700;font-size:21px;line-height:1.15}.muted{color:#666;font-size:13px;margin-top:5px}.brand-row .muted{font-size:13px}.document-title{text-align:center;background:#182a50;color:#fff;padding:8px;font-size:13px;margin:18px 0 12px}.meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 34px;margin-bottom:12px}.meta-col{display:flex;flex-direction:column;gap:4px}.meta-row{display:grid;grid-template-columns:85px 10px minmax(0,1fr);line-height:1.35}.meta-row .label{font-weight:700}.meta-row .colon{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 7px}th{text-align:center;background:#e8ecf2}.section td{background:#4b5563;color:#fff;font-weight:700;text-align:left;text-transform:uppercase}.subtotal{font-weight:700;background:#f1f3f6}.grand{font-weight:800;font-size:11px}.amount{text-align:right}.bank{margin-top:18px;border:1px solid #777;padding:10px}.footer{margin-top:22px;text-align:center;font-size:8px;line-height:1.45;color:#111;font-weight:600}.footer .contact{color:#e11d48;text-decoration:underline}</style></head><body><div class="brand-row"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="muted">Seamless Agent, Global Reach</div></div></div></div><h2 class="document-title">Final Disbursement Account (FDA)</h2><div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">Date</span><span class="colon">:</span><span>${activeJob.fda?.date || new Date().toLocaleDateString('id-ID')}</span></div><div class="meta-row"><span class="label">Number</span><span class="colon">:</span><span>${fdaNo}</span></div><div class="meta-row"><span class="label">To</span><span class="colon">:</span><span>${activeJob.customerName}</span></div><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${activeJob.vesselName}</span></div></div><div class="meta-col"><div class="meta-row"><span class="label">TA / TD</span><span class="colon">:</span><span>${activeJob.eta}</span></div><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${activeJob.portName}</span></div><div class="meta-row"><span class="label">Job ID</span><span class="colon">:</span><span>${activeJob.jobId}</span></div><div class="meta-row"><span class="label">Next Port</span><span class="colon">:</span><span>-</span></div></div></div><table><thead><tr><th style="width:6%">NO.</th><th>DESCRIPTION</th><th style="width:15%">CURRENCY</th><th style="width:23%">AMOUNT</th><th>REMARKS</th></tr></thead><tbody>${groupHtml}<tr class="grand"><td colspan="3" style="text-align:right">GRAND TOTAL</td><td class="amount">${formatMoney(totalActualBuy, grandCurrency)}</td><td></td></tr></tbody></table><div class="bank"><b>Please kindly remit to our Bank Account</b><br>PT. Lentera Global Maritim - Finance</div><div class="footer"><div>Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan</div><div>Kota Adm Jakarta Selatan, DKI Jakarta - 12810</div><div class="contact">email : <a style="color:#e11d48" href="mailto:maritim@lentera-global.com">maritim@lentera-global.com</a> / web : <span>www.lentera-global.com</span></div></div></body></html>`;
  };

  const buildFDAHtmlSalesTemplate = (print: boolean) => {
    const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const orderedActualList = [...actualList];
    const categories = Array.from(new Set(orderedActualList.map((item) => item.category || 'UNKNOWN')));
    const groups = categories.map((category) => ({ category, items: orderedActualList.filter((item) => (item.category || 'UNKNOWN') === category) }));
    const money = (value: number, currency: 'USD' | 'IDR') => currency === 'IDR'
      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
      : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const rows = groups.map((group) => {
      const subtotal = group.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      return `<tr class="section"><td colspan="5" style="text-indent:1em">${escape(formatCategoryCost(String(group.category)))}</td></tr>${group.items.map((item, index) => { const currency = (item.currency || viewCurrency) as 'USD' | 'IDR'; return `<tr class="item-row"><td>${index + 1}</td><td>${escape(item.description)}</td><td>${escape(getActualTariff(item))}</td><td class="amount">${money(item.amount || 0, currency)}</td><td>${escape(item.remarks || '')}</td></tr>`; }).join('')}<tr class="subtotal"><td colspan="3">SUBTOTAL</td><td class="amount">${money(subtotal, (group.items[0]?.currency || viewCurrency) as 'USD' | 'IDR')}</td><td></td></tr>`;
    }).join('');
    const total = actualList.reduce((sum, item) => sum + (item.amount || 0), 0);
    const vessel = vessels.find((item) => item.id === activeJob.vesselId);
    const bank = viewCurrency === 'USD'
      ? '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK MANDIRI (Persero) Tbk</b><br>Address:<br>BANK MANDIRI TEBET SUPOMO<br>Jl. Prof. Dr.Supomo SH No 43, Tebet, RT.04/RW.03<br>Tebet barat , Kec. Tebet, Kota Jakarta Selatan,<br>Daerah Khusus Ibukota Jakarta 12810<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number (USD) : 120-00-5575599-0</b><br><b>Swift Code Bank : BMRIIDJAXXX</b></div><div class="signature"><div class="signature-main">Sincerely,<br>PT. Lentera Global Maritim</div><div class="signature-role">Finance</div></div>'
      : '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address:<br>BNI BIDAKARA<br>Jl. Gatot Subroto Kab 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-09</b><br><b>Swift Code Bank : BNINIDJAXXX</b></div><div class="signature"><div class="signature-main">Sincerely,<br>PT. Lentera Global Maritim</div><div class="signature-role">Finance</div></div>';
    const officeFooter = '<div class="office-footer" style="position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3;">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span style="color:#e11d48;text-decoration:underline">email : maritim@lentera-global.com / web : www.lentera-global.com</span></div>';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${fdaNo}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}html,body{margin:0;padding:0}.brand-row{text-align:center;margin:0 0 2px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:82px;height:62px;object-fit:contain}.brand{font-weight:700;font-size:21px;color:#3562a8}.tag{color:#3562a8;font-size:12px;margin-top:3px}.divider{border-bottom:2px solid #315db2;margin:6px 0 12px}.title-block{margin:0 0 10px}.title-block h2{text-align:center;background:#182a50;color:#fff;padding:5px;font-size:12px;margin:0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 28px;margin-bottom:4px}.meta-col{display:flex;flex-direction:column;gap:2px}.meta-row{display:grid;grid-template-columns:105px 8px minmax(0,1fr);line-height:1.25}.meta-col.right .meta-row{grid-template-columns:82px 8px minmax(0,1fr)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #9ca3af;padding:4px 5px}th{background:#dbe8f2;text-align:center;font-size:9px}th:nth-child(1),td:nth-child(1){width:5%;text-align:center}th:nth-child(2),td:nth-child(2){width:42%;text-align:left}th:nth-child(3),td:nth-child(3){width:8%;text-align:center}th:nth-child(4),td:nth-child(4){width:17%;text-align:right;white-space:nowrap}th:nth-child(5),td:nth-child(5){width:28%;text-align:left}.section td{background:#808080;color:#fff;font-weight:700;text-align:left;text-transform:uppercase}.subtotal{background:#dbe8f2;font-weight:700}.subtotal td:first-child{text-align:right}.amount{text-align:right;white-space:nowrap}.grand{background:#dbe8f2;font-weight:800;color:#f00}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.footer{margin-top:22px;text-align:center;font-size:9px;line-height:1.45;font-weight:600}.footer span{color:#e11d48;text-decoration:underline}font-size:9px;line-height:1.35;font-weight:600}.footer span{color:#e11d48;text-decoration:underline}</style></head><body><div class="brand-row"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>FINAL DISBURSEMENT ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><b>No FDA</b><span>:</span><span>${escape(fdaNo)}</span></div><div class="meta-row"><b>Date Inquiry</b><span>:</span><span>${escape(activeJob.inquiry?.date || '-')}</span></div><div class="meta-row"><b>Principal</b><span>:</span><span>${escape(activeJob.customerName)}</span></div><div class="meta-row"><b>GRT</b><span>:</span><span>${vessel?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><b>Port</b><span>:</span><span>${escape(activeJob.portName)}</span></div><div class="meta-row"><b>ETA</b><span>:</span><span>${escape(activeJob.eta || '-')}</span></div></div><div class="meta-col right"><div class="meta-row"><b>Vessel</b><span>:</span><span>${escape(activeJob.vesselName)}</span></div><div class="meta-row"><b>Estimated Day</b><span>:</span><span>${activeJob.inquiry?.estimatedDays || '-'}</span></div><div class="meta-row"><b>Flag</b><span>:</span><span>${escape(vessel?.flag || '-')}</span></div><div class="meta-row"><b>Cargo Details</b><span>:</span><span>${escape(activeJob.inquiry?.cargoDetails || '-')}</span></div><div class="meta-row"><b>IMO</b><span>:</span><span>${escape(vessel?.imoNumber || '-')}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>CURRENCY</th><th>AMOUNT</th><th>REMARKS</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="3">GRAND TOTAL</td><td class="amount">${money(total, viewCurrency)}</td><td></td></tr></tbody></table>${bank}${officeFooter}</body></html>`;
  };

  const buildFDAResultDocument = () => {
    const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const money = (value: number, _code: 'USD' | 'IDR') => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const categories = Array.from(new Set(actualList.map((item) => item.category || 'UNKNOWN')));
    const rows = categories.map((category) => {
      const items = actualList.filter((item) => (item.category || 'UNKNOWN') === category);
      const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
      const itemRows = items.map((item, index) => { const code = (item.currency || viewCurrency) as 'USD' | 'IDR'; return `<tr><td>${index + 1}</td><td>${escape(item.description)}</td><td>${code}</td><td class="amount">${money(item.amount || 0, code)}</td><td>${escape(item.remarks || '')}</td></tr>`; }).join('');
      return `<tr class="section"><td colspan="5">${escape(formatCategoryCost(String(category)))}</td></tr>${itemRows}<tr class="subtotal"><td colspan="3">SUB TOTAL</td><td class="amount">${money(subtotal, (items[0]?.currency || viewCurrency) as 'USD' | 'IDR')}</td><td></td></tr>`;
    }).join('');
    const total = actualList.reduce((sum, item) => sum + (item.amount || 0), 0);
    const vessel = vessels.find((item) => item.id === activeJob.vesselId);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${fdaNo}</title><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;color:#172033;font-size:10px}.brand{text-align:center;margin-bottom:8px}.brand-wrap{display:inline-flex;align-items:center;gap:12px;text-align:left}.logo{width:78px;height:58px;object-fit:contain}.brand-name{font-size:20px;font-weight:700;color:#3562a8}.tagline{font-size:11px;color:#3562a8;margin-top:3px}.divider{border-bottom:2px solid #315db2;margin:6px 0 10px}.title-block{margin:0 0 8px}.title-block h2{margin:0;background:#214f84;color:#fff;text-align:center;padding:5px;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 28px;margin-bottom:9px}.meta-col{display:flex;flex-direction:column;gap:2px}.meta-row{display:grid;grid-template-columns:105px 8px minmax(0,1fr);line-height:1.25}.right .meta-row{grid-template-columns:82px 8px minmax(0,1fr)}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #9ca3af;padding:4px 5px}th{background:#dbe8f2;text-align:center;font-size:9px}th:nth-child(1),td:nth-child(1){width:5%;text-align:center}th:nth-child(2),td:nth-child(2){width:42%;text-align:left}th:nth-child(3),td:nth-child(3){width:8%;text-align:center}th:nth-child(4),td:nth-child(4){width:17%;text-align:right;white-space:nowrap}th:nth-child(5),td:nth-child(5){width:28%;text-align:left}.section td{background:#808080;color:#fff;font-weight:700;text-align:left;text-transform:uppercase}.subtotal{background:#dbe8f2;font-weight:700}.grand{background:#dbe8f2;color:#f00;font-weight:800}.amount{text-align:right;white-space:nowrap}.bank{display:inline-block;width:42%;margin-top:16px;border:1px solid #777;padding:8px;font-size:8px;line-height:1.3;vertical-align:top}.signature{display:inline-block;width:42%;margin:52px 0 0 12%;text-align:center;vertical-align:top;font-size:9px;padding-top:8px}.footer{margin-top:16px;text-align:center;font-size:9px;line-height:1.35;font-weight:600}.footer span{color:#e11d48;text-decoration:underline}</style></head><body><div class="brand"><div class="brand-wrap"><img class="logo" src="/lenteraglobalmaritim/lgm-logo.png"><div><div class="brand-name">PT Lentera Global Maritim</div><div class="tagline">Seamless Agent, Global Reach</div></div></div></div><h2>FINAL DISBURSEMENT ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><b>No FDA</b><span>:</span><span>${escape(fdaNo)}</span></div><div class="meta-row"><b>Date Inquiry</b><span>:</span><span>${escape(activeJob.inquiry?.date || '-')}</span></div><div class="meta-row"><b>Principal</b><span>:</span><span>${escape(activeJob.customerName)}</span></div><div class="meta-row"><b>GRT</b><span>:</span><span>${vessel?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><b>Port</b><span>:</span><span>${escape(activeJob.portName)}</span></div><div class="meta-row"><b>ETA</b><span>:</span><span>${escape(activeJob.eta || '-')}</span></div></div><div class="meta-col right"><div class="meta-row"><b>Vessel</b><span>:</span><span>${escape(activeJob.vesselName)}</span></div><div class="meta-row"><b>Estimated Day</b><span>:</span><span>${activeJob.inquiry?.estimatedDays || '-'}</span></div><div class="meta-row"><b>Flag</b><span>:</span><span>${escape(vessel?.flag || '-')}</span></div><div class="meta-row"><b>Cargo Details</b><span>:</span><span>${escape(activeJob.inquiry?.cargoDetails || '-')}</span></div><div class="meta-row"><b>IMO</b><span>:</span><span>${escape(vessel?.imoNumber || '-')}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>CURRENCY</th><th>AMOUNT</th><th>REMARKS</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="3">GRAND TOTAL</td><td class="amount">${money(total, viewCurrency)}</td><td></td></tr></tbody></table><div class="bank">Please kindly remit to our Bank Account<br>Bank Account Detail of PT. Lentera Global Maritim asf:<br><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address: BNI Bidakara<br>Jl. Gatot Subroto Kav 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, DKI Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-69</b><br><b>Swift Code Bank : BNIIDNAXXX</b></div><div class="signature">Sincerely,<br>PT. Lentera Global Maritim<br><br><br>Finance</div><div class="footer">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span>email : maritim@lentera-global.com / web : www.lentera-global.com</span></div></body></html>`;
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
    const currentFDAFallback = new Date().toLocaleDateString('id-ID');
    const formattedFDAFallback = formatDateDisplay(activeJob.fda?.date || new Date().toISOString().slice(0, 10));
    return html
      .replaceAll(new Date(inquiryDate).toLocaleDateString('id-ID'), formatDateDisplay(inquiryDate))
      .replaceAll(activeJob.fda?.date || currentFDAFallback, formattedFDAFallback);
  };

  const normalizeFDAExportLayoutBase = (html: string) => pushFinanceSignatureDown(formatFDAExportDates(html.replaceAll('>CURRENCY<', '>TARIFF<').replace('</style>', 'h2{background:#28598e!important;color:#fff!important;text-align:center!important}.section td{background:#566270!important;color:#fff!important}.subtotal,.grand{background:#dbe8f2!important}.grand{color:#f00!important}.bank,.signature{box-sizing:border-box}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}.meta-col.right{justify-self:end;width:100%;padding-left:0;transform:translateX(35%)}table th:nth-child(2),table td:nth-child(2){width:20%!important}table th:nth-child(3),table td:nth-child(3){width:35%!important;text-align:center!important;white-space:nowrap}table th:nth-child(4),table td:nth-child(4){width:12%!important;white-space:nowrap}</style>')));

  const normalizeFDAExportLayout = (html: string) => normalizeFDAExportLayoutBase(html).replace('</style>', 'table th{text-align:center!important}table tr.item-row td:nth-child(1){text-align:center!important}table tr.item-row td:nth-child(2),table tr.item-row td:nth-child(5){text-align:left!important}table tr.item-row td:nth-child(3){text-align:center!important}table tr.item-row td:nth-child(4){text-align:right!important}table tr.section td{text-align:left!important}table tr.subtotal td:first-child{font-weight:700;text-align:right!important}table tr.grand td:first-child{text-align:right!important}table tr.subtotal td.amount,table tr.grand td.amount{font-variant-numeric:tabular-nums;text-align:right!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}</style>');

  const openFDAWindow = (print = false) => {
    const onePageHtml = pushFinanceSignatureDown(buildFDAHtmlSalesTemplate(false).replace('</style>', '@page{size:A4;margin:14mm}body{font-size:9px}.brand-row{margin:0 0 2px}.brand-wrap{min-height:48px;gap:10px}.logo{width:70px;height:52px}.brand{font-size:17px}.tag{font-size:10px;margin-top:2px}h2{font-size:10px;padding:4px;margin:2px 0 4px}.meta{gap:1px 20px;margin-bottom:3px}.meta-col{gap:1px}.meta-row{line-height:1.15}.meta-row .label{font-size:9px}table{page-break-inside:avoid;table-layout:fixed}table th:first-child,table td:first-child{width:5%;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:42%;text-align:center!important}table th:nth-child(3),table td:nth-child(3){width:8%;text-align:center!important}table th:nth-child(4),table td:nth-child(4){width:17%;text-align:center!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%;text-align:center!important}tr{page-break-inside:avoid}th,td{padding:3px 4px;font-size:8px}.subtotal td:first-child,.grand td:first-child{font-weight:700;text-align:center!important}.subtotal td.amount,.grand td.amount,.subtotal td:nth-child(2),.grand td:nth-child(2){font-variant-numeric:tabular-nums;text-align:center!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}.section td{padding-left:0!important}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:22px;padding-top:4px}.office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:8px;line-height:1.2;font-weight:600;color:#111;z-index:3}.office-footer span{color:#e11d48;text-decoration:underline}</style>'));
    const windowRef = window.open('', '_blank', 'width=900,height=1100');
    if (!windowRef) return;
    windowRef.document.write(normalizeFDAExportLayout(onePageHtml));
    windowRef.document.close();
    if (print) windowRef.onload = () => { windowRef.focus(); windowRef.print(); };
  };
  const printFDA = () => {
    const onePageHtml = pushFinanceSignatureDown(buildFDAHtmlSalesTemplate(true).replace('</style>', '@page{size:A4;margin:14mm}body{font-size:9px}.brand-row{margin:0 0 2px}.brand-wrap{min-height:48px;gap:10px}.logo{width:70px;height:52px}.brand{font-size:17px}.tag{font-size:10px;margin-top:2px}h2{font-size:10px;padding:4px;margin:2px 0 4px}.meta{gap:1px 20px;margin-bottom:3px}.meta-col{gap:1px}.meta-row{line-height:1.15}.meta-row .label{font-size:9px}table{page-break-inside:avoid;table-layout:fixed}table th:first-child,table td:first-child{width:5%;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:42%;text-align:center!important}table th:nth-child(3),table td:nth-child(3){width:8%;text-align:center!important}table th:nth-child(4),table td:nth-child(4){width:17%;text-align:center!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%;text-align:center!important}tr{page-break-inside:avoid}th,td{padding:3px 4px;font-size:8px}.subtotal td:first-child,.grand td:first-child{font-weight:700;text-align:center!important}.subtotal td.amount,.grand td.amount,.subtotal td:nth-child(2),.grand td:nth-child(2){font-variant-numeric:tabular-nums;text-align:center!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}.section td{padding-left:0!important}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:22px;padding-top:4px}.office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:8px;line-height:1.2;font-weight:600;color:#111;z-index:3}.office-footer span{color:#e11d48;text-decoration:underline}</style>'));
    setPreviewDocument(normalizeFDAExportLayout(onePageHtml));
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
    const rows = actualList.map((it, i) => [i + 1, it.description, getActualTariff(it), it.amount, it.vendorName || '']);
    const text = [['NO','DESCRIPTION','TARIFF','AMOUNT','REMARKS'],...rows,['','','GRAND TOTAL',totalActualBuy,'']].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join('\t')).join('\n');
    const blob=new Blob([text],{type:'application/vnd.ms-excel;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${fdaNo.replaceAll('/','-')}.xls`; a.click(); URL.revokeObjectURL(url);
  };




  const handleFinalizeFDA = () => {
    const guard = db.canFinalizeFDA(activeJob.jobId);
    if (!guard.ok) {
      setMsg(guard.message || 'FDA belum dapat difinalisasi.');
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    const totalActualBuyLogged = totalActualBuy > 0 ? totalActualBuy : activeJob.quotation?.pda?.totalBuyRate || 0;
    const rawTotalActualBilled = totalActualBuy > 0 ? totalActualBuy : totalQuotedPDA;
    const invoicePrecision = viewCurrency === 'IDR' ? 1 : 100;
    const totalActualBilled = Math.round((rawTotalActualBilled + Number.EPSILON) * invoicePrecision) / invoicePrecision;
    const variance = totalActualBilled - totalActualBuyLogged;
    const exchangeRate = effectiveExchangeRate;
    const totalBilledUSD = Math.round(((viewCurrency === 'USD' ? totalActualBilled : totalActualBilled / exchangeRate) + Number.EPSILON) * 100) / 100;
    const totalBilledIDR = Math.round((viewCurrency === 'IDR' ? totalActualBilled : totalActualBilled * exchangeRate) + Number.EPSILON);

    const now = new Date().toISOString();
    const branchRef = getCurrentBranchName();
    const invoiceNo = buildBranchAwareInvoiceNumber(activeJob.jobId, branchRef, new Date(now));
    const fdaNoGenerated = buildBranchAwareFDANumber(activeJob.jobId, branchRef, new Date(now));
    const apFromActual = activeJob.ap?.length ? activeJob.ap : activeJob.actualCosts.map((it, idx) => ({
      id: `AP-${activeJob.jobId}-${idx + 1}`, jobId: activeJob.jobId, voucherNo: it.invoiceOrVoucherNo || `PV-${activeJob.jobId}-${idx + 1}`,
      vendorName: it.vendorName || 'Vendor / Instansi', description: it.description, invoiceDate: it.date,
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), amount: it.amount, currency: it.currency, status: 'UNPAID' as const,
    }));
    const arFromInvoice = activeJob.ar?.length ? activeJob.ar : [{
      id: `AR-${activeJob.jobId}-001`, jobId: activeJob.jobId, referenceNo: invoiceNo, principalName: activeJob.customerName,
      description: `FDA ${activeJob.jobId}`, requestedAmount: totalActualBilled, receivedAmount: 0, currency: viewCurrency, status: 'AWAITING_REMITTANCE' as const,
    }];

    const submitted = db.submitFDAForManager(activeJob.jobId, {
      fda: { ...activeJob.fda, fdaNo: fdaNoGenerated, date: now.slice(0, 10), currency: viewCurrency, exchangeRateUSDToIDR: exchangeRate,
        totalActualCost: totalActualBuyLogged, totalEstimatedBuy: activeJob.quotation.epda.totalBuyRate, totalEstimatedSell: activeJob.quotation.pda.totalSellRate || activeJob.quotation.epda.totalSellRate,
        finalBilledToPrincipal: totalActualBilled, varianceAmount: variance, variancePercentage: totalActualBilled > 0 ? (variance / totalActualBilled) * 100 : 0,
        fdaApproved: false, notes: 'FDA dikirim untuk approval Manager Ops.' },
      ap: apFromActual, ar: arFromInvoice,
      principalInvoice: { ...activeJob.principalInvoice, invoiceNo, invoiceDate: now.slice(0, 10),
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

  return (
    <div className="space-y-6 fda-form-root" aria-readonly={isFDAReadOnly}>
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <FileCheck2 className="w-4 h-4" />
            <span>FINAL DISBURSEMENT ACCOUNT (FDA)</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">
            FDA PORTAL
          </h1>
          <p className="text-xs text-slate-400">
            Finalisasi biaya aktual berdasarkan Job/Vessel Call ID, lalu diteruskan ke Finance.
          </p>
        </div>

        {/* Navigation is handled by the role sidebar. */}
      </div>

      {msg && (
        <div className="p-3 bg-cyan-500/20 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs flex items-center gap-2">
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-bold text-cyan-400 uppercase">FDA / JOB ID</div>
                <h2 className="text-xl font-black text-white mt-1">Job Vessel Siap Diproses FDA</h2>
              </div>
              <span className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 text-xs font-bold">{filteredJobList.filter(j => j.managerApproval?.status === 'APPROVED').length} Vessel Call</span>
            </div>

            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
              <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex items-center">
                    <select
                      value={jobMonthFilter || monthOptions[0] || ''}
                      onChange={(e) => setJobMonthFilter(e.target.value)}
                      className="h-12 min-w-[180px] appearance-none rounded-full border border-slate-600 bg-slate-900 px-4 pr-10 text-sm font-medium text-slate-200 outline-none ring-0 transition focus:border-cyan-400"
                    >
                      <option value="ALL">Semua Bulan</option>
                      {monthOptions.length > 0 ? monthOptions.map((monthLabel) => (
                        <option key={monthLabel} value={monthLabel}>{monthLabel}</option>
                      )) : <option value="">Pilih Bulan</option>}
                    </select>
                    <span className="pointer-events-none absolute right-3 text-slate-400">▾</span>
                  </div>
                  <div className="flex flex-1 items-center gap-3 rounded-full border border-slate-600 bg-slate-900 px-4 h-12 shadow-inner shadow-slate-950/30 md:min-w-[520px]">
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
                    <th className="p-3">Job ID</th>
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
                      <td className="p-3">
                        <button
                          onClick={() => { onSelectJob(j.jobId); setSubTab('ACTUAL_COST'); }}
                          className="font-mono font-bold text-cyan-300 hover:text-cyan-200 hover:underline"
                        >
                          {j.jobId}
                        </button>
                      </td>
                      <td className="p-3 font-bold text-white">{j.vesselName}</td>
                      <td className="p-3 text-slate-300">{j.customerName}</td>
                      <td className="p-3 text-slate-200">{j.eta || '-'}</td>
                      <td className="p-3 text-slate-200">{j.etd || '-'}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => { onSelectJob(j.jobId); setSubTab('ACTUAL_COST'); }}
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
                value: formatAccountingNumber(totalCost, 'IDR'),
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
                <p className="mt-1 text-xs text-slate-400">Vessel call dengan EPDA yang telah disetujui Manager OPS.</p>
              </div>
              <span className="rounded-lg bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">{approvedJobs.length} Vessel Call</span>
            </div>

            <div className="overflow-visible rounded-xl border border-slate-800">
              <table className="w-full min-w-[900px] text-left text-xs [&_th]:text-left [&_td]:text-left">
                <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="p-3">No</th>
                    <th className="whitespace-nowrap p-3">Inquiry</th>
                    <th className="p-3">Date Created Inquiry</th>
                    <th className="whitespace-nowrap p-3">Job ID</th>
                    <th className="p-3">Vessel</th>
                    <th className="p-3">IMO</th>
                    <th className="p-3">GT</th>
                    <th className="p-3">Customer / Principal</th>
                    <th className="p-3">Port</th>
                    <th className="p-3">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {approvedJobs.map((job, index) => (
                    <tr key={job.jobId} className="transition-colors hover:bg-slate-800/50">
                      <td className="p-3 font-mono font-bold text-slate-400">{index + 1}</td>
                      <td className="whitespace-nowrap p-3 font-mono font-bold text-cyan-300">{job.inquiry.inquiryNo}</td>
                      <td className="p-3 whitespace-nowrap text-slate-300">{formatInquiryDate(job.inquiry.date)}</td>
                      <td className="whitespace-nowrap p-3 font-mono font-bold text-blue-300">{job.jobId}</td>
                      <td className="p-3 font-bold text-white">{job.vesselName}</td>
                      <td className="p-3 font-mono text-slate-300">{vessels.find((vessel) => vessel.id === job.vesselId)?.imoNumber || '-'}</td>
                      <td className="p-3 font-mono text-slate-300">{formatTariffNumber(vessels.find((vessel) => vessel.id === job.vesselId)?.grt)}</td>
                      <td className="p-3 text-slate-300">{job.customerName}</td>
                      <td className="p-3 text-slate-300">{job.portName}</td>
                      <td className="p-3 whitespace-nowrap text-slate-300">{job.eta || '-'}</td>
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

      {/* ACTUAL COST / CREATE FDA TAB */}
      {subTab === 'ACTUAL_COST' && (
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
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-1.5">
                <button
                  type="button"
                  disabled={isFDAReadOnly}
                  onClick={() => handleViewCurrencyChange('IDR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewCurrency === 'IDR' ? 'bg-emerald-600 text-white' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  IDR (Rp)
                </button>
                <button
                  type="button"
                  disabled={isFDAReadOnly}
                  onClick={() => handleViewCurrencyChange('USD')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewCurrency === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  USD ($)
                </button>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                Kurs USD
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={exchangeRateInput}
                  readOnly={isFDAReadOnly}
                  onChange={(e) => handleExchangeRateChange(e.target.value)}
                  className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-white"
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
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
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
              <span className="text-xs uppercase font-bold text-slate-400">Grand Total</span>
              <b className="mt-1 block break-all text-sm font-mono leading-tight text-emerald-300 sm:text-base lg:text-lg">
                {viewCurrency === 'IDR'
                  ? formatAccountingNumber(totalActualBuy, 'IDR')
                  : formatUSD(totalActualBuy)}
              </b>
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
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETA</div><div className="mt-1 font-bold text-white font-mono">{formatInquiryDate(activeJob.eta)}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETD</div><div className="mt-1 font-bold text-white font-mono">{formatInquiryDate(activeJob.etd)}</div></div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETA</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.etaRemarks || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETD</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.etdRemarks || '-'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Quantity</div><div className="mt-1 font-bold text-white">{activeJob.inquiry?.quantity || 0} {activeJob.inquiry?.quantityUnit || 'TON'}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Purpose</div><div className="mt-1 font-bold text-white">{activeJob.purposeOfCall || '-'}</div></div>

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
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white uppercase tracking-wider">Hasil FDA</h2>
                <span className="text-xs text-slate-400">Melihat hasil entry Final Cost FDA</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={previewEPDA} title="Review data hasil EPDA dari Sales" aria-label="Review data hasil EPDA dari Sales" className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5"/>Lihat Hasil EPDA</button>
                <button type="button" onClick={() => openFDAWindow(false)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5"/>Lihat Hasil FDA</button>
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

            <div className="overflow-visible">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5 border-l border-slate-700">No</th>
                    <th className="p-3.5 border-l border-slate-700">Description</th>
                    <th className="p-3.5 border-l border-slate-700">Tariff</th>
                    <th className="p-3.5 text-right border-l border-slate-700">Amount ({viewCurrency})</th>
                    <th className="p-3 border-l border-slate-700 text-center">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {fdaResultRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-5 text-center text-slate-400">Belum ada item biaya final FDA.</td>
                    </tr>
                  ) : fdaResultCategories.map((category) => {
                    const categoryRows = orderedFDAResultRows.filter((item) => item.category === category);
                    const categoryAmountTotal = categoryRows.reduce((sum, item) => sum + item.amount, 0);
                    const categoryCurrency = categoryRows[0]?.currency || viewCurrency;
                    return (
                      <React.Fragment key={category}>
                        <tr className="bg-slate-600 font-bold">
                          <td colSpan={5} style={{ color: '#fff', backgroundColor: '#4b5563', textIndent: '1em' }} className="border-l border-slate-700 p-2.5 text-left font-black uppercase tracking-[0.16em]">
                            {formatCategoryCost(category)}
                          </td>
                        </tr>
                        {categoryRows.map((it, idx) => (
                          <tr key={it.id} className="transition-colors hover:bg-slate-700/40">
                            <td className="border-l border-slate-800 p-3.5 font-mono text-slate-300">{idx + 1}</td>
                            <td className="border-l border-slate-800 p-3.5 font-bold text-white">{it.description}</td>
                            <td className="border-l border-slate-800 p-3.5 font-mono text-cyan-300">{it.tariff}</td>
                            <td className="border-l border-slate-800 p-3.5 text-right font-mono font-bold text-white">
                              <div className="flex items-center justify-end gap-2">
                                {editingResultAmountId === it.id ? (
                                  <>
                                    <input autoFocus inputMode="decimal" value={resultAmountDraft} onChange={(event) => setResultAmountDraft(event.target.value)} aria-label={`Amount ${it.description}`} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-right text-white" />
                                    <button type="button" onClick={() => saveResultAmount(it.id)} className="rounded p-1 text-emerald-300 hover:bg-emerald-500/20" title="Simpan amount" aria-label={`Simpan amount ${it.description}`}><Check className="h-4 w-4" /></button>
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
                                <span>{it.remarks}</span>
                                <div className="flex items-center gap-1">
                                  {!isFDAReadOnly && activeJob.managerApproval?.status === 'APPROVED' && editingResultAmountId !== it.id && <button type="button" onClick={() => startEditResultAmount(it)} className="rounded-md p-1.5 text-cyan-300 hover:bg-cyan-500/20" title="Edit amount" aria-label={`Edit amount ${it.description}`}><Pencil className="h-3.5 w-3.5" /></button>}
                                  {!isFDAReadOnly && <button type="button" onClick={() => deleteActualCost(it.id)} className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200" title="Hapus item FDA" aria-label={`Hapus ${it.description}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-950/70 font-bold">
                          <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">SUB TOTAL</td>
                          <td className="border-l border-slate-800 p-2.5 text-right font-mono font-bold text-white">
                            {categoryCurrency === 'IDR'
                              ? formatAccountingNumber(categoryAmountTotal, 'IDR')
                              : formatAccountingNumber(categoryAmountTotal, 'USD')}
                          </td>
                              <td className="border-l border-slate-800" />
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {fdaResultRows.length > 0 && (
                    <tr className="bg-slate-950/80 font-bold">
                      <td colSpan={3} className="border-l border-slate-800 p-3 text-right font-black uppercase text-slate-200">GRAND TOTAL</td>
                      <td className="border-l border-slate-800 p-3 text-right font-mono font-black text-white">
                        {viewCurrency === 'IDR'
                          ? formatAccountingNumber(totalActualBuy, 'IDR')
                          : formatAccountingNumber(totalActualBuy, 'USD')}
                      </td>
                      <td className="border-l border-slate-800" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

            <div className="fda-entry-panel rounded-2xl border border-slate-300 bg-[#edf2f4] p-5 shadow-sm">
            <fieldset disabled={isFDAReadOnly} className="contents">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2 text-emerald-600">
                <Plus className="h-4 w-4" />
                <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">
                  {actualEntryMode === 'AUTO' ? 'Tambah Item FDA Otomatis' : 'Tambah Item FDA Manual'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setActualEntryMode('AUTO')} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${actualEntryMode === 'AUTO' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
                  Otomatis
                </button>
                <button type="button" onClick={() => setActualEntryMode('MANUAL')} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${actualEntryMode === 'MANUAL' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
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
                <div className="lg:col-span-2"><label className="mb-1 block text-slate-600">Item Service</label>{autoServiceOptions.length > 0 ? <select value={autoServiceOptionKey(newActual.description, newActual.category)} onChange={(e) => applySelectedAutoService(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"><option value="">Pilih item service</option>{autoServiceOptions.map((option) => <option key={autoServiceOptionKey(option.name, option.category)} value={autoServiceOptionKey(option.name, option.category)}>{option.name}</option>)}</select> : <input required value={newActual.description} onChange={(e) => setNewActual({ ...newActual, description: e.target.value })} placeholder="Nama biaya final otomatis" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" />}</div>
                <div><label className="mb-1 block text-slate-600">Category Cost</label><select value={newActual.category} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="AGENCY_FEE">AGENCY FEE</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="TAX_CONTINGENCY">TAX &amp; CONTINGENCY</option><option value="VAT_11">VAT 11%</option><option value="PPH_INCOME_TAX">PPH / INCOME TAX</option></select></div>
                <div><label className="mb-1 block text-slate-600">Type</label><select value={newActual.tariffType} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="RANGE">Range</option></select></div>
                <div><label className="mb-1 block text-slate-600">Rate</label><input type="text" inputMode="decimal" readOnly value={formatRateAmount(Number(newActual.rate) || 0)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" /></div>
                <div><label className="mb-1 block text-slate-600">QTY</label><input type="number" min="1" value={actualQuantity} onChange={(e) => setActualQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" /></div>
                <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div><label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label><input readOnly value={formatAccountingNumber(autoTariffPreview, viewCurrency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" /></div>
                  <div><label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label><input readOnly value={formatAccountingNumber(actualAmount, viewCurrency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" /></div>
                </div>
                <div className="lg:col-span-6"><label className="mb-1 block text-slate-600">Remark</label><input value={newActual.notes} onChange={(e) => setNewActual({ ...newActual, notes: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" /></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-6">
                <div className="lg:col-span-2"><label className="mb-1 block text-slate-600">Item Service</label><input required value={newActual.description} onChange={(e) => setNewActual({ ...newActual, description: e.target.value })} placeholder="Nama biaya final manual" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" /></div>
                <div><label className="mb-1 block text-slate-600">Category Cost</label><select value={newActual.category} onChange={(e) => setNewActual({ ...newActual, category: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="AGENCY_FEE">AGENCY FEE</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="TAX_CONTINGENCY">TAX &amp; CONTINGENCY</option><option value="VAT_11">VAT 11%</option><option value="PPH_INCOME_TAX">PPH / INCOME TAX</option></select></div>
                <div><label className="mb-1 block text-slate-600">Type</label><select value={newActual.tariffType} onChange={(e) => setNewActual({ ...newActual, tariffType: e.target.value as 'FIXED' | 'VARIABLE' | 'RANGE' })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"><option value="FIXED">Fixed</option><option value="VARIABLE">Variabel</option><option value="RANGE">Range</option></select></div>
                <div><label className="mb-1 block text-slate-600">QTY</label><input type="number" min="1" value={actualQuantity} onChange={(e) => setActualQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" /></div>
                <div><label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label><input type="text" inputMode="decimal" placeholder="0.0000" value={manualTariffText} onChange={(e) => { const text = e.target.value; setManualTariffText(text); setNewActual({ ...newActual, amountBuy: parseTariffInput(text) }); }} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none" /></div>
                <div><label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label><input readOnly value={formatAccountingNumber(actualAmount, viewCurrency)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500" /></div>
                <div className="lg:col-span-6"><label className="mb-1 block text-slate-600">Remark</label><input value={newActual.notes} onChange={(e) => setNewActual({ ...newActual, notes: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" /></div>
              </div>
            )}

            <div className="mt-3 text-[10px] text-slate-500">
              {actualEntryMode === 'AUTO'
                ? 'Tarif VARIABLE otomatis dihitung dari GRT x rate, lalu dikalikan QTY.'
                : 'Untuk Type VARIABLE, amount dihitung dari GRT x tarif x QTY dan dicatat sebagai biaya final FDA.'}
            </div>
            </fieldset>
          </div>
        </div>
      )}

      {/* QUOTES VIEW TAB */}
      {subTab === 'QUOTES_VIEW' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">
              Quotes Reference (EPDA & PDA Asal)
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Perbandingan tarif kuotasi awal untuk memastikan biaya aktual sesuai dengan estimasi PDA yang disetujui
            </p>

            <div className="overflow-visible">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-3">Item Layanan PDA</th>
                    <th className="p-3">Kategori</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Quoted Buy</th>
                    <th className="p-3 text-right">Quoted Sell</th>
                    <th className="p-3 text-right">Margin Quoted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {activeJob.quotation?.pda?.items?.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-white">{it.name}</td>
                      <td className="p-3 text-slate-400">{it.category}</td>
                      <td className="p-3 text-right font-mono text-slate-300">{it.quantity}</td>
                      <td className="p-3 text-right font-mono text-slate-400">{formatUSD(it.totalBuyRate)}</td>
                      <td className="p-3 text-right font-mono text-cyan-300 font-bold">{formatUSD(it.totalSellRate)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400 font-bold">
                        +{formatUSD(it.totalSellRate - it.totalBuyRate)}
                      </td>
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
              Setelah seluruh actual cost lengkap, kirim FDA ke Manager Ops untuk approval. FDA yang disetujui diteruskan ke Finance.
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
                  <span className="text-slate-500 text-[10px] block">Total Biaya Vendor Riil (Modal)</span>
                  <span className="mt-1 block break-all text-sm font-bold leading-tight text-slate-200 sm:text-base">
                    {formatUSD(totalActualBuy > 0 ? totalActualBuy : activeJob.quotation?.pda?.totalBuyRate || 0)}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Total Tagihan ke Principal (FDA)</span>
                  <span className="mt-1 block break-all text-sm font-bold leading-tight text-slate-200 sm:text-base">
                    {formatUSD(totalQuotedPDA)}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Net Profit Margin</span>
                  <span className="mt-1 block break-all text-sm font-bold leading-tight text-emerald-400 sm:text-base">
                    +{formatUSD(totalQuotedPDA - (totalActualBuy > 0 ? totalActualBuy : activeJob.quotation?.pda?.totalBuyRate || 0))}
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
                    <button onClick={() => openFDAWindow(false)} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold transition flex items-center gap-2"><Eye className="w-4 h-4"/>Lihat Hasil FDA</button>
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
            <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); handleAddActualCost(); }} className="space-y-3 text-xs">
              <div><label className="text-slate-400 block mb-1">Description:</label><input type="text" required value={newActual.description} onChange={e=>setNewActual({...newActual,description:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"/></div>
              <div><label className="text-slate-400 block mb-1">Category:</label><select value={newActual.category} onChange={e=>setNewActual({...newActual,category:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"><option value="PORT_EXPENSES">PORT EXPENSES</option><option value="CLEARANCE">CLEARANCE IN/OUT</option><option value="GENERAL_EXPENSES">GENERAL EXPENSES</option><option value="CREW_EXPENSES">CREW EXPENSES</option><option value="AGENCY_FEE">AGENCY FEE</option><option value="OWNER_MATTER">OWNER MATTER</option><option value="TAX_CONTINGENCY">TAX &amp; CONTINGENCY</option><option value="VAT_11">VAT 11%</option><option value="PPH_INCOME_TAX">PPH / INCOME TAX</option></select></div>
              <div><label className="text-slate-400 block mb-1">Tarif ({viewCurrency}):</label><input type="text" inputMode="decimal" required value={formatTariffInput(newActual.amountBuy)} onChange={e=>setNewActual({...newActual,amountBuy:parseTariffInput(e.target.value),amountSellBilled:parseTariffInput(e.target.value)})} className="w-full bg-slate-950 border border-cyan-700 rounded-lg p-2.5 text-white font-mono text-lg"/></div>
              <div><label className="text-slate-400 block mb-1">Remark (opsional):</label><input value={newActual.notes} onChange={e=>setNewActual({...newActual,notes:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"/></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800"><button type="button" onClick={()=>{setShowAddActualModal(false);setEditingActualId(null)}} className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300">Batal</button><button type="submit" className="px-4 py-1.5 rounded-lg bg-cyan-600 text-white font-bold">Simpan Amount</button></div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

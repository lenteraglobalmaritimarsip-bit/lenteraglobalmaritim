import React, { useEffect, useRef, useState } from 'react';
import { getPublicLogoUrl } from '../../utils/logo';
import { FileSpreadsheet, Plus, Trash2, Save, Ship, Building, CheckCircle2, Download, Printer, Eye, Send, Pencil, Check, X } from 'lucide-react';
import { JobCall, DisbursementItem, Currency, User, Vessel, FixTariff, ExpensesItem, formatPurposeOfCall } from '../../types';
import { db } from '../../db/storage';
import { calculateTariffForJob, CalculationBasis, describeTariffFormula, describeTariffService, matchesTariffGRT, parseTariffNumber, formatTariffNumber, getTariffRateForCurrency, selectPreferredTariffOptions } from '../../utils/tariff';
import { formatCostCategoryLabel, getCostCategoryRank, normalizeCostCategory } from '../../utils/costCategories';
import { formatInquiryDate, todayISO } from '../../utils/date';
import { DateTimeInput } from '../shared/DateTimeInput';
import { findMatchingExpensesItem, findMatchingFixTariff } from '../../utils/masterDataIdentity';
import { createMasterItemSearchOptions, MasterItemSearch, MasterItemSearchOption } from '../shared/MasterItemSearch';

interface QuotesEPDAViewProps {
  job?: JobCall;
  vessels: Vessel[];
  onSelectJob: (jobId: string) => void;
  allJobs: JobCall[];
  users: User[];
  fixTariffs?: FixTariff[];
  expensesItems?: ExpensesItem[];
  onDataSaved?: () => void;
  printPreviewOnly?: boolean;
}

export const QuotesEPDAView: React.FC<QuotesEPDAViewProps> = ({ job, vessels, users, allJobs, fixTariffs = [], expensesItems = [], onDataSaved, printPreviewOnly = false }) => {
  if (!job) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-200">
        Data EPDA belum tersedia untuk job yang dipilih.
      </div>
    );
  }

  const epdaQuote = job.quotation?.epda || {
    quoteNo: '',
    date: job.createdAt?.slice(0, 10) || todayISO(),
    currency: job.currency || 'USD',
    items: [] as DisbursementItem[],
    totalAmount: 0,
    status: 'DRAFT' as const,
  };
  const toDateTimeInput = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace(' ', 'T').slice(0, 16);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const isManagerApproved = job.managerApproval?.status === 'APPROVED';
  const isEPDASubmitted = epdaQuote.status === 'SUBMITTED';
  const isReviewOnly = Boolean(job.voidedAt) || isManagerApproved || isEPDASubmitted || epdaQuote.status === 'APPROVED';
  const isEPDALockedInDatabase = () => {
    const currentJob = db.getJob(job.jobId);
    const currentEPDAStatus = currentJob?.quotation?.epda?.status;
    return !currentJob
      || Boolean(currentJob.voidedAt)
      || currentJob.managerApproval?.status === 'APPROVED'
      || currentEPDAStatus === 'SUBMITTED'
      || currentEPDAStatus === 'APPROVED';
  };
  const initialCurrency: Currency = epdaQuote.currency || job.currency || 'IDR';
  const [viewCurrency, setViewCurrency] = useState<Currency>(initialCurrency);
  const [items, setItems] = useState<DisbursementItem[]>(() => (epdaQuote.items || []).map((item) => ({
    ...item,
    currency: initialCurrency,
    amount: Number(item.amount || 0),
  })));
  const savedExchangeRate = job.quotation.epda.exchangeRateUSDToIDR;
  const [exchangeRate, setExchangeRate] = useState(() =>
    savedExchangeRate ? String(savedExchangeRate) : ''
  );
  useEffect(() => {
    setExchangeRate(savedExchangeRate ? String(savedExchangeRate) : '');
  }, [job.jobId, savedExchangeRate]);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSavingEPDANumber, setIsSavingEPDANumber] = useState(false);
  const [epdaNumberMigrationError, setEpdaNumberMigrationError] = useState('');
  const autoLoadAttemptedRef = useRef('');
  const currentJobIdRef = useRef(job.jobId);
  currentJobIdRef.current = job.jobId;
  const [epdaSchedule, setEpdaSchedule] = useState(() => ({
    eta: toDateTimeInput(epdaQuote.eta),
    etd: toDateTimeInput(epdaQuote.etd),
    etaRemarks: epdaQuote.etaRemarks || '',
    etdRemarks: epdaQuote.etdRemarks || '',
  }));
  const [isSavingEpdaSchedule, setIsSavingEpdaSchedule] = useState(false);
  const [epdaScheduleError, setEpdaScheduleError] = useState('');
  const [autoLoadMessage, setAutoLoadMessage] = useState('');
  const [autoLoadError, setAutoLoadError] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditDraft, setItemEditDraft] = useState({ description: '', tariff: '', amount: '', remarks: '' });
  const [itemEntryMode, setItemEntryMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualItemReference, setManualItemReference] = useState<MasterItemSearchOption | null>(null);
  const [autoSelectedItemKey, setAutoSelectedItemKey] = useState('');
  const manualTypeDefaultedRef = useRef(false);
  const [manualTariffText, setManualTariffText] = useState('');
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'PORT_EXPENSES',
    basis: 'Per Call / Lump Sum',
    quantity: 1,
    manualRate: 0,
    amount: 0,
    remarks: '',
    calculationBasis: 'PER_GRT' as CalculationBasis,
    tariffType: 'VARIABLE' as 'FIXED' | 'VARIABLE' | 'QTY_CARGO',
    rate: 0,
    minCharge: 0,
    vatApplied: false,
  });

  const formatAmount = (value: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const formatRateAmount = (value: number) =>
    new Intl.NumberFormat('en-US', { useGrouping: true, maximumFractionDigits: 8 }).format(value);

  const formatDate = (value: string) => {
    const datePart = value?.split('T')[0] || '';
    const [year, month, day] = datePart.split('-');
    return year && month && day ? `${day}-${month}-${year}` : value || '-';
  };
  const formatVesselDate = (value: string, includeTime = false) => {
    if (!value) return '-';
    const [datePart, timePart] = value.split(/[T ]/);
    const [year, month, day] = (datePart || '').split('-');
    if (!(year && month && day)) return value;
    const formattedDate = `${day}-${month}-${year}`;
    if (!includeTime || !timePart) return formattedDate;
    const [hour, minute] = timePart.split(':');
    return `${formattedDate} ${hour || '00'}:${minute || '00'}`;
  };
  const quoteDate = epdaQuote.date || job.createdAt;
  const inquiryEta = job.inquiry?.eta || job.eta;
  const inquiryEtd = job.inquiry?.etd || job.etd;
  const inquiryEtaDisplay = inquiryEta
    ? formatVesselDate(inquiryEta, true)
    : '-';
  const inquiryEtdDisplay = inquiryEtd
    ? formatVesselDate(inquiryEtd, true)
    : '-';
  const epdaEtaDisplay = epdaSchedule.eta
    ? formatVesselDate(epdaSchedule.eta, true)
    : epdaSchedule.etaRemarks || '-';
  const epdaEtdDisplay = epdaSchedule.etd
    ? formatVesselDate(epdaSchedule.etd, true)
    : epdaSchedule.etdRemarks || '-';
  const today = new Date();
  const todayDisplayDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

  const formatEntryAmount = (value: number | '') => {
    if (value === '') return '';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const parseEntryAmount = (value: string): number | '' => {
    if (!value.trim()) return '';
    const parsed = parseTariffNumber(value, Number.NaN);
    return Number.isFinite(parsed) ? parsed : '';
  };

  const totalAmount = Math.round((items.reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
  const epdaPph23Applied = epdaQuote.pph23Applied ?? items.some((item) => item.pph23Applied);
  const epdaGlobalVatApplied = epdaQuote.globalVatApplied ?? false;
  const categoryVatAmount = (categoryItems: DisbursementItem[]) => {
    if (epdaGlobalVatApplied) return 0;
    const taxableAmount = categoryItems.reduce((sum, item) =>
      sum + (item.vatApplied ? item.amount : 0), 0);
    return Math.round((taxableAmount * 0.11 + Number.EPSILON) * 100) / 100;
  };
  const creatorName = job.inquiry.createdBy.split(' (')[0].trim().toLowerCase();
  const creator = users.find((user) => user.name.trim().toLowerCase() === creatorName);
  const vesselMaster = vessels.find((vessel) => vessel.id === job.vesselId);
  const manualTariffPreview = calculateTariffForJob({
    vesselGRT: vesselMaster?.grt || 0,
    cargoQuantity: Number(job.inquiry?.cargoQuantity || 0),
    estimatedDays: Number(job.inquiry?.estimatedDays || 0),
    hours: 1,
    moveCount: 1,
    rate: Number(newItem.manualRate) || 0,
    minCharge: Number(newItem.minCharge) || 0,
    calculationBasis: newItem.calculationBasis,
    tariffType: newItem.tariffType,
  });
  const rateForCurrency = (currency: Currency, rateIDR: number | undefined, rateUSD: number | undefined, legacyRate: number, legacyCurrency?: Currency) => {
    return getTariffRateForCurrency(currency, rateIDR, rateUSD, legacyRate, legacyCurrency);
  };
  const existingEPDANo = job.quotation?.epda?.quoteNo || '';
  const legacyEPDANumber = /^EPDA-VC-(\d{4})-(\d{4})$/.exec(existingEPDANo);
  const epdaDateForNumber = quoteDate.slice(0, 10);
  const [epdaYear, epdaMonth] = epdaDateForNumber.split('-');
  const epdaBranchCode = (job.inquiry?.createdByBranch || 'JKT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'JKT';
  const migratedEPDANo = legacyEPDANumber && epdaYear && epdaMonth
    ? `${legacyEPDANumber[2]}/EPDA-LGM-${epdaBranchCode}/${epdaMonth}/${epdaYear}`
    : '';
  const epdaNo = migratedEPDANo || existingEPDANo || `EPDA-${job.jobId}`;

  useEffect(() => {
    setEpdaSchedule({
      eta: toDateTimeInput(job.quotation.epda.eta),
      etd: toDateTimeInput(job.quotation.epda.etd),
      etaRemarks: job.quotation.epda.etaRemarks || '',
      etdRemarks: job.quotation.epda.etdRemarks || '',
    });
  }, [job.jobId, job.quotation.epda.eta, job.quotation.epda.etd, job.quotation.epda.etaRemarks, job.quotation.epda.etdRemarks]);

  const saveEpdaSchedule = async (schedule: typeof epdaSchedule) => {
    setIsSavingEpdaSchedule(true);
    setEpdaScheduleError('');
    try {
      const currentJob = db.getJob(job.jobId);
      if (!currentJob) {
        setEpdaScheduleError('Job Quotes EPDA tidak ditemukan.');
        return;
      }
      const result = await db.updateJobAndPersist(job.jobId, {
        quotation: {
          ...currentJob.quotation,
          epda: {
            ...currentJob.quotation.epda,
            eta: schedule.eta,
            etd: schedule.etd,
            etaRemarks: schedule.etaRemarks,
            etdRemarks: schedule.etdRemarks,
          },
        },
      });
      if (!result.saved) {
        setEpdaScheduleError(result.error || 'Data jadwal Quotes EPDA gagal disimpan ke database.');
        return;
      }
      onDataSaved?.();
    } catch (error) {
      setEpdaScheduleError(error instanceof Error ? error.message : 'Data jadwal Quotes EPDA gagal disimpan ke database.');
    } finally {
      setIsSavingEpdaSchedule(false);
    }
  };

  useEffect(() => {
    const persistedSchedule = {
      eta: toDateTimeInput(job.quotation.epda.eta),
      etd: toDateTimeInput(job.quotation.epda.etd),
      etaRemarks: job.quotation.epda.etaRemarks || '',
      etdRemarks: job.quotation.epda.etdRemarks || '',
    };
    if (
      epdaSchedule.eta === persistedSchedule.eta
      && epdaSchedule.etd === persistedSchedule.etd
      && epdaSchedule.etaRemarks === persistedSchedule.etaRemarks
      && epdaSchedule.etdRemarks === persistedSchedule.etdRemarks
    ) return;

    const timeoutId = window.setTimeout(() => {
      void saveEpdaSchedule(epdaSchedule);
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [
    epdaSchedule.eta,
    epdaSchedule.etd,
    epdaSchedule.etaRemarks,
    epdaSchedule.etdRemarks,
    job.jobId,
    job.quotation.epda.eta,
    job.quotation.epda.etd,
    job.quotation.epda.etaRemarks,
    job.quotation.epda.etdRemarks,
  ]);

  useEffect(() => {
    if (!migratedEPDANo || migratedEPDANo === existingEPDANo) return;
    let active = true;
    setIsSavingEPDANumber(true);
    void db.updateJobAndPersist(job.jobId, {
      quotation: {
        ...job.quotation,
        epda: { ...job.quotation.epda, quoteNo: migratedEPDANo },
      },
    }).then((result) => {
      if (active) {
        setIsSavingEPDANumber(false);
        if (!result.saved) {
          setEpdaNumberMigrationError(result.error || 'Nomor EPDA baru gagal disimpan ke database.');
        }
      }
    }).catch((error: unknown) => {
      if (active) {
        setIsSavingEPDANumber(false);
        setEpdaNumberMigrationError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => { active = false; };
  }, [existingEPDANo, job.jobId, job.quotation, migratedEPDANo]);
  const portMatches = (portId?: string, portName?: string) => {
    const currentPortId = (job.portId || job.inquiry?.portId || '').trim();
    const currentPortName = (job.portName || job.inquiry?.portName || '').trim();
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
    const applicableFixTariffs = currentCurrencyFixTariffs
      .map((tariff) => ({ ...tariff, name: tariff.serviceName, category: tariff.costCategory || 'PORT_EXPENSES' }))
      .filter((tariff) => normalizeCostCategory(tariff.category) !== 'PORT_SERVICE'
        || matchesTariffGRT(vesselMaster?.grt, tariff.grtMin, tariff.grtMax));

    const options = selectPreferredTariffOptions([
    ...applicableFixTariffs
      .map((tariff) => ({
        name: tariff.serviceName,
        category: tariff.costCategory || 'PORT_EXPENSES',
        masterId: tariff.id,
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
        remarks: tariff.remarks || '',
      })),
    ...expensesItems
      .filter((item) =>
        portMatches(item.portId, item.portName)
        && rateForCurrency(currency, item.rateIDR, item.rateUSD, 0) > 0
      )
      .map((item) => ({
        name: item.name,
        category: item.category,
        masterId: item.id,
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
        remarks: item.remarks || '',
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

  useEffect(() => {
    if (printPreviewOnly || isReviewOnly || epdaQuote.items?.length) return;

    const currentJob = db.getJob(job.jobId);
    if (!currentJob || currentJob.quotation.epda.items.length) return;

    const currentImo = vessels.find((vessel) => vessel.id === job.vesselId)?.imoNumber.trim().toLowerCase();
    if (!currentImo) return;

    const previousQuotes = allJobs
      .filter((candidate) => candidate.jobId !== job.jobId)
      .filter((candidate) => vessels.find((vessel) => vessel.id === candidate.vesselId)?.imoNumber.trim().toLowerCase() === currentImo)
      .filter((candidate) => candidate.quotation?.epda?.items?.length)
      .sort((first, second) =>
        (second.quotation.epda.date || second.createdAt).localeCompare(first.quotation.epda.date || first.createdAt)
      )
      .map((candidate) => candidate.quotation.epda);
    if (!previousQuotes.length) return;

    const optionByService = new Map(autoServiceOptions.map((option) => [
      option.name.trim().toLowerCase(),
      option,
    ]));
    const previousItemsByService = new Map<string, DisbursementItem>();
    previousQuotes.forEach((quote) => quote.items.forEach((item) => {
      const serviceKey = item.name.trim().toLowerCase();
      if (!previousItemsByService.has(serviceKey)) previousItemsByService.set(serviceKey, item);
    }));
    const unmatchedHistoryNames: string[] = [];
    const refreshedItems = Array.from(previousItemsByService.values()).flatMap((previousItem, index) => {
      const option = optionByService.get(previousItem.name.trim().toLowerCase());
      if (!option) {
        unmatchedHistoryNames.push(previousItem.name);
        return [];
      }

      const quantity = Number(previousItem.quantity) || 1;
      const unitRate = calculateTariffForJob({
        vesselGRT: vesselMaster?.grt || 0,
        cargoQuantity: Number(job.inquiry?.cargoQuantity || 0),
        estimatedDays: Number(job.inquiry?.estimatedDays || 0),
        hours: 1,
        moveCount: 1,
        rate: option.rate,
        minCharge: option.minCharge,
        calculationBasis: option.calculationBasis,
        tariffType: option.tariffType,
      });
      const totalRate = unitRate * quantity;
      return [{
        ...previousItem,
        id: `ITM-EPDA-${job.jobId}-${index + 1}-${Date.now()}`,
        expenseItemId: option.source === 'EXPENSES_ITEM' ? option.masterId : '',
        name: previousItem.name,
        category: option.category,
        basis: option.calculationBasis.replace(/_/g, ' '),
        quantity,
        amount: totalRate,
        currency: viewCurrency,
        tariffType: option.tariffType,
        calculationBasis: option.calculationBasis,
        tariffRate: option.rate,
        remarks: option.remarks || '',
      }];
    });
    if (!refreshedItems.length) {
      setAutoLoadMessage(`Riwayat EPDA untuk IMO ${currentImo.toUpperCase()} ditemukan, tetapi tidak ada deskripsi yang cocok dengan tarif atau Expenses Item pada port tujuan, mata uang, dan GRT saat ini.`);
      return;
    }

    const attemptKey = `${job.jobId}|${currentImo}|${job.portId}|${vesselMaster?.grt || 0}|${viewCurrency}`;
    if (autoLoadAttemptedRef.current === attemptKey) return;
    autoLoadAttemptedRef.current = attemptKey;
    setAutoLoadError('');
    setAutoLoadMessage('Description EPDA sebelumnya ditemukan. Mengambil tarif Port dan GRT saat ini...');
    setItems(refreshedItems);
    void db.updateJobAndPersist(job.jobId, {
      quotation: {
        ...currentJob.quotation,
        epda: { ...currentJob.quotation.epda, items: refreshedItems, currency: viewCurrency },
      },
    }).then((result) => {
      if (currentJobIdRef.current !== job.jobId) return;
      if (!result.saved) {
        setItems([]);
        setAutoLoadError(result.error || 'Item Quotes EPDA gagal disimpan ke database.');
        setAutoLoadMessage('');
        return;
      }
      const unmatchedMessage = unmatchedHistoryNames.length
        ? ` ${unmatchedHistoryNames.length} item tidak dimuat karena tidak memiliki tarif master yang cocok: ${unmatchedHistoryNames.join(', ')}.`
        : '';
      setAutoLoadMessage(`${refreshedItems.length} item dari riwayat EPDA IMO ${currentImo.toUpperCase()} dimuat dengan tarif Port dan GRT saat ini.${unmatchedMessage}`);
      onDataSaved?.();
    }).catch((error: unknown) => {
      if (currentJobIdRef.current !== job.jobId) return;
      setAutoLoadError(error instanceof Error ? error.message : String(error));
      setAutoLoadMessage('');
    });
  }, [
    allJobs,
    autoServiceOptions,
    epdaQuote.items,
    isReviewOnly,
    job.inquiry?.cargoQuantity,
    job.inquiry?.estimatedDays,
    job.jobId,
    job.vesselId,
    printPreviewOnly,
    vesselMaster?.grt,
    vessels,
    viewCurrency,
  ]);

  const handleViewCurrencyChange = (currency: Currency) => {
    setViewCurrency(currency);
    if (itemEntryMode !== 'AUTO') return;
    const selected = buildAutoServiceOptions(currency).find((option) => option.name === newItem.name && option.category === newItem.category);
    setNewItem((current) => selected
      ? { ...current, rate: selected.rate, minCharge: selected.minCharge, remarks: selected.remarks || '' }
      : { ...current, name: '', rate: 0, minCharge: 0 });
  };

  const autoServiceOptionKey = (name: string, category: string) => JSON.stringify([name, category]);
  const keepIncompatibleItemAsReference = (option: MasterItemSearchOption) => {
    setManualItemReference(option);
    setAutoSelectedItemKey('');
    setNewItem((current) => ({ ...current, name: '', rate: 0, minCharge: 0 }));
  };
  const applySelectedAutoService = (selectedKey: string) => {
    const selected = autoServiceOptions.find((option) => autoServiceOptionKey(option.name, option.category) === selectedKey);
    if (!selected) {
      setAutoSelectedItemKey('');
      setNewItem({ ...newItem, name: '', rate: 0, minCharge: 0 });
      return;
    }

    setAutoSelectedItemKey(selectedKey);
    setManualItemReference(null);
    setNewItem({
      ...newItem,
      name: selected.name,
      category: selected.category,
      calculationBasis: selected.tariffType === 'FIXED' ? 'LUMP_SUM' : selected.calculationBasis,
      tariffType: selected.tariffType,
      rate: selected.rate,
      minCharge: selected.minCharge,
      remarks: selected.remarks || '',
    });
  };

  const persist = (): boolean => {
    if (isReviewOnly || isEPDALockedInDatabase()) return false;
    const currencyItems = items.map((item) => ({ ...item, currency: viewCurrency }));
    db.updateJob(job.jobId, {
      quotation: {
        ...job.quotation,
        epda: {
          ...job.quotation.epda,
          quoteNo: epdaNo,
          items: currencyItems,
          currency: viewCurrency,
          ...(Number(exchangeRate) > 0 ? { exchangeRateUSDToIDR: Number(exchangeRate) } : {}),
          pph23Applied: epdaPph23Applied,
          globalVatApplied: epdaGlobalVatApplied,
          totalAmount,
          status: 'SUBMITTED',
        },
      },
      currentStage: 'QUOTATION',
    });
    return true;
  };

  const setEPDAPph23Applied = (checked: boolean) => {
    if (isReviewOnly || isEPDALockedInDatabase()) return;
    const currentJob = db.getJob(job.jobId);
    if (!currentJob) return;
    db.updateJob(job.jobId, {
      quotation: {
        ...currentJob.quotation,
        epda: { ...currentJob.quotation.epda, pph23Applied: checked },
      },
    });
    onDataSaved?.();
  };

  const setEPDAGlobalVatApplied = (checked: boolean) => {
    if (isReviewOnly || isEPDALockedInDatabase()) return;
    const currentJob = db.getJob(job.jobId);
    if (!currentJob) return;
    db.updateJob(job.jobId, {
      quotation: {
        ...currentJob.quotation,
        epda: { ...currentJob.quotation.epda, globalVatApplied: checked },
      },
    });
    onDataSaved?.();
  };

  const saveExchangeRate = (value: string) => {
    const parsedRate = Number(value);
    if (isReviewOnly || isEPDALockedInDatabase() || !Number.isFinite(parsedRate) || parsedRate <= 0) return;
    const currentJob = db.getJob(job.jobId);
    if (!currentJob) return;
    db.updateJob(job.jobId, {
      quotation: {
        ...currentJob.quotation,
        epda: {
          ...currentJob.quotation?.epda,
          exchangeRateUSDToIDR: parsedRate,
        },
      },
    });
    onDataSaved?.();
  };

  const normalizeQuotationItemCategory = (value: string) => {
    const validCategories = new Set([
      'PORT_SERVICE', 'PORT_EXPENSES', 'CLEARANCE', 'GENERAL_EXPENSES',
      'CREW_EXPENSES', 'OWNER_MATTER', 'AGENCY_FEE',
    ]);
    const rawCategory = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (validCategories.has(rawCategory)) return rawCategory;

    const normalizedCategory = normalizeCostCategory(value);
    return validCategories.has(normalizedCategory) ? normalizedCategory : 'PORT_EXPENSES';
  };

  const autosaveItems = (nextItems: DisbursementItem[]) => {
    if (isReviewOnly || isEPDALockedInDatabase()) return;
    if (nextItems.length > 0) setAutoLoadMessage('');
    const manualItems = nextItems.map((item) => ({
      ...item,
      category: normalizeQuotationItemCategory(item.category),
      currency: viewCurrency,
      quantity: item.quantity || 1,
      amount: Number(item.amount || 0),
    }));
    setItems(manualItems);
    db.updateJob(job.jobId, {
      quotation: {
        ...job.quotation,
        epda: { ...job.quotation.epda, quoteNo: epdaNo, items: manualItems, currency: viewCurrency },
      },
    });
    onDataSaved?.();
  };

  const startEditItem = (item: DisbursementItem) => {
    if (isReviewOnly || isEPDALockedInDatabase()) return;
    setEditingItemId(item.id);
    setItemEditDraft({
      description: item.name,
      tariff: formatEntryAmount(Number(item.tariffRate ?? 0)),
      amount: formatEntryAmount(item.amount),
      remarks: item.remarks || '',
    });
  };

  const saveEditedItem = (itemId: string) => {
    if (isReviewOnly || isEPDALockedInDatabase()) return;
    const tariff = parseEntryAmount(itemEditDraft.tariff);
    const amount = parseEntryAmount(itemEditDraft.amount);
    if (!itemEditDraft.description.trim() || tariff === '' || amount === '') return;
    autosaveItems(items.map((item) => item.id === itemId
      ? {
          ...item,
          name: itemEditDraft.description.trim(),
          tariffRate: tariff,
          amount,
          remarks: itemEditDraft.remarks,
        }
      : item));
    setEditingItemId(null);
    setItemEditDraft({ description: '', tariff: '', amount: '', remarks: '' });
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setItemEditDraft({ description: '', tariff: '', amount: '', remarks: '' });
  };

  const handleQuickAddMasterData = async () => {
    if (isReviewOnly || isEPDALockedInDatabase()) return;
    const itemName = newItem.name.trim();
    const rateValue = Number(newItem.manualRate) || Number(newItem.rate) || 0;
    if (!itemName) {
      window.alert('Isi nama item service terlebih dahulu sebelum menambah data master.');
      return;
    }

    const portId = (job.portId || job.inquiry?.portId || '').trim();
    const portName = (job.portName || job.inquiry?.portName || '').trim();
    const quickRate = rateValue || Number(newItem.amount) || 0;
    const isTariffCategory = newItem.category === 'PORT_SERVICE';

    const vesselGRT = Number(vesselMaster?.grt) || 0;
    const vesselDWT = Number(vesselMaster?.dwt) || 0;

    const tariffPayload = {
      portId,
      portName,
      costCategory: newItem.category || 'PORT_EXPENSES',
      serviceName: itemName,
      grtMin: vesselGRT || undefined,
      grtMax: vesselGRT || undefined,
      dwt: vesselDWT || undefined,
      calculationBasis: newItem.calculationBasis || 'LUMP_SUM',
      tariffType: newItem.tariffType || 'FIXED',
      rateIDR: viewCurrency === 'IDR' ? quickRate : 0,
      rateUSD: viewCurrency === 'USD' ? quickRate : 0,
      remarks: newItem.remarks || '',
    };

    const expensePayload = {
      portId: portId || undefined,
      portName: portName || undefined,
      code: `EPDA-${Date.now().toString().slice(-6)}`,
      category: (newItem.category || 'PORT_EXPENSES') as ExpensesItem['category'],
      name: itemName,
      rateIDR: viewCurrency === 'IDR' ? quickRate : 0,
      rateUSD: viewCurrency === 'USD' ? quickRate : 0,
      calculationType: newItem.tariffType || 'FIXED',
    };

    if (isTariffCategory) {
      const existing = findMatchingFixTariff(fixTariffs, tariffPayload);
      if (existing) {
        window.alert('Data master untuk item ini sudah ada. Tarif master tidak diubah oleh operator. Gunakan item tersebut di form EPDA dengan tarif manual jika perlu.');
        return;
      } else {
        await db.addFixTariff(tariffPayload);
      }
    } else {
      const existing = findMatchingExpensesItem(expensesItems, expensePayload);
      if (existing) {
        window.alert('Data master untuk item ini sudah ada. Tarif master tidak diubah oleh operator. Gunakan item tersebut di form EPDA dengan tarif manual jika perlu.');
        return;
      } else {
        await db.addExpensesItem(expensePayload);
      }
    }
    window.alert('Item baru berhasil ditambahkan ke data master.');
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReviewOnly) return;
    if (itemEntryMode === 'AUTO' && !autoSelectedItemKey) return;
    if (!newItem.name.trim()) return;

    const quantity = Number(newItem.quantity) || 1;
    const selectedBasis = newItem.calculationBasis || 'PER_GRT';
    const selectedType = newItem.tariffType || (selectedBasis === 'LUMP_SUM' ? 'FIXED' : 'VARIABLE');
    const manualRate = Number(newItem.manualRate) || 0;
    const autoRate = Number(newItem.rate) || 0;
    const autoMinCharge = Number(newItem.minCharge) || 0;
    const tariffRate = itemEntryMode === 'AUTO' ? calculateTariffForJob({
      vesselGRT: vesselMaster?.grt || 0,
      cargoQuantity: Number(job.inquiry?.cargoQuantity || 0),
      estimatedDays: Number(job.inquiry?.estimatedDays || 0),
      hours: 1,
      moveCount: 1,
      rate: autoRate,
      minCharge: autoMinCharge,
      calculationBasis: selectedBasis,
      tariffType: selectedType,
    }) : calculateTariffForJob({
      vesselGRT: vesselMaster?.grt || 0,
      cargoQuantity: Number(job.inquiry?.cargoQuantity || 0),
      estimatedDays: Number(job.inquiry?.estimatedDays || 0),
      hours: 1,
      moveCount: 1,
      rate: manualRate,
      minCharge: autoMinCharge,
      calculationBasis: selectedBasis,
      tariffType: selectedType,
    });
    const calculatedAmount = quantity * tariffRate;
    const item: DisbursementItem = {
      id: `ITM-EPDA-${Date.now()}`,
      expenseItemId: '',
      name: newItem.name.trim(),
      category: newItem.category,
      basis: itemEntryMode === 'AUTO'
        ? `${selectedBasis.replace(/_/g, ' ')} · ${autoRate > 0 ? `Rp ${autoRate.toLocaleString('en-US')}` : 'rate belum diisi'}`
        : newItem.basis,
      quantity,
      amount: calculatedAmount,
      currency: viewCurrency,
      tariffType: selectedType,
      calculationBasis: selectedBasis,
      tariffRate: itemEntryMode === 'AUTO' ? autoRate : manualRate,
      remarks: newItem.remarks,
      vatApplied: newItem.vatApplied,
    };

    autosaveItems([...items, item]);
    setManualTariffText('');
    setNewItem({
      name: '',
      category: 'PORT_EXPENSES',
      basis: 'Per Call / Lump Sum',
      quantity: 1,
      manualRate: 0,
      amount: 0,
      remarks: '',
      calculationBasis: 'PER_GRT',
      tariffType: 'FIXED',
      rate: 0,
      minCharge: 0,
      vatApplied: false,
    });
    manualTypeDefaultedRef.current = false;
    setAutoSelectedItemKey('');
    setManualItemReference(null);
  };

  const handleSubmit = () => {
    if (!persist()) return;
    onDataSaved?.();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3500);
  };

  const normalizeCategory = (category: string) => category.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const resolveItemCategory = (item: DisbursementItem) => {
    const category = normalizeCategory(item.category || '');
    if (category) return category;

    const itemName = item.name.trim().toLowerCase();
    const matchingTariff = fixTariffs.find((tariff) =>
      tariff.serviceName.trim().toLowerCase() === itemName
      && (tariff.costCategory || '').trim().toUpperCase() === 'PORT_SERVICE'
      && portMatches(tariff.portId, tariff.portName)
    );
    if (matchingTariff) return normalizeCategory(matchingTariff.costCategory || 'PORT_EXPENSES');

    const matchingExpense = expensesItems.find((expense) =>
      expense.name.trim().toLowerCase() === itemName
      && portMatches(expense.portId, expense.portName)
    );
    if (matchingExpense) return normalizeCategory(matchingExpense.category);

    if (itemName.startsWith('port service')) return 'PORT_SERVICE';
    return '';
  };
  const categoryLabel = (category: string) => formatCostCategoryLabel(category);
  const categoryTone = { screen: 'bg-slate-600 text-white', background: '#214f84' };
  const groupedItems = items.reduce<Array<{ category: string; items: DisbursementItem[] }>>((groups, item) => {
    const category = normalizeCostCategory(resolveItemCategory(item));
    const existing = groups.find((group) => group.category === category);
    if (existing) existing.items.push(item);
    else groups.push({ category, items: [item] });
    return groups;
  }, []).sort((a, b) =>
    (getCostCategoryRank(a.category) - getCostCategoryRank(b.category))
    || a.category.localeCompare(b.category)
  );
  const epdaSubTotalLabel = groupedItems.length
    ? 'TOTAL AMOUNT'
    : 'TOTAL';
  const categoryPph23Amount = (categoryItems: DisbursementItem[]) => {
    if (!epdaPph23Applied || !categoryItems.some((item) => item.vatApplied)) return 0;
    const categoryTotal = Math.round((categoryItems.reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
    return Math.round((categoryTotal * 0.02 + Number.EPSILON) * 100) / 100;
  };
  const epdaPph23Amount = groupedItems.reduce((sum, group) => sum + categoryPph23Amount(group.items), 0);
  const epdaVatAmount = groupedItems.reduce((sum, group) => sum + categoryVatAmount(group.items), 0);
  const epdaCategorySubtotal = Math.round((totalAmount + (epdaGlobalVatApplied ? 0 : epdaVatAmount) + Number.EPSILON) * 100) / 100;
  const epdaGlobalVatAmount = epdaGlobalVatApplied
    ? Math.round((totalAmount * 0.11 + Number.EPSILON) * 100) / 100
    : 0;
  const grandTotalAmount = Math.round((epdaCategorySubtotal + epdaGlobalVatAmount - epdaPph23Amount + Number.EPSILON) * 100) / 100;
  const epdaGrandTotalBeforeGlobalVat = epdaCategorySubtotal;
  const getItemTariff = (item: DisbursementItem) => {
    const serviceDescription = describeTariffService(item.name);
    const currency = item.currency || viewCurrency;
    const masterOption = buildAutoServiceOptions(currency).find((option) =>
      option.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      && option.category === item.category
    );
    if (!serviceDescription && item.tariffType !== 'QTY_CARGO' && masterOption?.tariffType !== 'QTY_CARGO') return '';
    return describeTariffFormula({
      description: item.name,
      category: item.category,
      basis: item.calculationBasis || masterOption?.calculationBasis || item.basis,
      quantity: item.quantity,
      cargoQuantity: Number(job.inquiry?.cargoQuantity || 0),
      absoluteValue: vesselMaster?.grt,
      rate: item.tariffRate ?? masterOption?.rate,
      tariffType: item.tariffType || masterOption?.tariffType,
    });
  };
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const getBankFooterByCurrency = (currency: Currency) => currency === 'USD'
    ? '<div class="bank bank-mandiri"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK MANDIRI (Persero) Tbk</b><br>Address:<br>BANK MANDIRI TEBET SUPOMO<br>Jl. Prof. Dr.Supomo SH No 43, Tebet, RT.04/RW.03<br>Tebet barat , Kec. Tebet, Kota Jakarta Selatan,<br>Daerah Khusus Ibukota Jakarta 12810<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number (USD) : 120-00-5575599-0</b><br><b>Swift Code Bank : BMRIIDJAXXX</b></div>'
    : '<div class="bank"><div>Please kindly remit to our Bank Account</div><div>Bank Account Detail of PT. Lentera Global Maritim asf:</div><br><b>BANK NEGARA INDONESIA (Persero) Tbk</b><br>Address:<br>BNI BIDAKARA<br>Jl. Gatot Subroto Kab 71-73, RT.12/RW.5, Tebet Timur,<br>Kec. Tebet, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12820<br><br><b>Account Holder : PT.Lentera Global Maritim</b><br><b>Account Number : 2824-1212-09</b><br><b>Swift Code Bank : BNINIDJAXXX</b></div>';
  const officeFooter = '<div class="office-footer" style="width:100%;max-width:700px;margin:16px auto 0;text-align:center;font-size:9px;line-height:1.45;font-weight:600;color:#111;break-inside:avoid;page-break-inside:avoid;">Sarana Square Lt. 3C-D, Jl. Tebet Barat IV No. 20, Jakarta Selatan<br>Kota Adm Jakarta Selatan, DKI Jakarta - 12810<br><span style="color:#dc2626;text-decoration:underline">email : maritim@lentera-global.com / web : www.lentera-global.com</span></div>';
  const printFooter = getBankFooterByCurrency(viewCurrency);
  const pushFinanceSignatureDown = (html: string) => html
    .replaceAll('.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}', '.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}')
    .replaceAll('.signature{display:inline-block;width:42%;margin:16px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}', '.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}')
    .replaceAll('margin-top:54px;padding-top:8px', 'margin-top:120px;padding-top:12px')
    .replaceAll('margin-top:22px;padding-top:4px', 'margin-top:120px;padding-top:12px');
  const enhanceExportHeader = (html: string) => {
    let enhancedHtml = pushFinanceSignatureDown(html
    .replaceAll('.brand-row{text-align:center;margin-bottom:10px}', '.brand-row{text-align:center;margin-bottom:12px}')
    .replaceAll('.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}', '.brand-wrap{display:inline-flex;align-items:center;gap:18px;text-align:left;min-height:78px}')
    .replaceAll('.logo{width:76px;height:58px;object-fit:contain}', '.logo{width:96px;height:72px;object-fit:contain}')
    .replaceAll('.brand{font-weight:700;font-size:21px;line-height:1.15}', '.brand{font-weight:700;font-size:23px;line-height:1.15}')
    .replaceAll('.tag{color:#666;font-size:13px;margin-top:5px}', '.tag{color:#555;font-size:15px;font-weight:600;margin-top:7px}')
    .replaceAll('.meta-col.right{justify-self:stretch}', '.meta-col.right{justify-self:end;width:100%;padding-left:0;transform:translateX(35%)}')
    .replaceAll('.footer{position:fixed;bottom:0;width:100%;text-align:center;font-size:8px;color:#666}', '.office-footer{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center;font-size:9px;line-height:1.45;color:#111;font-weight:600;z-index:3}.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}.office-footer .contact{color:#e11d48;text-decoration:underline}')
    .replaceAll('.footer{left:0;right:0;text-align:center!important;font-size:12px;line-height:1.45;font-weight:600;color:#111}.footer .contact{color:#e11d48;text-decoration:underline}', '.bank{display:inline-block;width:42%;margin-top:24px;border:1px solid #777;padding:8px;text-align:left;font-size:9px;line-height:1.35;vertical-align:top}.signature{display:inline-block;width:42%;margin:24px 0 0 12%;text-align:center;vertical-align:top;font-size:9px}.signature-main{display:block}.signature-role{display:block;margin-top:120px;padding-top:12px}.office-footer{left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center!important;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3}.office-footer .contact{color:#e11d48;text-decoration:underline}')
    .replaceAll('th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}', 'table{border:2px solid #6b7280}th,td{border:0;padding:6px 7px}th{background:#e8ecf2;text-align:center;border-bottom:2px solid #9ca3af}.item-row td{border:0}.subtotal td{border-top:1px solid #d1d5db}.office-footer{left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:700px;text-align:center!important;font-size:9px;line-height:1.45;font-weight:600;color:#111;z-index:3}.office-footer .contact{color:#e11d48;text-decoration:underline}')
    .replaceAll(quoteDate, formatInquiryDate(quoteDate))
    .replaceAll(formatInquiryDate(new Date()), todayDisplayDate)
    .replace(/<\/body>/i, `${printFooter}${officeFooter}</body>`));
    if (job.eta) enhancedHtml = enhancedHtml.replaceAll(job.eta, formatVesselDate(job.eta, true));
    if (job.etd) enhancedHtml = enhancedHtml.replaceAll(job.etd, formatVesselDate(job.etd, true));
    return enhancedHtml;
  };

  const formatExportTableBase = (html: string) => html
    .replace(/<thead><tr>[\s\S]*?<\/tr><\/thead>/g, `<thead><tr><th>NO.</th><th>DESCRIPTION</th><th>TARIFF</th><th>AMOUNT ${viewCurrency}</th><th>REMARKS</th></tr></thead>`)
    .replaceAll('<table>', '<table style="width:100%;table-layout:fixed">')
    .replaceAll('<tr class="grand"><td colspan="2"', '<tr class="grand"><td colspan="3"')
    .replaceAll('</style>', 'table{table-layout:fixed!important}table th,table td{box-sizing:border-box!important}table th:nth-child(1),table td:nth-child(1){width:5%!important;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:20%!important;text-align:center!important}table th:nth-child(3),table td:nth-child(3){width:35%!important;text-align:center!important;white-space:nowrap}table th:nth-child(4),table td:nth-child(4){width:12%!important;text-align:center!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%!important;text-align:center!important}table th{text-align:center!important}table td:nth-child(1){text-align:center!important}table td:nth-child(2),table td:nth-child(3),table td:nth-child(4),table td:nth-child(5){text-align:center!important}table tr[style*="background:#214f84"] td:first-child{padding-left:1em!important;text-align:left!important}table tr.subtotal td:first-child,table tr.grand td:first-child{font-weight:700;text-align:center!important}table tr.subtotal td.amount,table tr.grand td.amount,table tr.subtotal td:nth-child(2),table tr.grand td:nth-child(2){font-variant-numeric:tabular-nums;text-align:center!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}.sign{display:none!important}</style>')
    .replace(/<div class="sign">[\s\S]*?<\/div>/, '');

  const formatExportTable = (html: string) => formatExportTableBase(html).replace('</style>', 'body table tr.item-row td:nth-child(1){text-align:center!important}body table tr.item-row td:nth-child(2),body table tr.item-row td:nth-child(5){text-align:left!important}body table tr.item-row td:nth-child(3){text-align:center!important}body table tr.item-row td:nth-child(4){text-align:right!important}body table tr[style*="background:"] td[colspan="5"]{text-align:left!important}body table tr.subtotal td:first-child,body table tr.grand td:first-child{font-weight:700;text-align:right!important}body table tr.global-vat td:first-child,body table tr.net-total td:first-child{font-weight:700;text-align:center!important}body table tr.subtotal td.amount,body table tr.grand td.amount,body table tr.grand td:nth-child(2),body table tr.global-vat td.amount,body table tr.net-total td.amount{font-variant-numeric:tabular-nums;text-align:right!important;white-space:nowrap;padding-left:0!important;padding-right:4px!important}</style>');

  const buildDocument = () => {
    const amount = (value: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const amountHeaderLabel = `AMOUNT ${viewCurrency}`;
    const rows = groupedItems.map((group, categoryIndex) => {
      const groupRows = group.items.map((it, index) => `<tr class="item-row"><td>${index + 1}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(getItemTariff(it))}</td><td style="text-align:right">${amount(it.amount)}</td><td>${escapeHtml(it.remarks || '')}</td></tr>`).join('');
      const total = group.items.reduce((sum, item) => sum + item.amount, 0);
      const vat = categoryVatAmount(group.items);
      const subtotal = total + vat;
      const vatRow = !epdaGlobalVatApplied && group.items.some((item) => item.vatApplied) ? `<tr class="vat"><td colspan="3" style="text-align:right">VAT 11%</td><td class="amount" style="text-align:right">${amount(vat)}</td><td></td></tr>` : '';
      return `<tr class="category-row" style="background:${categoryTone.background};color:#fff;font-weight:700;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact"><td colspan="5" style="text-align:left;padding:7px 10px 7px 1em;background:${categoryTone.background};color:#fff!important;font-size:10px;font-weight:900;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact">${escapeHtml(categoryLabel(group.category))}</td></tr>${groupRows}<tr class="total"><td colspan="3" style="text-align:right">TOTAL</td><td class="amount" style="text-align:right">${amount(total)}</td><td></td></tr>${vatRow}<tr class="subtotal" style="background:#f1f3f6;font-weight:700"><td colspan="3" style="text-align:right">SUB TOTAL ${categoryIndex + 1}</td><td class="amount" style="text-align:right">${amount(subtotal)}</td><td></td></tr>`;
    }).join('');
    const pph23Row = epdaPph23Amount > 0
      ? `<tr class="pph23"><td colspan="3" style="text-align:right">TOTAL TAX 23</td><td class="amount" style="text-align:right">-${amount(epdaPph23Amount)}</td><td></td></tr>`
      : '';
    const globalVatRows = `${epdaGlobalVatApplied ? `<tr class="vat"><td colspan="3" style="text-align:right">TOTAL VAT11%</td><td class="amount" style="text-align:right">${amount(epdaGlobalVatAmount)}</td><td></td></tr>` : ''}${pph23Row}${epdaPph23Amount > 0 || epdaGlobalVatApplied ? `<tr class="net-total"><td colspan="3" style="text-align:right">GRAND TOTAL</td><td class="amount" style="text-align:right">${amount(grandTotalAmount)}</td><td></td></tr>` : ''}`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${epdaNo}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}.brand-row{text-align:center;margin-bottom:10px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:76px;height:58px;object-fit:contain}.brand{font-weight:700;font-size:21px;line-height:1.15}.tag{color:#666;font-size:13px;margin-top:5px}h2{text-align:center;background:#182a50;color:white;padding:8px;font-size:13px;margin:18px 0 12px}.meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 34px;margin-bottom:12px}.meta-col{display:flex;flex-direction:column;gap:4px}.meta-col.right{justify-self:stretch}.meta-row{display:grid;grid-template-columns:125px 10px minmax(0,1fr);line-height:1.35}.meta-row .label{font-weight:700}.meta-row .colon{text-align:center}.meta-col.right .meta-row{grid-template-columns:85px 10px minmax(0,1fr)}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}.grand,.net-total{font-weight:700}.sign{margin-top:34px;text-align:right}.footer{position:fixed;bottom:0;width:100%;text-align:center;font-size:8px;color:#666}</style></head><body><div class="brand-row"><div class="brand-wrap"><img class="logo" src="${getPublicLogoUrl()}" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>ESTIMATE PORT DISBURSEMENT OF ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No.</span><span class="colon">:</span><span>${epdaNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${job.inquiry.date}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div><div class="meta-row"><span class="label">Job/Vessel Call ID</span><span class="colon">:</span><span>${job.jobId}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${job.eta}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vesselMaster?.grt?.toLocaleString() || '-'}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>AMOUNT ${viewCurrency}</th><th>REMARKS</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="grand"><td colspan="2" style="text-align:right">${epdaSubTotalLabel}</td><td style="text-align:right">${amount(epdaCategorySubtotal)}</td><td></td></tr>${globalVatRows}</tfoot></table><div class="sign">Banjarmasin, ${new Date().toLocaleDateString('id-ID')}<br><br><br><b>PT. Lentera Global Maritim</b></div><div class="footer">PT Lentera Global Maritim • Shipping Agency • ${epdaNo}</div></body></html>`;
  };

  const buildPreviewHtml = () => {
    const inquiryMeta = `<div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No EPDA</span><span class="colon">:</span><span>${escapeHtml(epdaNo)}</span></div><div class="meta-row"><span class="label">Date Quotes</span><span class="colon">:</span><span>${escapeHtml(formatDate(quoteDate))}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vesselMaster?.grt?.toLocaleString('id-ID') || '-'}</span></div><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${escapeHtml(epdaEtaDisplay)}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Vessel</span><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div><div class="meta-row"><span class="label">Estimated Day</span><span class="colon">:</span><span>${job.inquiry.estimatedDays || '-'}</span></div><div class="meta-row"><span class="label">Flag</span><span class="colon">:</span><span>${escapeHtml(vesselMaster?.flag || '-')}</span></div><div class="meta-row"><span class="label">Cargo Details</span><span class="colon">:</span><span>${escapeHtml(job.inquiry.cargoDetails || '-')}</span></div><div class="meta-row"><span class="label">IMO</span><span class="colon">:</span><span>${escapeHtml(vesselMaster?.imoNumber || '-')}</span></div><div class="meta-row"><span class="label">ETD</span><span class="colon">:</span><span>${escapeHtml(epdaEtdDisplay)}</span></div></div></div>`;
    const html = formatExportTable(enhanceExportHeader(buildDocument())).replace(/<div class="footer">PT Lentera Global Maritim • Shipping Agency • [^<]*<\/div>/, '').replaceAll('>No.</span>', '>No EPDA</span>');
    const onePageHtml = html.replace('</style>', '@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:12px;color:#172033}.brand-row{margin-bottom:8px}.brand-wrap{min-height:58px;gap:12px}.logo{width:78px;height:58px}.brand{font-size:20px;color:#3562a8}.tag{font-size:11px;color:#3562a8;margin-top:3px}h2{background:#214f84;font-size:14px;padding:5px;margin:8px 0 9px}.meta{gap:2px 28px;margin-bottom:9px}.meta-col{gap:2px}.meta-row{line-height:1.25}.meta-row .label{font-size:12px}table{page-break-inside:avoid;table-layout:fixed;border:1px solid #9ca3af;border-collapse:collapse}tr{page-break-inside:avoid}th,td{padding:4px 5px;font-size:12px;border:1px solid #9ca3af!important}thead th,table thead th{background:#dbe8f2!important;text-align:center!important;border-bottom:1px solid #9ca3af!important}table th:nth-child(1),table td:nth-child(1){width:5%!important;text-align:center!important}table th:nth-child(2),table td:nth-child(2){width:42%!important;text-align:center!important}table th:nth-child(3),table td:nth-child(3){width:8%!important;text-align:center!important}table th:nth-child(4),table td:nth-child(4){width:17%!important;text-align:center!important;white-space:nowrap}table th:nth-child(5),table td:nth-child(5){width:28%!important;text-align:center!important}thead th:nth-child(1),thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:center!important}.item-row td{background:#fff!important;border:1px solid #9ca3af!important}.subtotal{background:#dbe8f2!important;font-weight:700}.subtotal td{border-top:1px solid #9ca3af!important}.grand{background:#dbe8f2!important;color:#f00;font-weight:800}.grand td{border-top:1px solid #9ca3af!important}.subtotal td:first-child,.grand td:first-child{text-align:center!important}.subtotal td.amount,.grand td.amount{padding-left:0!important;padding-right:4px!important;text-align:center!important;white-space:nowrap}.bank{display:inline-block;width:42%;margin-top:16px;border:1px solid #777;padding:8px;font-size:12px;line-height:1.3;vertical-align:top}.signature{display:inline-block;width:42%;margin:16px 0 0 12%;text-align:center;vertical-align:top;font-size:12px}.footer{margin-top:16px;text-align:center;font-size:12px;line-height:1.35;font-weight:600}.footer .contact{color:#e11d48;text-decoration:underline}.bank.bank-mandiri{font-size:13px!important}</style>');
    const previewHtml = onePageHtml.replace(/<div class="meta">[\s\S]*?(?=<table(?:\s|>))/i, inquiryMeta).replaceAll('width:42%!important', 'width:20%!important').replaceAll('width:8%!important', 'width:35%!important').replaceAll('width:17%!important', 'width:12%!important').replaceAll('text-align:center!important}table th:nth-child(3)', 'text-align:center!important;white-space:nowrap}table th:nth-child(3)');
    const printStyles = `<style>
      .grand, .grand td, .grand td:first-child { font-weight: 400 !important; }
      h2, .category-row, .category-row td { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      table thead th:nth-child(2) { text-align: center !important; }
      @page { size: A4 portrait; margin: 10mm; }
      @media screen {
        html, body { min-height: 100%; height: auto; overflow: visible; background: #e2e8f0; }
        body { position: relative; box-sizing: border-box; width: 210mm; height: 297mm; min-height: 297mm; max-width: none; margin: 0 auto; padding: 15mm; background: #fff; }
        .meta-col { min-width: 0; }
        .meta-col.right { justify-self: stretch !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; margin-right: 0 !important; padding: 0 !important; transform: none !important; }
        .meta-row { grid-template-columns: minmax(0, 105px) 8px minmax(0, 1fr) !important; min-width: 0; }
        .meta-row > span:last-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
        .brand-row { margin-top: 0 !important; }
        .a4-page-frame { position: absolute; top: 10mm; left: 10mm; width: 190mm; height: 277mm; box-sizing: border-box; border: 0.3mm solid #1f2937; pointer-events: none; z-index: 9; }
        .office-footer { position: absolute !important; left: 50% !important; bottom: 15mm !important; transform: translateX(-50%) !important; width: 100% !important; margin: 0 !important; }
        .bank { position: static !important; top: auto !important; width: 52% !important; margin-top: 4px !important; padding: 5px !important; font-size: 12px !important; line-height: 1.1 !important; }
        .office-footer { font-size: 9px !important; line-height: 1.1 !important; }
        body { font-size: 11px !important; }
        h2 { font-size: 14px !important; }
        .meta-row, .meta-row .label { font-size: 11px !important; }
        th, td { padding: 2px 3px !important; font-size: 11px !important; line-height: 1.15 !important; }
        .category-row td { font-size: 11px !important; }
        .bank { font-size: 12px !important; }
        .office-footer { font-size: 11px !important; line-height: 1.1 !important; }
      }
      table th:nth-child(2), table td:nth-child(2) {
        width: 32% !important;
        text-align: left !important;
        white-space: normal !important;
        overflow-wrap: anywhere;
      }
      table th:nth-child(3), table td:nth-child(3) {
        width: 28% !important;
      }
      table th:nth-child(4), table td:nth-child(4) {
        width: 17% !important;
      }
      table td:nth-child(5) {
        width: 18% !important;
        white-space: normal !important;
        overflow-wrap: anywhere;
      }
      table tr.item-row td:nth-child(3) { white-space: nowrap !important; }
      table tr.total td:first-child,
      table tr.vat td:first-child,
      table tr.pph23 td:first-child { text-align: right !important; }
      table tr.total td.amount,
      table tr.vat td.amount,
      table tr.pph23 td.amount { text-align: right !important; }
      @media screen, print {
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
      }
      @media print {
        html, body { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible; background: #fff; }
        body { position: static !important; max-width: none; padding: 0 3mm !important; box-sizing: border-box; }
        .brand-row { position: static !important; display: block !important; margin: 0 auto 2mm !important; padding: 0 !important; }
        .brand-wrap { min-height: 0 !important; }
        h2 { margin-top: 0 !important; padding-top: 5px !important; }
        .meta-col { min-width: 0; }
        .meta-col.right { justify-self: stretch !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; margin-right: 0 !important; padding: 0 !important; transform: none !important; }
        .meta-row { grid-template-columns: minmax(0, 105px) 8px minmax(0, 1fr) !important; min-width: 0; }
        .meta-row > span:last-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
        .brand-row { margin-top: 0 !important; }
        .a4-page-frame { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: auto !important; width: auto !important; height: 277mm !important; box-sizing: border-box; border-left: 0.5mm solid #1f2937; border-right: 0.5mm solid #1f2937; pointer-events: none; z-index: 9999; }
        .a4-frame-line { position: fixed !important; left: 0 !important; right: 0 !important; height: 0 !important; border-top: 0.5mm solid #1f2937 !important; pointer-events: none !important; z-index: 2147483647 !important; }
        .a4-frame-line-top { top: 0 !important; }
        .a4-frame-line-bottom { top: 276.5mm !important; }
        body { font-size: 11px !important; }
        h2 { font-size: 14px !important; }
        .meta-row, .meta-row .label { font-size: 11px !important; }
        th, td { padding: 2px 3px !important; font-size: 11px !important; line-height: 1.15 !important; }
        .category-row td { font-size: 11px !important; }
        .bank { font-size: 12px !important; }
        .office-footer { font-size: 11px !important; line-height: 1.1 !important; }
        table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; page-break-inside: auto !important; break-inside: auto !important; overflow: visible !important; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tbody { display: table-row-group; }
        tbody tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        tbody tr.category-row { page-break-after: avoid !important; break-after: avoid-page !important; }
        .bank { position: static !important; top: auto !important; width: 52% !important; margin-top: 4px !important; padding: 5px !important; font-size: 12px !important; line-height: 1.1 !important; }
        .office-footer { position: fixed !important; left: 2mm !important; right: 2mm !important; bottom: 2mm !important; inset-block-start: auto !important; transform: none !important; display: block !important; width: auto !important; max-width: none !important; margin: 0 !important; text-align: center !important; page-break-inside: avoid !important; break-inside: avoid !important; font-size: 9px !important; line-height: 1.1 !important; }
        .bank, .signature { page-break-inside: avoid; break-inside: avoid; }
        html, body, body * { font-family: Helvetica, Arial, sans-serif !important; }
        body, .meta, .meta-row, .meta-row .label, table th, table td { font-size: 11px !important; }
        .brand { font-size: 20px !important; }
        .tag { font-size: 11px !important; }
        h2 { font-size: 14px !important; }
        .bank, .sign { font-size: 13px !important; }
        .signature { font-size: 13px !important; }
        .footer, .office-footer { font-size: 9px !important; }
        table thead th:first-child, table tbody tr.item-row td:first-child {
          text-align: center !important;
          vertical-align: middle !important;
        }
      }
      .office-footer { position: static !important; inset: auto !important; transform: none !important; display: block !important; width: 100% !important; max-width: 700px !important; margin: 16px auto 0 !important; text-align: center !important; page-break-inside: avoid !important; break-inside: avoid !important; }
    </style>`;
    return previewHtml
      .replace('<body>', '<body><div class="a4-page-frame" aria-hidden="true"></div><i class="a4-frame-line a4-frame-line-top" aria-hidden="true"></i><i class="a4-frame-line a4-frame-line-bottom" aria-hidden="true"></i>')
      .replace('</head>', `${printStyles}</head>`);
  };

  const openPreview = (print = false) => {
    const preview = window.open('', '_blank', 'width=900,height=1100');
    if (!preview) return;
    preview.document.write(buildPreviewHtml());
    preview.document.close();
    if (print) preview.onload = () => { preview.focus(); preview.print(); };
  };

  const downloadExcel = () => {
    const amountValue = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = groupedItems.map((group, categoryIndex) => {
      const groupRows = group.items.map((it, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(getItemTariff(it))}</td><td class="amount">${amountValue(it.amount)}</td><td>${escapeHtml(it.remarks || '')}</td></tr>`).join('');
      const total = group.items.reduce((sum, item) => sum + item.amount, 0);
      const vat = categoryVatAmount(group.items);
      const subtotal = total + vat;
      const vatRow = !epdaGlobalVatApplied && group.items.some((item) => item.vatApplied) ? `<tr class="vat"><td colspan="3">VAT 11%</td><td class="amount">${amountValue(vat)}</td><td></td></tr>` : '';
      return `<tr style="background:${categoryTone.background};color:#fff;font-weight:700;text-transform:uppercase"><td colspan="5" style="text-align:left;padding-left:0">${escapeHtml(categoryLabel(group.category))}</td></tr>${groupRows}<tr class="total"><td colspan="3">TOTAL</td><td class="amount">${amountValue(total)}</td><td></td></tr>${vatRow}<tr class="subtotal" style="background:#f1f3f6;font-weight:700"><td colspan="3">SUB TOTAL ${categoryIndex + 1}</td><td class="amount">${amountValue(subtotal)}</td><td></td></tr>`;
    }).join('');
    const pph23Row = epdaPph23Amount > 0
      ? `<tr class="pph23"><td colspan="3">TOTAL TAX 23</td><td class="amount">-${amountValue(epdaPph23Amount)}</td><td></td></tr>`
      : '';
    const globalVatRows = epdaGlobalVatApplied
      ? `<tr class="vat"><td colspan="3">TOTAL VAT11%</td><td class="amount">${amountValue(epdaGlobalVatAmount)}</td><td></td></tr>`
      : '';
    const grandTotalRow = epdaPph23Amount > 0 || epdaGlobalVatApplied
      ? `<tr class="grand"><td colspan="3">GRAND TOTAL</td><td class="amount">${amountValue(grandTotalAmount)}</td><td></td></tr>`
      : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172033}.header{text-align:center;padding:14px}.brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}.logo{width:76px;height:58px;object-fit:contain}.brand{font-weight:700;font-size:21px;line-height:1.15}.tag{color:#666;font-size:13px;margin-top:5px}h2{text-align:center;background:#182a50;color:white;padding:8px;font-size:13px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 34px;margin-bottom:12px}.meta-col{display:flex;flex-direction:column;gap:4px}.meta-row{display:grid;grid-template-columns:125px 10px minmax(0,1fr)}.meta-col.right .meta-row{grid-template-columns:85px 10px minmax(0,1fr)}.meta-row .label{font-weight:700}.meta-row .colon{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 7px}th{background:#e8ecf2;text-align:left}.amount{text-align:right}.grand{font-weight:700}</style></head><body><div class="header"><div class="brand-wrap"><img class="logo" src="${getPublicLogoUrl()}" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div><h2>ESTIMATE PORT DISBURSEMENT OF ACCOUNT</h2><div class="meta"><div class="meta-col"><div class="meta-row"><span class="label">No.</span><span class="colon">:</span><span>${epdaNo}</span></div><div class="meta-row"><span class="label">Date Inquiry</span><span class="colon">:</span><span>${job.inquiry.date}</span></div><div class="meta-row"><span class="label">Principal</span><span class="colon">:</span><span>${escapeHtml(job.customerName)}</span></div><div class="meta-row"><span class="label">Job/Vessel Call ID</span><span class="colon">:</span><span>${job.jobId}</span></div></div><div class="meta-col right"><div class="meta-row"><span class="label">Port</span><span class="colon">:</span><span>${escapeHtml(job.portName)}</span></div><div class="meta-row"><span class="colon">:</span><span>${escapeHtml(job.vesselName)}</span></div><div class="meta-row"><span class="label">ETA</span><span class="colon">:</span><span>${job.eta}</span></div><div class="meta-row"><span class="label">GRT</span><span class="colon">:</span><span>${vesselMaster?.grt?.toLocaleString() || '-'}</span></div></div></div><table><thead><tr><th>NO.</th><th>DESCRIPTION</th><th>AMOUNT ${viewCurrency}</th><th>REMARKS</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="grand"><td colspan="2">${epdaSubTotalLabel}</td><td class="amount">${amountValue(epdaCategorySubtotal)}</td><td></td></tr>${globalVatRows}</tfoot></table></body></html>`;
    const alignedHtml = formatExportTable(enhanceExportHeader(html)).replaceAll('class="meta-col right"', 'class="meta-col right" style="padding-right:18px"');
    const blob = new Blob([alignedHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${epdaNo.replaceAll('/', '-')}.xls`; a.click(); URL.revokeObjectURL(url);
  };

  if (printPreviewOnly) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button type="button" onClick={() => previewFrameRef.current?.contentWindow?.print()} className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600">
            <Printer className="h-4 w-4" />
            Cetak / Simpan PDF
          </button>
        </div>
        <iframe
          ref={previewFrameRef}
          title={`Pratinjau EPDA ${job.jobId}`}
          srcDoc={buildPreviewHtml()}
          className="h-[75vh] min-h-[560px] w-full rounded-lg border border-slate-300 bg-white"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 epda-form-root" aria-readonly={isReviewOnly}>
      <style>{`.epda-form-root table tfoot td{font-weight:400!important}.epda-form-root input,.epda-form-root select,.epda-form-root textarea{font-weight:400!important}`}</style>
      {isSavingEPDANumber && <div role="status" className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">Nomor EPDA sedang diperbarui dan disimpan ke database: {epdaNo}</div>}
      {epdaNumberMigrationError && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">Nomor EPDA baru belum tersimpan di database. {epdaNumberMigrationError}</div>}
      <div className="epda-page-header bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider"><FileSpreadsheet className="w-4 h-4"/><span>SALES / EPDA</span><span className="text-cyan-300">• JOB ID: {job.jobId}</span></div>
          <h1 className="text-2xl font-black text-white mt-1">Create EPDA</h1>
          <p className="text-xs text-slate-400">Estimate Port Disbursement of Account</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <div className="account-toolbar-panel account-currency-switch flex items-center gap-2 rounded-xl border p-1.5">
          <button type="button" onClick={() => handleViewCurrencyChange('IDR')} className={`h-12 px-5 rounded-lg text-base font-bold ${viewCurrency === 'IDR' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>IDR (Rp)</button>
          <button type="button" onClick={() => handleViewCurrencyChange('USD')} className={`h-12 px-5 rounded-lg text-base font-bold ${viewCurrency === 'USD' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>USD ($)</button>
        </div>
        <label className="account-toolbar-panel account-rate-control flex h-16 items-center gap-2 rounded-xl border px-5 text-base">
          Kurs USD
          <input type="number" min={1} step={1} value={exchangeRate} readOnly={isReviewOnly} onChange={e=>setExchangeRate(e.target.value)} onBlur={e => saveExchangeRate(e.currentTarget.value)} className="account-rate-input h-9 w-28 rounded-lg border px-3 text-right text-base"/>
        </label>
        {!isReviewOnly && <button onClick={handleSubmit} className="h-[54px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-bold flex items-center gap-2"><Send className="w-6 h-6"/>Kirim ke Manager OPS</button>}
        {isReviewOnly && (
          <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold ${
            isManagerApproved
              ? 'border-blue-200 bg-blue-100 text-blue-700'
              : 'border-amber-300 bg-amber-50 text-amber-800'
          }`}>
            <CheckCircle2 className="h-4 w-4" />
            {job.voidedAt ? 'JOB Call Dibatalkan' : isManagerApproved ? 'VIEW ONLY · APPROVED' : 'MENUNGGU APPROVAL MANAGER OPS'}
          </span>
        )}
        </div>
      </div>

      {isReviewOnly && <div role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
        isManagerApproved
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><div><b>{isManagerApproved ? 'EPDA telah disetujui Manager OPS.' : 'EPDA sudah dikirim ke Manager OPS.'}</b><div className="mt-1">{isManagerApproved ? `Disetujui oleh ${job.managerApproval?.approvedBy || 'Manager OPS'}${job.managerApproval?.approvedAt ? ` pada ${formatDate(job.managerApproval.approvedAt)}` : ''}. EPDA hanya dapat dilihat dan tidak dapat diedit atau dikirim ulang.` : 'Menunggu review Manager OPS. EPDA terkunci sampai Manager menyetujui atau mengembalikannya untuk revisi.'}</div></div></div>}

      {autoLoadMessage && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-800">{autoLoadMessage}</div>}
      {autoLoadError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{autoLoadError}</div>}
      {isSaved && <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>EPDA tersimpan dan status menjadi SUBMITTED untuk Manager OPS.</div>}

      <div className="epda-summary-grid grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="epda-summary-card bg-slate-900 border border-slate-800 rounded-2xl p-4"><span className="text-xs uppercase font-bold text-slate-400">No. EPDA</span><b className="block mt-1 text-cyan-300 font-mono">{epdaNo}</b></div>
        <div className="epda-summary-card bg-slate-900 border border-slate-800 rounded-2xl p-4"><span className="text-xs uppercase font-bold text-slate-400">Principal / Vessel</span><b className="block mt-1 text-white">{job.customerName} • {job.vesselName}</b></div>
        <div className="epda-summary-card epda-summary-total bg-slate-900 border border-slate-800 rounded-2xl p-4"><span className="text-xs uppercase font-normal text-slate-400">Grand Total</span><span className="mt-1 block font-normal text-emerald-300 font-mono">{formatAmount(grandTotalAmount)}</span></div>
      </div>

      <div className="epda-results-card bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">Inquiry Vessel Details</div>
            <h2 className="text-lg font-black text-white mt-1">Informasi Lengkap Inquiry Vessel</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Inquiry No</div><div className="mt-1 font-bold text-cyan-300 font-mono">{job.inquiry.inquiryNo}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Date Quotes</div><div className="mt-1 font-bold text-white">{formatInquiryDate(quoteDate)}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Status Inquiry</div><div className="mt-1 font-bold text-emerald-300">{job.inquiry.status}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Dibuat Oleh</div><div className="mt-1 font-bold text-white">{job.inquiry.createdBy || 'System'}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Branch</div><div className="mt-1 font-bold text-white">{job.inquiry.createdByBranch || creator?.branch || 'Head Office'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel</div><div className="mt-1 font-bold text-white">{job.vesselName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">IMO</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.imoNumber || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Call Sign / Flag</div><div className="mt-1 font-bold text-white font-mono">{vesselMaster?.callSign || '-'} / {vesselMaster?.flag || '-'}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Principal</div><div className="mt-1 font-bold text-white">{job.customerName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Port</div><div className="mt-1 font-bold text-white">{job.portName}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETA</div><div className="mt-1 font-bold text-white font-mono">{inquiryEtaDisplay}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">ETD</div><div className="mt-1 font-bold text-white font-mono">{inquiryEtdDisplay}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETA</div><div className="mt-1 font-bold text-white">{job.inquiry?.etaRemarks || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Keterangan ETD</div><div className="mt-1 font-bold text-white">{job.inquiry?.etdRemarks || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Cargo Quantity</div><div className="mt-1 font-bold text-white">{job.inquiry.cargoQuantity || 0} {job.inquiry.quantityUnit || 'TON'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Purpose</div><div className="mt-1 font-bold text-white">{formatPurposeOfCall(job.purposeOfCall)}</div></div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Estimated Days</div><div className="mt-1 font-bold text-white">{job.inquiry.estimatedDays || 0} hari</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Cargo Details</div><div className="mt-1 font-bold text-white">{job.inquiry.cargoDetails || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Vessel Type</div><div className="mt-1 font-bold text-white">{vesselMaster?.vesselType || '-'}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-slate-400 uppercase tracking-wider">Gross / Net / DWT</div><div className="mt-1 font-bold text-white font-mono">{formatTariffNumber(vesselMaster?.grt)} / {formatTariffNumber(vesselMaster?.nrt)} / {formatTariffNumber(vesselMaster?.dwt)}</div></div>

          <div className="md:col-span-2 xl:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 uppercase tracking-wider">Special Requirements</div>
            <div className="mt-1 text-white leading-relaxed">{job.inquiry.specialRequirements || 'Tidak ada requirement khusus.'}</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="mb-4">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">Quotes EPDA</div>
          <h2 className="text-lg font-black text-white mt-1">Create EPDA</h2>
        </div>
        {epdaScheduleError && <div role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{epdaScheduleError}</div>}
        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          <label className="block text-slate-400">
            ETA
            <DateTimeInput
              value={epdaSchedule.eta}
              disabled={printPreviewOnly || isSavingEpdaSchedule}
              onChange={(value) => setEpdaSchedule({ ...epdaSchedule, eta: value })}
              ariaLabel="ETA"
              inputClassName="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-60"
            />
          </label>
          <label className="block text-slate-400">
            ETD
            <DateTimeInput
              value={epdaSchedule.etd}
              disabled={printPreviewOnly || isSavingEpdaSchedule}
              onChange={(value) => setEpdaSchedule({ ...epdaSchedule, etd: value })}
              ariaLabel="ETD"
              inputClassName="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-white disabled:opacity-60"
            />
          </label>
          <label className="block text-slate-400">
            Keterangan ETA
            <input
              type="text"
              value={epdaSchedule.etaRemarks}
              disabled={printPreviewOnly || isSavingEpdaSchedule}
              onChange={(event) => setEpdaSchedule({ ...epdaSchedule, etaRemarks: event.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-60"
            />
          </label>
          <label className="block text-slate-400">
            Keterangan ETD
            <input
              type="text"
              value={epdaSchedule.etdRemarks}
              disabled={printPreviewOnly || isSavingEpdaSchedule}
              onChange={(event) => setEpdaSchedule({ ...epdaSchedule, etdRemarks: event.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white disabled:opacity-60"
            />
          </label>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4"><div><h2 className="text-base font-bold text-white uppercase tracking-wider">Hasil Quotes EPDA</h2><span className="text-xs text-slate-400">Hasil entry data manual Estimasi Biaya</span></div><div className="flex flex-wrap gap-2"><button onClick={()=>openPreview(false)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5"/>Lihat Hasil EPDA</button><button onClick={downloadExcel} className="px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5"/>Download Excel</button><button onClick={()=>openPreview(true)} className="px-3 py-2 rounded-lg bg-white text-slate-900 text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5"/>Cetak / PDF</button></div></div>
        <div className="erp-tax-controls mb-3 flex flex-wrap gap-2">
          <label className={`erp-tax-option erp-tax-option-pph ${epdaPph23Applied ? 'is-active' : ''} ${isReviewOnly || isEPDALockedInDatabase() ? 'is-disabled' : ''}`}>
            <input type="checkbox" checked={epdaPph23Applied} disabled={isReviewOnly || isEPDALockedInDatabase()} onChange={(event) => setEPDAPph23Applied(event.target.checked)} />
            <span>PPH 23 (2%)<small>Untuk kategori yang memiliki item VAT 11%</small></span>
          </label>
          <label className={`erp-tax-option erp-tax-option-vat ${epdaGlobalVatApplied ? 'is-active' : ''} ${isReviewOnly || isEPDALockedInDatabase() ? 'is-disabled' : ''}`}>
            <input type="checkbox" checked={epdaGlobalVatApplied} disabled={isReviewOnly || isEPDALockedInDatabase()} onChange={(event) => setEPDAGlobalVatApplied(event.target.checked)} />
            <span>VAT / PPN 11% Global<small>11% dari jumlah TOTAL kategori, ditambahkan ke SUB TOTAL</small></span>
          </label>
        </div>
        <div className="mb-1 px-2 text-right text-[9px] normal-case tracking-normal text-cyan-300">
          Ekuivalen kurs: {Number(exchangeRate) > 0 ? `1 USD = Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(exchangeRate))}` : 'belum diisi'}
        </div>
        <div className="epda-results-card pda-results-card overflow-x-auto rounded-lg">
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
              {groupedItems.map((group, categoryIndex) => {
                const total = group.items.reduce((sum, item) => sum + item.amount, 0);
                const vat = categoryVatAmount(group.items);
                return (
                  <React.Fragment key={group.category}>
                    <tr className={`epda-category-row ${categoryTone.screen} font-bold`}>
                      <td colSpan={5} className="border-l border-slate-700">
                        <span className="epda-category-label">{categoryLabel(group.category)}</span>
                      </td>
                    </tr>
                    {group.items.map((it, index) => (
                      <tr key={it.id} className="transition-colors hover:bg-slate-700/40">
                        <td className="border-l border-slate-800 p-3.5 text-center font-mono text-slate-300">
                          {index + 1}{it.vatApplied && <span className="ml-0.5 font-bold text-blue-400" title="VAT 11%" aria-label="VAT 11%">*</span>}
                        </td>
                        <td className="border-l border-slate-800 p-3.5 font-bold text-white">
                          {editingItemId === it.id
                            ? <input value={itemEditDraft.description} onChange={(event) => setItemEditDraft({ ...itemEditDraft, description: event.target.value })} aria-label={`Description ${it.name}`} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white" />
                            : it.name}
                        </td>
                        <td className="border-l border-slate-800 p-3.5 font-mono text-cyan-300">
                          {editingItemId === it.id
                            ? <input inputMode="decimal" value={itemEditDraft.tariff} onChange={(event) => setItemEditDraft({ ...itemEditDraft, tariff: event.target.value })} aria-label={`Tariff ${it.name}`} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white" />
                            : getItemTariff(it)}
                        </td>
                        <td className="border-l border-slate-800 p-3.5 text-right font-mono font-bold text-white">
                          <div className="flex items-center justify-end gap-2">
                            {editingItemId === it.id
                              ? <>
                                  <input autoFocus inputMode="decimal" value={itemEditDraft.amount} onChange={(event) => setItemEditDraft({ ...itemEditDraft, amount: event.target.value })} aria-label={`Amount ${it.name}`} className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-right text-white" />
                                  <button type="button" onClick={() => saveEditedItem(it.id)} className="rounded p-1 text-emerald-300 hover:bg-emerald-500/20" title="Simpan amount" aria-label={`Simpan amount ${it.name}`}><Check className="h-4 w-4" /></button>
                                  <button type="button" onClick={cancelEditItem} className="rounded p-1 text-slate-400 hover:bg-slate-700" title="Batal edit amount"><X className="h-4 w-4" /></button>
                                </>
                              : formatAmount(it.amount)}
                          </div>
                        </td>
                        <td className="border-l border-slate-800 p-3.5 text-slate-300">
                          <div className="flex items-center justify-between gap-3">
                            {editingItemId === it.id
                              ? <input value={itemEditDraft.remarks} onChange={(event) => setItemEditDraft({ ...itemEditDraft, remarks: event.target.value })} aria-label={`Remark ${it.name}`} className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white" />
                              : <span>{it.remarks || '-'}</span>}
                            <div className="flex items-center gap-1">
                              {!isReviewOnly && !isEPDALockedInDatabase() && editingItemId !== it.id && <button type="button" onClick={() => startEditItem(it)} className="rounded p-1.5 text-cyan-300 hover:bg-cyan-500/20" title="Edit item" aria-label={`Edit ${it.name}`}><Pencil className="h-3.5 w-3.5" /></button>}
                              <button type="button" onClick={() => autosaveItems(items.filter((item) => item.id !== it.id))} className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200" title="Hapus item EPDA" aria-label={`Hapus ${it.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-950/70">
                      <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">TOTAL</td>
                      <td className="epda-subtotal-amount border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmount(total)}</td>
                      <td className="border-l border-slate-800" />
                    </tr>
                    {!epdaGlobalVatApplied && group.items.some((item) => item.vatApplied) && (
                      <tr className="bg-slate-950/70">
                        <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">VAT 11%</td>
                        <td className="border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmount(vat)}</td>
                        <td className="border-l border-slate-800" />
                      </tr>
                    )}
                    <tr className="bg-slate-950/70">
                      <td colSpan={3} className="border-l border-slate-800 p-2.5 text-right font-bold uppercase tracking-wider text-slate-200">SUB TOTAL {categoryIndex + 1}</td>
                      <td className="epda-subtotal-amount border-l border-slate-800 p-2.5 text-right font-mono text-xs font-bold text-white">{formatAmount(total + vat)}</td>
                      <td className="border-l border-slate-800" />
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-950">
              <tr aria-hidden="true">
                <td colSpan={5} className="h-8 border-0 p-0" />
              </tr>
              <tr className="epda-grand-total-row">
                <td colSpan={3} className="border-l border-slate-800 p-3.5 text-right font-black uppercase tracking-wider text-white">{epdaSubTotalLabel}</td>
                <td className="border-l border-slate-800 p-3.5 text-right font-mono text-xs font-black text-white">{formatAmount(epdaCategorySubtotal)}</td>
                <td className="border-l border-slate-800" />
              </tr>
              {epdaGlobalVatApplied && (
                <tr>
                  <td colSpan={3} className="border-l border-slate-800 p-3.5 text-right font-bold uppercase tracking-wider text-amber-300">TOTAL VAT11%</td>
                  <td className="border-l border-slate-800 p-3.5 text-right font-mono text-xs font-bold text-amber-300">{formatAmount(epdaGlobalVatAmount)}</td>
                  <td className="border-l border-slate-800" />
                </tr>
              )}
              {epdaPph23Amount > 0 && (
                <tr>
                  <td colSpan={3} className="border-l border-slate-800 p-3.5 text-right font-bold uppercase tracking-wider text-rose-300">TOTAL TAX 23</td>
                  <td className="border-l border-slate-800 p-3.5 text-right font-mono text-xs font-bold text-rose-300">-{formatAmount(epdaPph23Amount)}</td>
                  <td className="border-l border-slate-800" />
                </tr>
              )}
              {(epdaPph23Amount > 0 || epdaGlobalVatApplied) && (
                <tr>
                  <td colSpan={3} className="border-l border-slate-800 p-3.5 text-center font-black uppercase tracking-wider text-white">Grand Total</td>
                  <td className="border-l border-slate-800 p-3.5 text-right font-mono text-xs font-black text-white">{formatAmount(grandTotalAmount)}</td>
                  <td className="border-l border-slate-800" />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {!isReviewOnly && <div className="rounded-2xl border border-slate-300 bg-[#edf2f4] p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 text-emerald-600">
            <Plus className="h-4 w-4" />
            <h3 className="text-[15px] font-bold uppercase tracking-wide text-slate-700">
              {itemEntryMode === 'AUTO' ? 'Tambah Item EPDA Otomatis' : 'Tambah Item EPDA Manual'}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setItemEntryMode('AUTO'); setAutoSelectedItemKey(''); }} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${itemEntryMode === 'AUTO' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
              Otomatis
            </button>
            <button type="button" onClick={() => { setItemEntryMode('MANUAL'); setNewItem((current) => ({ ...current, ...(manualItemReference ? { name: manualItemReference.name, category: normalizeCostCategory(manualItemReference.category) || current.category } : {}), ...(!manualTypeDefaultedRef.current ? { tariffType: 'FIXED' as const } : {}) })); if (!manualTypeDefaultedRef.current) manualTypeDefaultedRef.current = true; }} className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${itemEntryMode === 'MANUAL' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-600'}`}>
              Manual
            </button>
          </div>

          <div className="flex items-center gap-2">
            {itemEntryMode === 'MANUAL' && (
              <button type="button" onClick={handleQuickAddMasterData} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 shadow-sm">
                <Plus className="h-4 w-4" />
                TAMBAH DATA MASTER
              </button>
            )}
            <button type="submit" form={itemEntryMode === 'AUTO' ? 'epda-auto-entry-form' : 'epda-entry-form'} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 shadow-sm">
              <Plus className="h-4 w-4" />
              TAMBAH ITEM
            </button>
          </div>
        </div>

        <p className="mb-2 text-xs text-slate-500">
          {itemEntryMode === 'AUTO'
            ? 'Otomatis: FIXED = Tarif x QTY; VARIABLE = GRT x Tarif x QTY; QTY_CARGO = Quantity Cargo x Tarif x QTY.'
            : 'Manual: FIXED = Tarif x QTY; VARIABLE = GRT x Tarif x QTY; QTY_CARGO = Quantity Cargo x Tarif x QTY.'}
        </p>
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
          Format angka: 1,500.50 (koma untuk ribuan, titik untuk desimal).
        </div>

        {itemEntryMode === 'AUTO' ? (
          <form id="epda-auto-entry-form" onSubmit={handleAddItem} className="grid grid-cols-1 gap-3 text-xs font-normal md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-slate-600">Item Service</label>
              <MasterItemSearch
                options={masterItemSearchOptions}
                value={autoSelectedItemKey}
                onSelect={applySelectedAutoService}
                onIncompatibleSelect={keepIncompatibleItemAsReference}
                placeholder="Search disini"
                ariaLabel="Cari item service master EPDA"
              />
              {!masterItemSearchOptions.length && (
                <p className="mt-1 text-[10px] text-slate-500">Belum ada item tarif atau Expenses Item di master data.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Category Cost</label>
              <select value={newItem.category} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500">
                <option value="PORT_SERVICE">PORT SERVICE</option>
                <option value="PORT_EXPENSES">PORT EXPENSES</option>
                <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                <option value="CREW_EXPENSES">CREW EXPENSES</option>
                <option value="OWNER_MATTER">OWNER MATTER</option>
                <option value="AGENCY_FEE">AGENCY FEE</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Type</label>
              <select value={newItem.tariffType} disabled className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500">
                <option value="FIXED">Fixed</option>
                <option value="VARIABLE">Variabel</option>
                <option value="QTY_CARGO">QTY_CARGO</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Rate</label>
              <input type="text" inputMode="decimal" readOnly value={formatRateAmount(Number(newItem.rate) || 0)} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">QTY</label>
              <input type="number" min="1" step="1" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div className="lg:col-span-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label>
                <input readOnly value={formatEntryAmount(calculateTariffForJob({ vesselGRT: vesselMaster?.grt || 0, cargoQuantity: Number(job.inquiry?.cargoQuantity || 0), estimatedDays: Number(job.inquiry?.estimatedDays || 0), hours: 1, moveCount: 1, rate: Number(newItem.rate) || 0, minCharge: Number(newItem.minCharge) || 0, calculationBasis: newItem.calculationBasis, tariffType: newItem.tariffType }))} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-slate-500"/>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label>
                <input readOnly value={formatEntryAmount((Number(newItem.quantity) || 1) * calculateTariffForJob({ vesselGRT: vesselMaster?.grt || 0, cargoQuantity: Number(job.inquiry?.cargoQuantity || 0), estimatedDays: Number(job.inquiry?.estimatedDays || 0), hours: 1, moveCount: 1, rate: Number(newItem.rate) || 0, minCharge: Number(newItem.minCharge) || 0, calculationBasis: newItem.calculationBasis, tariffType: newItem.tariffType }))} className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500"/>
              </div>
            </div>
            <div className="lg:col-span-6">
              <label className="mb-1 block text-slate-600">Remark</label>
              <input value={newItem.remarks} onChange={e => setNewItem({ ...newItem, remarks: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" checked={newItem.vatApplied} onChange={e => setNewItem({ ...newItem, vatApplied: e.target.checked })} /> VAT 11%</label>
            </div>
          </form>
        ) : (
          <form id="epda-entry-form" onSubmit={handleAddItem} className="grid grid-cols-1 gap-3 text-xs font-normal md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-slate-600">
                Item Service{manualItemReference && newItem.name === manualItemReference.name ? ' (referensi Master Data)' : ''}
              </label>
              <input required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Nama service manual" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Category Cost</label>
              <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none">
                <option value="PORT_SERVICE">PORT SERVICE</option>
                <option value="PORT_EXPENSES">PORT EXPENSES</option>
                <option value="CLEARANCE">CLEARANCE IN/OUT</option>
                <option value="GENERAL_EXPENSES">GENERAL EXPENSES</option>
                <option value="CREW_EXPENSES">CREW EXPENSES</option>
                <option value="OWNER_MATTER">OWNER MATTER</option>
                <option value="AGENCY_FEE">AGENCY FEE</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Type</label>
              <select value={newItem.tariffType} onChange={e => setNewItem({ ...newItem, tariffType: e.target.value as 'FIXED' | 'VARIABLE' | 'QTY_CARGO' })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none">
                <option value="FIXED">Fixed</option>
                <option value="VARIABLE">Variabel</option>
                <option value="QTY_CARGO">QTY_CARGO</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">QTY</label>
              <input type="number" min="1" step="1" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Tarif ({viewCurrency})</label>
              <input type="text" inputMode="decimal" placeholder="0.0000" value={manualTariffText} onChange={e => { const text = e.target.value; const parsed = parseEntryAmount(text); setManualTariffText(text); setNewItem({ ...newItem, manualRate: parsed === '' ? 0 : parsed }); }} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="mb-1 block text-slate-600">Amount ({viewCurrency})</label>
              <input type="text" value={formatEntryAmount((Number(newItem.quantity) || 1) * manualTariffPreview)} readOnly className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-right text-slate-500"/>
            </div>
            <div className="lg:col-span-6">
              <label className="mb-1 block text-slate-600">Remark</label>
              <input value={newItem.remarks} onChange={e => setNewItem({ ...newItem, remarks: e.target.value })} placeholder="Keterangan tambahan" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div className="lg:col-span-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" checked={newItem.vatApplied} onChange={e => setNewItem({ ...newItem, vatApplied: e.target.checked })} /> VAT 11%</label>
            </div>
          </form>
        )}

        <div className="mt-3 text-[10px] text-slate-500">
          {itemEntryMode === 'AUTO'
            ? 'Formula otomatis: basis x rate, dengan minimum charge yang diizinkan.'
            : 'Amount dihitung otomatis dari QTY x Tarif. Data item lainnya tetap diisi secara manual.'}
        </div>
      </div>}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Printer, Pencil, Send } from 'lucide-react';
import { Currency, JobCall, PaymentVoucher, PaymentVoucherItem, User, VendorPartner } from '../../types';
import { db } from '../../db/storage';
import { dataApi } from '../../lib/dataApi';
import { listFpdaNumbers, loadUsdIdrRateForDate } from '../../lib/api';
import { parseTariffNumber } from '../../utils/tariff';
import { printPaymentVoucher } from '../../utils/voucherPrint';
import { getPaymentVoucherPphRate, PAYMENT_VOUCHER_VAT_RATE } from '../../utils/paymentVoucherTax';
import { DateInput } from '../shared/DateInput';

interface PaymentVoucherViewProps {
  jobCalls: JobCall[];
  vendorPartners: VendorPartner[];
  requestBy: string;
  requestByUserId?: string;
  onDataSaved?: () => void;
  voucher?: PaymentVoucher;
  onCancelEdit?: () => void;
  operationalOnly?: boolean;
  jobVesselOnly?: boolean;
  approverUsers?: User[];
}

type JobInfo = PaymentVoucher['jobInfo'];

interface VoucherRow {
  id: string;
  jobNumber: string;
  documentType?: 'FDA' | 'FPDA';
  documentNumber?: string;
  customerName: string;
  itemService: string;
  category: string;
  tariffType: 'FIXED' | 'VARIABLE' | 'QTY_CARGO';
  price: number;
  quantity: number;
  unit: string;
  remarks: string;
  amount: number;
  vatApplied: boolean;
  pphRate: number;
}

const PPH_RATES = [
  { value: 0, label: 'Tidak ada' },
  { value: 0.02, label: 'PPh 2%' },
  { value: 0.025, label: 'PPh 2,5%' },
  { value: 0.1, label: 'PPh 10%' },
];

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const newRow = (): VoucherRow => ({
  id: `ROW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  jobNumber: '',
  documentType: undefined,
  documentNumber: '',
  customerName: '',
  itemService: '',
  category: '',
  tariffType: 'FIXED',
  price: 0,
  quantity: 1,
  unit: '',
  remarks: '',
  amount: 0,
  vatApplied: false,
  pphRate: 0,
});

const money = (value: number, currency: Currency = 'IDR') => currency === 'USD'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)
  : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const calculate = (row: VoucherRow) => {
  const vatAmount = row.vatApplied ? row.amount * PAYMENT_VOUCHER_VAT_RATE : 0;
  const total = row.amount + vatAmount;
  const pph23Amount = row.amount * row.pphRate;
  return { vatAmount, total, pph23Amount, paidAmount: total - pph23Amount };
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-slate-400 focus:outline-none';
const readonlyClass = 'w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700';

interface VoucherDraft {
  requestDate: string;
  currency: Currency;
  exchangeRateUSDToIDR: number | null;
  exchangeRateDate: string;
  requestedPaymentDate: string;
  jobInfo: JobInfo;
  vendorId: string;
  manualVendorName?: string;
  manualPaidTo?: string;
  manualBankName?: string;
  manualAccountNumber?: string;
  rows: VoucherRow[];
  entryRow?: VoucherRow;
  editingRowId?: string | null;
  approvalTargetUserId?: string;
}

export const PaymentVoucherView: React.FC<PaymentVoucherViewProps> = ({ jobCalls, vendorPartners, requestBy, requestByUserId, onDataSaved, voucher: editingVoucher, onCancelEdit, operationalOnly = false, jobVesselOnly = false, approverUsers = [] }) => {
  const [requestDate, setRequestDate] = useState(() => editingVoucher ? String(editingVoucher.requestDate).slice(0, 10) : todayIso());
  const [currency, setCurrency] = useState<Currency>(editingVoucher?.currency || 'IDR');
  const [exchangeRate, setExchangeRate] = useState<number | null>(editingVoucher?.exchangeRateUSDToIDR ?? null);
  const [exchangeRateDate, setExchangeRateDate] = useState(editingVoucher?.exchangeRateDate || '');
  const [isLoadingExchangeRate, setIsLoadingExchangeRate] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState('');
  const [requestedPaymentDate, setRequestedPaymentDate] = useState(() => editingVoucher?.requestedPaymentDate || String(editingVoucher?.requestDate || todayIso()).slice(0, 10));
  const [jobInfo, setJobInfo] = useState<JobInfo>(operationalOnly ? 'OPERASIONAL' : jobVesselOnly ? 'JOB_VESSEL' : editingVoucher?.jobInfo || 'OPERASIONAL');
  const [vendorId, setVendorId] = useState(editingVoucher?.vendorPartnerId || '');
  const [approvalTargetUserId, setApprovalTargetUserId] = useState(editingVoucher?.approvalTargetUserId || '');
  const [manualVendor, setManualVendor] = useState({
    vendorName: editingVoucher?.vendorName || '',
    paidTo: editingVoucher?.paidTo || '',
    bankName: editingVoucher?.bankName || '',
    accountNumber: editingVoucher?.accountNumber || '',
  });
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(!!editingVoucher);
  const [rows, setRows] = useState<VoucherRow[]>(() => editingVoucher
    ? editingVoucher.items.map((item) => ({
        id: item.id,
        jobNumber: item.jobNumber,
        documentType: item.documentType,
        documentNumber: item.documentNumber || '',
        customerName: editingVoucher.jobInfo === 'JOB_VESSEL'
          ? jobCalls.find((job) => job.jobId === item.jobNumber)?.vesselName || item.customerName
          : item.customerName,
        itemService: item.itemService,
        category: item.category || '',
        tariffType: item.tariffType || 'FIXED',
        price: item.price ?? item.amount,
        quantity: item.quantity ?? 1,
        unit: item.unit || '',
        remarks: item.remarks || '',
        amount: item.amount,
        vatApplied: !!item.vatApplied,
        pphRate: getPaymentVoucherPphRate(item),
      }))
    : []);
  const [entryRow, setEntryRow] = useState<VoucherRow>(newRow);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const [fpdaNumbers, setFpdaNumbers] = useState<Record<string, string>>({});
  const [fpdaNumbersError, setFpdaNumbersError] = useState('');

  const activeJobs = useMemo(
    () => jobCalls.filter((job) => job.status !== 'CLOSED' && job.currentStage !== 'CLOSED' && !job.closing?.isClosed),
    [jobCalls],
  );
  const getDocumentOptions = (jobNumber: string) => {
    if (jobInfo !== 'JOB_VESSEL') return [];
    const job = activeJobs.find((item) => item.jobId === jobNumber);
    const hasItems = !!job?.fdaItems?.length || !!job?.quotation?.epda?.items?.length;
    if (!job || !hasItems) return [];
    const numbers: { type: 'FDA' | 'FPDA'; number: string }[] = [];
    if (job.fda?.fdaNo?.trim()) numbers.push({ type: 'FDA', number: job.fda.fdaNo.trim() });
    const fpdaNo = fpdaNumbers[job.jobId];
    if (fpdaNo) numbers.push({ type: 'FPDA', number: fpdaNo });
    return numbers;
  };
  const getDocumentOptionValue = (type?: 'FDA' | 'FPDA', number?: string) =>
    type && number ? `${type}|${number}` : '';

  // savedTick forces a fresh number after each save.
  const requestNumber = useMemo(
    () => editingVoucher ? editingVoucher.requestNumber : db.getNextPaymentVoucherNumber(requestDate),
    [requestDate, savedTick, editingVoucher],
  );
  const nextOperationalJobNumber = useMemo(
    () => db.getNextOperationalJobNumber(requestDate),
    [requestDate, savedTick],
  );
  const operationalJobNumber = editingVoucher?.jobInfo === 'OPERASIONAL'
    ? editingVoucher.items.find((item) => item.jobNumber)?.jobNumber || nextOperationalJobNumber
    : nextOperationalJobNumber;
  const vendor = vendorPartners.find((item) => item.id === vendorId);
  const vendorDetails = {
    vendorName: vendor?.vendorName || manualVendor.vendorName.trim(),
    paidTo: vendor?.paidName || manualVendor.paidTo.trim(),
    bankName: vendor?.bankName || manualVendor.bankName.trim(),
    accountNumber: vendor?.accountNumber || manualVendor.accountNumber.trim(),
  };

  const updateEntryRow = (patch: Partial<VoucherRow>) =>
    setEntryRow((current) => {
      const updated = { ...current, ...patch };
      if ('price' in patch || 'quantity' in patch) {
        updated.amount = Math.round((updated.price * updated.quantity + Number.EPSILON) * 100) / 100;
      } else if ('amount' in patch) {
        updated.amount = Math.round((updated.amount + Number.EPSILON) * 100) / 100;
        updated.price = updated.quantity ? updated.amount / updated.quantity : updated.amount;
      }
      return updated;
    });

  const changeJobInfo = (value: JobInfo) => {
    setJobInfo(value);
    setRows([]);
    setEntryRow({ ...newRow(), jobNumber: value === 'OPERASIONAL' ? operationalJobNumber : '' });
    setEditingRowId(null);
  };

  const selectJob = (jobNumber: string) => {
    const job = activeJobs.find((item) => item.jobId === jobNumber);
    updateEntryRow({
      jobNumber,
      documentType: undefined,
      documentNumber: '',
      customerName: job
        ? jobInfo === 'JOB_VESSEL' ? job.vesselName : job.customerName
        : '',
      itemService: '',
    });
  };

  const clearEntryRow = () => {
    setEntryRow(newRow());
    setEditingRowId(null);
  };

  const addEntryRow = () => {
    setError('');
    const jobNumber = jobInfo === 'OPERASIONAL' ? operationalJobNumber : entryRow.jobNumber;
    if ((jobInfo === 'JOB_VESSEL' && !jobNumber.trim()) || (!operationalOnly && !entryRow.customerName.trim()) || !entryRow.itemService.trim() || entryRow.amount <= 0) {
      setError(operationalOnly
        ? 'Lengkapi Description dan Amount (> 0) sebelum menambahkan item.'
        : 'Lengkapi JOB, Vessel Name, Description, dan Amount (> 0) sebelum menambahkan item.');
      return;
    }
    const completedRow = { ...entryRow, jobNumber, price: entryRow.quantity ? entryRow.amount / entryRow.quantity : entryRow.amount };
    if (editingRowId) {
      setRows((current) => current.map((row) => row.id === editingRowId ? completedRow : row));
    } else {
      setRows((current) => [...current, completedRow]);
    }
    clearEntryRow();
  };

  const editEntryRow = (row: VoucherRow) => {
    setEntryRow({ ...row });
    setEditingRowId(row.id);
    setError('');
  };

  const removeEntryRow = (rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
    if (editingRowId === rowId) clearEntryRow();
  };

  const optionLabel = (value: string, item: VendorPartner, key: 'bankName' | 'paidName' | 'accountNumber') => {
    const duplicated = vendorPartners.filter((other) => other[key] === value).length > 1;
    return duplicated ? `${value} (${item.vendorName})` : value;
  };

  const grandTotal = rows.reduce((sum, row) => sum + calculate(row).paidAmount, 0);

  useEffect(() => {
    if (currency === 'IDR') {
      setExchangeRate(null);
      setExchangeRateDate('');
      setExchangeRateError('');
      setIsLoadingExchangeRate(false);
      return;
    }
    if (editingVoucher?.currency === 'USD'
      && String(editingVoucher.requestDate).slice(0, 10) === requestDate
      && editingVoucher.exchangeRateUSDToIDR) {
      setExchangeRate(editingVoucher.exchangeRateUSDToIDR);
      setExchangeRateDate(editingVoucher.exchangeRateDate || requestDate);
      setExchangeRateError('');
      setIsLoadingExchangeRate(false);
      return;
    }
    let cancelled = false;
    setExchangeRate(null);
    setExchangeRateDate('');
    setExchangeRateError('');
    setIsLoadingExchangeRate(true);
    void loadUsdIdrRateForDate(requestDate)
      .then((result) => {
        if (cancelled) return;
        setExchangeRate(result.rate);
        setExchangeRateDate(result.date);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setExchangeRateError(loadError instanceof Error ? loadError.message : 'Kurs USD/IDR historis gagal dimuat.');
      })
      .finally(() => { if (!cancelled) setIsLoadingExchangeRate(false); });
    return () => { cancelled = true; };
  }, [currency, requestDate, editingVoucher]);

  useEffect(() => {
    let cancelled = false;
    void listFpdaNumbers()
      .then((numbers) => {
        if (cancelled) return;
        setFpdaNumbers(Object.fromEntries(numbers.map(({ jobId, fpdaNo }) => [jobId, fpdaNo])));
        setFpdaNumbersError('');
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        console.error('Gagal memuat nomor FPDA:', loadError);
        setFpdaNumbersError('Nomor FPDA tidak dapat dimuat. Periksa koneksi, lalu muat ulang form.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (editingVoucher) {
      setDraftLoaded(true);
      return;
    }
    let cancelled = false;
    void dataApi.getUserData<VoucherDraft>('voucher_draft')
      .then((draft) => {
        if (cancelled || !draft || !Array.isArray(draft.rows)) return;
        if (jobVesselOnly && draft.jobInfo !== 'JOB_VESSEL') return;
        const hasSavedManualVendor = !!(draft.manualVendorName || draft.manualPaidTo || draft.manualBankName || draft.manualAccountNumber);
        if (draft.rows.length === 0 && !draft.entryRow && !draft.vendorId && !hasSavedManualVendor) return;
        setRequestDate(draft.requestDate || todayIso());
        setCurrency(draft.currency || 'IDR');
        setExchangeRate(draft.exchangeRateUSDToIDR ?? null);
        setExchangeRateDate(draft.exchangeRateDate || '');
        setRequestedPaymentDate(draft.requestedPaymentDate || draft.requestDate || todayIso());
        setJobInfo(operationalOnly ? 'OPERASIONAL' : jobVesselOnly ? 'JOB_VESSEL' : draft.jobInfo || 'OPERASIONAL');
        setVendorId(draft.vendorId || '');
        setApprovalTargetUserId(draft.approvalTargetUserId || '');
        setManualVendor({
          vendorName: draft.manualVendorName || '',
          paidTo: draft.manualPaidTo || '',
          bankName: draft.manualBankName || '',
          accountNumber: draft.manualAccountNumber || '',
        });
        const restoreRow = (row: VoucherRow) => ({
          ...newRow(),
          ...row,
          category: row.category || '',
          tariffType: row.tariffType || 'FIXED',
          price: row.price ?? row.amount ?? 0,
          quantity: row.quantity ?? 1,
          unit: row.unit || '',
          remarks: row.remarks || '',
          customerName: draft.jobInfo === 'JOB_VESSEL'
            ? jobCalls.find((job) => job.jobId === row.jobNumber)?.vesselName || row.customerName
            : row.customerName,
        });
        const restoredRows = draft.rows.map(restoreRow);
        const lastRow = restoredRows[restoredRows.length - 1];
        const lastRowIsBlank = !!lastRow && !lastRow.jobNumber && !lastRow.customerName && !lastRow.itemService && !lastRow.category && !lastRow.price && !lastRow.amount && !lastRow.unit && !lastRow.remarks;
        const savedEntryRow = draft.entryRow ? restoreRow(draft.entryRow) : (lastRowIsBlank ? lastRow : newRow());
        setRows(draft.entryRow ? restoredRows : lastRowIsBlank ? restoredRows.slice(0, -1) : restoredRows);
        setEntryRow(savedEntryRow);
        setEditingRowId(draft.editingRowId || null);
        setDraftRestored(true);
      })
      .catch((error) => console.error('Gagal memuat draft voucher:', error))
      .finally(() => { if (!cancelled) setDraftLoaded(true); });
    return () => { cancelled = true; };
  }, [editingVoucher?.id]);

  useEffect(() => {
    if (editingVoucher || !draftLoaded) return;
    const hasEntryData = !!(entryRow.jobNumber || entryRow.documentNumber || entryRow.itemService || entryRow.amount || entryRow.customerName || entryRow.vatApplied || entryRow.pphRate);
    const hasManualVendor = !!(manualVendor.vendorName.trim() || manualVendor.paidTo.trim() || manualVendor.bankName.trim() || manualVendor.accountNumber.trim());
    const isBlank = rows.length === 0 && !vendorId && !hasManualVendor && !hasEntryData;
    const saveDraft = isBlank
      ? dataApi.deleteUserData('voucher_draft')
      : dataApi.saveUserData('voucher_draft', { requestDate, currency, exchangeRateUSDToIDR: exchangeRate, exchangeRateDate, requestedPaymentDate, jobInfo, vendorId, approvalTargetUserId, manualVendorName: manualVendor.vendorName, manualPaidTo: manualVendor.paidTo, manualBankName: manualVendor.bankName, manualAccountNumber: manualVendor.accountNumber, rows, entryRow, editingRowId } satisfies VoucherDraft);
    void saveDraft.catch((error) => console.error('Gagal menyimpan draft voucher:', error));
  }, [editingVoucher, draftLoaded, requestDate, currency, exchangeRate, exchangeRateDate, requestedPaymentDate, jobInfo, vendorId, approvalTargetUserId, manualVendor, rows, entryRow, editingRowId]);

  const resetForm = () => {
    if (!editingVoucher) void dataApi.deleteUserData('voucher_draft').catch((error) => console.error('Gagal menghapus draft voucher:', error));
    setDraftRestored(false);
    setRequestDate(todayIso());
    setCurrency('IDR');
    setExchangeRate(null);
    setExchangeRateDate('');
    setExchangeRateError('');
    setRequestedPaymentDate(todayIso());
    setJobInfo(jobVesselOnly ? 'JOB_VESSEL' : 'OPERASIONAL');
    setVendorId('');
    setApprovalTargetUserId('');
    setManualVendor({ vendorName: '', paidTo: '', bankName: '', accountNumber: '' });
    setRows([]);
    clearEntryRow();
  };

  const handlePrint = () => {
    setError('');
    if (!vendorDetails.vendorName || !vendorDetails.paidTo || !vendorDetails.bankName || !vendorDetails.accountNumber) {
      setError('Lengkapi Vendor Name, Paid To, Bank, dan A/c Number sebelum mencetak voucher.');
      return;
    }
    const printError = printPaymentVoucher({
      requestNumber,
      requestDate,
      currency,
      exchangeRateUSDToIDR: exchangeRate ?? undefined,
      exchangeRateDate,
      requestedPaymentDate,
      jobInfo,
      requestBy,
      checkerName: requestBy,
      signerName: editingVoucher?.reviewedBy,
      paidBy: editingVoucher?.paidBy,
      vendorName: vendorDetails.vendorName,
      paidTo: vendorDetails.paidTo,
      bankName: vendorDetails.bankName,
      accountNumber: vendorDetails.accountNumber,
      omitCustomerColumn: operationalOnly,
      items: rows.map((row) => ({ jobNumber: jobInfo === 'OPERASIONAL' ? operationalJobNumber : row.jobNumber, documentType: row.documentType, documentNumber: row.documentNumber, customerName: row.customerName, itemService: row.itemService, amount: row.amount, pphRate: row.pphRate, ...calculate(row) })),
    });
    if (printError) setError(printError);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const approvalTarget = approverUsers.find((user) => user.id === approvalTargetUserId);
    if (operationalOnly && !editingVoucher
      && (!approvalTarget || (approvalTarget.role !== 'MANAGER_OPS' && approvalTarget.role !== 'DIRECTOR'))) {
      setError('Pilih user tujuan approval sebelum mengirim voucher.');
      return;
    }
    if (!vendorDetails.vendorName || !vendorDetails.paidTo || !vendorDetails.bankName || !vendorDetails.accountNumber) {
      setError('Lengkapi Vendor Name, Paid To, Bank, dan A/c Number. Pilih vendor master atau isi data secara manual.');
      return;
    }
    if (currency === 'USD' && (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0 || isLoadingExchangeRate)) {
      setError(exchangeRateError || 'Kurs USD/IDR untuk Request Date belum tersedia.');
      return;
    }
    if (rows.length === 0) {
      setError('Tambahkan minimal satu item sebelum menyimpan payment voucher.');
      return;
    }
    if (entryRow.jobNumber.trim() || entryRow.documentNumber?.trim() || entryRow.itemService.trim() || entryRow.amount > 0 || entryRow.customerName.trim() || entryRow.vatApplied || entryRow.pphRate > 0) {
      setError('Tambahkan atau batalkan item yang sedang diisi sebelum menyimpan payment voucher.');
      return;
    }
    const invalidRow = rows.findIndex((row) => {
      const legacyCategoryMissing = editingVoucher?.items.some((item) => item.id === row.id && !item.category);
      return (jobInfo === 'JOB_VESSEL' && !row.jobNumber.trim())
        || (!operationalOnly && !row.customerName.trim())
        || !row.itemService.trim()
        || row.amount <= 0;
    });
    if (invalidRow >= 0) {
      const partyLabel = operationalOnly ? '' : jobInfo === 'JOB_VESSEL' ? 'Vessel name, ' : 'Customer, ';
      const jobNumberRequirement = jobInfo === 'JOB_VESSEL' ? 'JOB Number, ' : '';
      setError(`Baris ${invalidRow + 1}: ${jobNumberRequirement}${partyLabel}Description, dan Amount (> 0) wajib diisi.`);
      return;
    }
    const items: PaymentVoucherItem[] = rows.map((row) => ({
      id: row.id,
      jobNumber: jobInfo === 'OPERASIONAL' ? operationalJobNumber : row.jobNumber.trim(),
      documentType: jobInfo === 'JOB_VESSEL' ? row.documentType : undefined,
      documentNumber: jobInfo === 'JOB_VESSEL' ? row.documentNumber : undefined,
      customerName: row.customerName.trim(),
      itemService: row.itemService.trim(),
      category: row.category,
      tariffType: row.tariffType,
      price: row.price,
      quantity: row.quantity,
      unit: row.unit.trim(),
      remarks: row.remarks.trim(),
      amount: row.amount,
      vatApplied: row.vatApplied,
      pph23Applied: row.pphRate > 0,
      pphRate: row.pphRate,
      ...(() => {
        const result = calculate(row);
        return { vatAmount: result.vatAmount, total: result.total, pph23Amount: result.pph23Amount, paidAmount: result.paidAmount };
      })(),
    }));
    try {
      if (editingVoucher) {
        await db.updatePaymentVoucher(editingVoucher.id, {
          requestDate,
          currency,
          exchangeRateUSDToIDR: currency === 'USD' ? exchangeRate ?? undefined : undefined,
          exchangeRateDate: currency === 'USD' ? exchangeRateDate : '',
          requestedPaymentDate,
          jobInfo,
          vendorPartnerId: vendor?.id || '',
          vendorName: vendorDetails.vendorName,
          paidTo: vendorDetails.paidTo,
          bankName: vendorDetails.bankName,
          accountNumber: vendorDetails.accountNumber,
          items,
          totalPaidAmount: items.reduce((sum, item) => sum + item.paidAmount, 0),
        });
        onDataSaved?.();
        return;
      }
      const saved = await db.addPaymentVoucher({
        requestDate,
        currency,
        exchangeRateUSDToIDR: currency === 'USD' ? exchangeRate ?? undefined : undefined,
        exchangeRateDate: currency === 'USD' ? exchangeRateDate : '',
        requestedPaymentDate,
        jobInfo,
        requestBy,
        requestByUserId,
        approvalTargetRole: approvalTarget?.role === 'DIRECTOR'
          ? 'DIRECTOR'
          : approvalTarget?.role === 'MANAGER_OPS' ? 'MANAGER_OPS' : undefined,
        approvalTargetUserId: approvalTarget?.id,
        approvalTargetName: approvalTarget?.name,
        vendorPartnerId: vendor?.id || '',
        vendorName: vendorDetails.vendorName,
        paidTo: vendorDetails.paidTo,
        bankName: vendorDetails.bankName,
        accountNumber: vendorDetails.accountNumber,
        items,
        totalPaidAmount: items.reduce((sum, item) => sum + item.paidAmount, 0),
      });
      setMessage(`Payment Voucher ${saved.requestNumber} berhasil dikirim kepada ${approvalTarget?.name || 'Manager'} untuk persetujuan.`);
      setSavedTick((tick) => tick + 1);
      resetForm();
      onDataSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Payment Voucher gagal disimpan.');
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{editingVoucher ? 'Edit Form Request Payment' : 'Request Payment'}</div>
        <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">FORM REQUEST PAYMENT VOUCHER</h1>

        <div className="mt-5 grid grid-cols-1 gap-4 text-xs md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="font-semibold text-slate-500">Request Number</span>
            <input readOnly value={requestNumber} className={`${readonlyClass} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Request Date</span>
            <DateInput required value={requestDate} onChange={(value) => setRequestDate(value || todayIso())} ariaLabel="request date" inputClassName={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} className={`${inputClass} mt-1`}>
              <option value="IDR">IDR (Normal)</option>
              <option value="USD">USD</option>
            </select>
          </label>
          {currency === 'USD' && (
            <div className="block text-xs">
              <label htmlFor="voucher-usd-idr-rate" className="font-semibold text-slate-500">Kurs USD/IDR · Request Date</label>
              <input id="voucher-usd-idr-rate" readOnly value={exchangeRate ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(exchangeRate) : ''} placeholder={isLoadingExchangeRate ? 'Memuat kurs...' : 'Kurs belum tersedia'} className={`${readonlyClass} mt-1`} />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">{exchangeRateDate ? `Tanggal kurs: ${exchangeRateDate}` : ''}</span>
              {exchangeRateError && <span role="alert" className="mt-1 block text-[10px] font-normal text-rose-600">{exchangeRateError}</span>}
            </div>
          )}
          <label className="block">
            <span className="font-semibold text-slate-500">Requested Payment Date</span>
            <DateInput required value={requestedPaymentDate} onChange={setRequestedPaymentDate} ariaLabel="requested payment date" inputClassName={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Info JOB</span>
            {operationalOnly ? (
              <input readOnly value="Operasional" className={`${readonlyClass} mt-1`} />
            ) : jobVesselOnly ? (
              <input readOnly value="JOB Vessel" className={`${readonlyClass} mt-1`} />
            ) : (
              <select value={jobInfo} onChange={(e) => changeJobInfo(e.target.value as JobInfo)} className={`${inputClass} mt-1`}>
                <option value="OPERASIONAL">Operasional</option>
                <option value="JOB_VESSEL">JOB Vessel</option>
              </select>
            )}
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Request By</span>
            <input readOnly value={requestBy} className={`${readonlyClass} mt-1`} />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Vendor Name</span>
            <select value={vendorId} onChange={(e) => { setVendorId(e.target.value); setManualVendor({ vendorName: '', paidTo: '', bankName: '', accountNumber: '' }); }} className={`${inputClass} mt-1`}>
              <option value="">Input manual / tidak memilih vendor</option>
              {vendorPartners.map((item) => <option key={item.id} value={item.id}>{item.vendorName}</option>)}
            </select>
            {!vendor && <input value={manualVendor.vendorName} onChange={(event) => setManualVendor((current) => ({ ...current, vendorName: event.target.value }))} className={`${inputClass} mt-2`} placeholder="Ketik nama vendor" aria-label="Nama vendor manual" />}
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Paid To</span>
            {vendor ? <input readOnly value={vendor.paidName} className={`${readonlyClass} mt-1`} /> : <input value={manualVendor.paidTo} onChange={(event) => setManualVendor((current) => ({ ...current, paidTo: event.target.value }))} className={`${inputClass} mt-1`} placeholder="Nama penerima" />}
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">A/c Number Vendor</span>
            {vendor ? <input readOnly value={vendor.accountNumber} className={`${readonlyClass} mt-1 font-mono`} /> : <input value={manualVendor.accountNumber} onChange={(event) => setManualVendor((current) => ({ ...current, accountNumber: event.target.value }))} className={`${inputClass} mt-1 font-mono`} placeholder="Nomor rekening vendor" />}
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Bank</span>
            {vendor ? <input readOnly value={vendor.bankName} className={`${readonlyClass} mt-1`} /> : <input value={manualVendor.bankName} onChange={(event) => setManualVendor((current) => ({ ...current, bankName: event.target.value }))} className={`${inputClass} mt-1`} placeholder="Nama bank" />}
          </label>
        </div>
        {vendorPartners.length === 0 && (
          <p role="status" className="mt-3 text-[11px] text-amber-700">Belum ada data Vendor Partners. Minta Admin menambahkannya di Master Data.</p>
        )}
        {fpdaNumbersError && (
          <p role="alert" className="mt-3 text-[11px] text-rose-700">{fpdaNumbersError}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-sm font-black text-slate-900">Detail Voucher</h2>
          <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100">
            <Printer className="h-3.5 w-3.5" /> Cetak / PDF
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className={`w-full ${operationalOnly ? 'min-w-[820px]' : 'min-w-[1050px]'} text-left text-[11px]`}>
            <thead className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-2.5">No</th><th className="p-2.5">JOB Number</th>
                {!operationalOnly && <><th className="p-2.5">NO FDA</th><th className="p-2.5">Vessel Name</th></>}
                <th className="p-2.5">Description</th><th className="p-2.5 text-right">Amount ({currency})</th>
                <th className="p-2.5 text-right">VAT</th><th className="p-2.5 text-right">TOTAL</th>
                <th className="p-2.5 text-right">PPH</th><th className="p-2.5 text-right">Paid Amount</th><th className="p-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => {
                const result = calculate(row);
                const job = jobCalls.find((item) => item.jobId === row.jobNumber);
                return (
                  <tr key={row.id} className="text-slate-700">
                    <td className="p-2.5 font-mono">{index + 1}</td>
                    <td className="p-2.5">{row.jobNumber || '-'}</td>
                    {!operationalOnly && <>
                      <td className="p-2.5">{row.documentNumber || job?.fda?.fdaNo || '-'}</td>
                      <td className="p-2.5">{job?.vesselName || row.customerName || '-'}</td>
                    </>}
                    <td className="p-2.5 font-semibold">{row.itemService}</td>
                    <td className="p-2.5 text-right font-mono font-semibold">{money(row.amount, currency)}</td>
                    <td className="p-2.5 text-right font-mono">{money(result.vatAmount, currency)}</td>
                    <td className="p-2.5 text-right font-mono">{money(result.total, currency)}</td>
                    <td className="p-2.5 text-right font-mono align-middle">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <span>{money(result.pph23Amount, currency)}</span>
                        {row.pphRate > 0 && <span className="text-[9px] text-slate-500">{PPH_RATES.find((rate) => rate.value === row.pphRate)?.label.replace('PPh ', '')}</span>}
                      </div>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold">{money(result.paidAmount, currency)}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => editEntryRow(row)} title={`Edit item ${index + 1}`} aria-label={`Edit item ${index + 1}`} className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-sky-50 hover:text-sky-700"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => removeEntryRow(row.id)} title={`Hapus item ${index + 1}`} aria-label={`Hapus item ${index + 1}`} className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={operationalOnly ? 9 : 11} className="p-6 text-center text-xs text-slate-400">Belum ada item. Isi form di bawah lalu pilih Tambah Item.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase text-slate-500">
          <span>Total Paid Amount</span>
          <span className="font-mono text-slate-900">{money(grandTotal, currency)}</span>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">{editingRowId ? 'Edit Detail Item' : 'Tambah Item Detail Voucher'}</h3>
            {editingRowId && <button type="button" onClick={clearEntryRow} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">Batal edit</button>}
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-500">JOB Number</span>
              {jobInfo === 'JOB_VESSEL' ? <select value={entryRow.jobNumber} onChange={(event) => selectJob(event.target.value)} className={inputClass}><option value="">Pilih JOB</option>{activeJobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.jobId}</option>)}</select> : <input readOnly value={operationalJobNumber} className={readonlyClass} />}
            </label>
            {!operationalOnly && <label className="block">
              <span className="mb-1 block font-semibold text-slate-500">No FDA / FPDA</span>
              {(() => {
                const options = getDocumentOptions(entryRow.jobNumber);
                const currentValue = getDocumentOptionValue(entryRow.documentType, entryRow.documentNumber);
                const hasCurrentOption = options.some((option) => getDocumentOptionValue(option.type, option.number) === currentValue);
                return <select value={currentValue} disabled={options.length === 0 && !currentValue} onChange={(event) => { const [documentType, ...numberParts] = event.target.value.split('|'); updateEntryRow({ documentType: documentType === 'FDA' || documentType === 'FPDA' ? documentType : undefined, documentNumber: numberParts.join('|') }); }} className={inputClass} aria-label="Pilih nomor FDA / FPDA"><option value="">Pilih No FDA / FPDA</option>{!hasCurrentOption && currentValue && <option value={currentValue}>{entryRow.documentType}: {entryRow.documentNumber}</option>}{options.map((option) => <option key={`${option.type}:${option.number}`} value={getDocumentOptionValue(option.type, option.number)}>{option.type}: {option.number}</option>)}</select>;
              })()}
            </label>}
            {!operationalOnly && <label className="block">
              <span className="mb-1 block font-semibold text-slate-500">{jobInfo === 'JOB_VESSEL' ? 'Vessel name' : 'Customer'}</span>
              {jobInfo === 'JOB_VESSEL' ? <input readOnly value={entryRow.customerName} className={readonlyClass} placeholder="Pilih JOB" /> : <input value={entryRow.customerName} onChange={(event) => updateEntryRow({ customerName: event.target.value })} className={inputClass} placeholder="Customer" />}
            </label>}
            <label className="block lg:col-span-2">
              <span className="mb-1 block font-semibold text-slate-500">Item Service</span>
              <input value={entryRow.itemService} onChange={(event) => updateEntryRow({ itemService: event.target.value })} className={inputClass} placeholder="Nama service / kebutuhan" />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-500">Amount ({currency})</span>
              <input inputMode="decimal" value={entryRow.amount ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(entryRow.amount) : ''} onChange={(event) => updateEntryRow({ amount: parseTariffNumber(event.target.value) })} className={`${inputClass} text-right font-mono`} placeholder="0" />
            </label>
            <label className="flex items-end gap-2 pb-2 text-slate-700"><input type="checkbox" checked={entryRow.vatApplied} onChange={(event) => updateEntryRow({ vatApplied: event.target.checked })} /> VAT 11%</label>
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-500">Tarif PPh</span>
              <select value={entryRow.pphRate} onChange={(event) => updateEntryRow({ pphRate: Number(event.target.value) })} className={inputClass}>{PPH_RATES.map((rate) => <option key={rate.value} value={rate.value}>{rate.label}</option>)}</select>
            </label>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 sm:col-span-2 lg:col-span-4 xl:col-span-6">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Pratinjau Perhitungan</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3 xl:grid-cols-6">
                <div><span className="block text-slate-500">Amount</span><span className="font-mono font-semibold text-slate-800">{money(entryRow.amount, currency)}</span></div>
                <div><span className="block text-slate-500">VAT 11%</span><span className="font-mono font-semibold text-slate-800">{money(calculate(entryRow).vatAmount, currency)}</span></div>
                <div><span className="block text-slate-500">Total</span><span className="font-mono font-semibold text-slate-800">{money(calculate(entryRow).total, currency)}</span></div>
                <div><span className="block text-slate-500">PPH {entryRow.pphRate > 0 ? `(${PPH_RATES.find((rate) => rate.value === entryRow.pphRate)?.label.replace('PPh ', '')})` : ''}</span><span className="font-mono font-semibold text-rose-700">{money(calculate(entryRow).pph23Amount, currency)}</span></div>
                <div className="sm:col-span-2 xl:col-span-2"><span className="block text-slate-500">Paid Amount</span><span className="font-mono font-black text-slate-900">{money(calculate(entryRow).paidAmount, currency)}</span></div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={addEntryRow} className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-500">
              <Plus className="h-3.5 w-3.5" /> {editingRowId ? 'Simpan Item' : 'Tambah Item'}
            </button>
          </div>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}

      {draftRestored && !editingVoucher && (
        <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-700">
          Draft sebelumnya dipulihkan. Perubahan disimpan otomatis sampai voucher disimpan.
        </div>
      )}

      {operationalOnly && !editingVoucher && (
        <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-900">Sign to approval</h2>
            <p className="mt-1 text-xs text-slate-500">Pilih user yang akan menerima permintaan persetujuan voucher.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-xs">
              <span className="font-semibold text-slate-500">Tujuan permintaan approval</span>
              <select required value={approvalTargetUserId} onChange={(event) => setApprovalTargetUserId(event.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Pilih user approver</option>
                <optgroup label="User Manager Branch">
                  {approverUsers.filter((user) => user.role === 'MANAGER_OPS').map((user) => (
                    <option key={user.id} value={user.id}>User {user.username || user.id} - {user.name}</option>
                  ))}
                </optgroup>
                <optgroup label="User Dirops">
                  {approverUsers.filter((user) => user.role === 'DIRECTOR').map((user) => (
                    <option key={user.id} value={user.id}>User {user.username || user.id} - {user.name}</option>
                  ))}
                </optgroup>
              </select>
              {approverUsers.length === 0 && <span role="status" className="mt-1 block text-[11px] text-rose-600">Tidak ada user Manager Branch atau Dirops aktif yang dapat dipilih.</span>}
            </label>
            <button type="submit" disabled={approverUsers.length === 0} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" /> Kirim Voucher
            </button>
          </div>
        </section>
      )}

      <div className="flex justify-end gap-2">
        {editingVoucher && (
          <button type="button" onClick={onCancelEdit} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
            Batal
          </button>
        )}
        {(!operationalOnly || editingVoucher) && (
          <button type="submit" className="flex items-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
            {editingVoucher ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />} {editingVoucher ? 'Simpan Perubahan' : 'Kirim Voucher'}
          </button>
        )}
      </div>
    </form>
  );
};

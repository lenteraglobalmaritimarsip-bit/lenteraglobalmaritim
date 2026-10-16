import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Printer } from 'lucide-react';
import { JobCall, PaymentVoucher, PaymentVoucherItem, VendorPartner } from '../../types';
import { db } from '../../db/storage';
import { dataApi } from '../../lib/dataApi';
import { parseTariffNumber } from '../../utils/tariff';
import { printPaymentVoucher } from '../../utils/voucherPrint';

interface PaymentVoucherViewProps {
  jobCalls: JobCall[];
  vendorPartners: VendorPartner[];
  requestBy: string;
  requestByUserId?: string;
  onDataSaved?: () => void;
  voucher?: PaymentVoucher;
  onCancelEdit?: () => void;
  operationalOnly?: boolean;
}

type JobInfo = PaymentVoucher['jobInfo'];

interface VoucherRow {
  id: string;
  jobNumber: string;
  customerName: string;
  itemService: string;
  amount: number;
  vatApplied: boolean;
  pph23Applied: boolean;
}

const VAT_RATE = 0.11;
const PPH23_RATE = 0.02;

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const newRow = (): VoucherRow => ({
  id: `ROW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  jobNumber: '',
  customerName: '',
  itemService: '',
  amount: 0,
  vatApplied: false,
  pph23Applied: false,
});

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const calculate = (row: VoucherRow) => {
  const vatAmount = row.vatApplied ? row.amount * VAT_RATE : 0;
  const total = row.amount + vatAmount;
  const pph23Amount = row.pph23Applied ? row.amount * PPH23_RATE : 0;
  return { vatAmount, total, pph23Amount, paidAmount: total - pph23Amount };
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-slate-400 focus:outline-none';
const readonlyClass = 'w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700';

interface VoucherDraft {
  requestDate: string;
  jobInfo: JobInfo;
  vendorId: string;
  rows: VoucherRow[];
}

export const PaymentVoucherView: React.FC<PaymentVoucherViewProps> = ({ jobCalls, vendorPartners, requestBy, requestByUserId, onDataSaved, voucher: editingVoucher, onCancelEdit, operationalOnly = false }) => {
  const [requestDate, setRequestDate] = useState(() => editingVoucher ? String(editingVoucher.requestDate).slice(0, 10) : todayIso());
  const [jobInfo, setJobInfo] = useState<JobInfo>(operationalOnly ? 'OPERASIONAL' : editingVoucher?.jobInfo || 'OPERASIONAL');
  const [vendorId, setVendorId] = useState(editingVoucher?.vendorPartnerId || '');
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(!!editingVoucher);
  const [rows, setRows] = useState<VoucherRow[]>(() => editingVoucher && editingVoucher.items.length > 0
    ? editingVoucher.items.map((item) => ({
        id: item.id,
        jobNumber: item.jobNumber,
        customerName: editingVoucher.jobInfo === 'JOB_VESSEL'
          ? jobCalls.find((job) => job.jobId === item.jobNumber)?.vesselName || item.customerName
          : item.customerName,
        itemService: item.itemService,
        amount: item.amount,
        vatApplied: !!item.vatApplied,
        pph23Applied: !!item.pph23Applied,
      }))
    : [newRow()]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savedTick, setSavedTick] = useState(0);

  const activeJobs = useMemo(
    () => jobCalls.filter((job) => job.status !== 'CLOSED' && job.currentStage !== 'CLOSED' && !job.closing?.isClosed),
    [jobCalls],
  );

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

  const updateRow = (id: string, patch: Partial<VoucherRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const changeJobInfo = (value: JobInfo) => {
    setJobInfo(value);
    setRows((current) => current.map((row) => ({
      ...row,
      jobNumber: value === 'OPERASIONAL' ? operationalJobNumber : '',
      customerName: '',
      itemService: '',
    })));
  };

  const selectJob = (rowId: string, jobNumber: string) => {
    const job = activeJobs.find((item) => item.jobId === jobNumber);
    updateRow(rowId, {
      jobNumber,
      customerName: job
        ? jobInfo === 'JOB_VESSEL' ? job.vesselName : job.customerName
        : '',
      itemService: '',
    });
  };

  const optionLabel = (value: string, item: VendorPartner, key: 'bankName' | 'paidName' | 'accountNumber') => {
    const duplicated = vendorPartners.filter((other) => other[key] === value).length > 1;
    return duplicated ? `${value} (${item.vendorName})` : value;
  };

  const grandTotal = rows.reduce((sum, row) => sum + calculate(row).paidAmount, 0);

  useEffect(() => {
    if (editingVoucher) {
      setDraftLoaded(true);
      return;
    }
    let cancelled = false;
    void dataApi.getUserData<VoucherDraft>('voucher_draft')
      .then((draft) => {
        if (cancelled || !draft || !Array.isArray(draft.rows) || draft.rows.length === 0) return;
        setRequestDate(draft.requestDate || todayIso());
        setJobInfo(operationalOnly ? 'OPERASIONAL' : draft.jobInfo || 'OPERASIONAL');
        setVendorId(draft.vendorId || '');
        setRows(draft.rows.map((row) => ({
          ...row,
          customerName: draft.jobInfo === 'JOB_VESSEL'
            ? jobCalls.find((job) => job.jobId === row.jobNumber)?.vesselName || row.customerName
            : row.customerName,
        })));
        setDraftRestored(true);
      })
      .catch((error) => console.error('Gagal memuat draft voucher:', error))
      .finally(() => { if (!cancelled) setDraftLoaded(true); });
    return () => { cancelled = true; };
  }, [editingVoucher?.id]);

  useEffect(() => {
    if (editingVoucher || !draftLoaded) return;
    const isBlank = !vendorId && rows.every((row) => !row.jobNumber && !row.customerName && !row.itemService && !row.amount);
    const saveDraft = isBlank
      ? dataApi.deleteUserData('voucher_draft')
      : dataApi.saveUserData('voucher_draft', { requestDate, jobInfo, vendorId, rows } satisfies VoucherDraft);
    void saveDraft.catch((error) => console.error('Gagal menyimpan draft voucher:', error));
  }, [editingVoucher, draftLoaded, requestDate, jobInfo, vendorId, rows]);

  const resetForm = () => {
    if (!editingVoucher) void dataApi.deleteUserData('voucher_draft').catch((error) => console.error('Gagal menghapus draft voucher:', error));
    setDraftRestored(false);
    setRequestDate(todayIso());
    setJobInfo('OPERASIONAL');
    setVendorId('');
    setRows([newRow()]);
  };

  const handlePrint = () => {
    setError('');
    if (!vendor) {
      setError('Pilih vendor sebelum mencetak voucher.');
      return;
    }
    const printError = printPaymentVoucher({
      requestNumber,
      requestDate,
      jobInfo,
      requestBy,
      checkerName: requestBy,
      signerName: editingVoucher?.reviewedBy,
      paidBy: editingVoucher?.paidBy,
      vendorName: vendor.vendorName,
      paidTo: vendor.paidName,
      bankName: vendor.bankName,
      accountNumber: vendor.accountNumber,
      items: rows.map((row) => ({ jobNumber: jobInfo === 'OPERASIONAL' ? operationalJobNumber : row.jobNumber, customerName: row.customerName, itemService: row.itemService, amount: row.amount, ...calculate(row) })),
    });
    if (printError) setError(printError);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!vendor) {
      setError('Pilih vendor dari master data Vendor Partners.');
      return;
    }
    const invalidRow = rows.findIndex((row) => (jobInfo === 'JOB_VESSEL' && !row.jobNumber.trim()) || !row.customerName.trim() || !row.itemService.trim() || row.amount <= 0);
    if (invalidRow >= 0) {
      const partyLabel = jobInfo === 'JOB_VESSEL' ? 'Vessel name' : 'Customer';
      const jobNumberRequirement = jobInfo === 'JOB_VESSEL' ? 'JOB Number, ' : '';
      setError(`Baris ${invalidRow + 1}: ${jobNumberRequirement}${partyLabel}, Item Service, dan Amount (> 0) wajib diisi.`);
      return;
    }
    const items: PaymentVoucherItem[] = rows.map((row) => ({
      id: row.id,
      jobNumber: jobInfo === 'OPERASIONAL' ? operationalJobNumber : row.jobNumber.trim(),
      customerName: row.customerName.trim(),
      itemService: row.itemService.trim(),
      amount: row.amount,
      vatApplied: row.vatApplied,
      pph23Applied: row.pph23Applied,
      ...(() => {
        const result = calculate(row);
        return { vatAmount: result.vatAmount, total: result.total, pph23Amount: result.pph23Amount, paidAmount: result.paidAmount };
      })(),
    }));
    try {
      if (editingVoucher) {
        await db.updatePaymentVoucher(editingVoucher.id, {
          requestDate,
          jobInfo,
          vendorPartnerId: vendor.id,
          vendorName: vendor.vendorName,
          paidTo: vendor.paidName,
          bankName: vendor.bankName,
          accountNumber: vendor.accountNumber,
          items,
          totalPaidAmount: items.reduce((sum, item) => sum + item.paidAmount, 0),
        });
        onDataSaved?.();
        return;
      }
      const saved = await db.addPaymentVoucher({
        requestDate,
        jobInfo,
        requestBy,
        requestByUserId,
        vendorPartnerId: vendor.id,
        vendorName: vendor.vendorName,
        paidTo: vendor.paidName,
        bankName: vendor.bankName,
        accountNumber: vendor.accountNumber,
        items,
        totalPaidAmount: items.reduce((sum, item) => sum + item.paidAmount, 0),
      });
      setMessage(`Payment Voucher ${saved.requestNumber} berhasil disimpan dan dikirim ke Manager untuk persetujuan.`);
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
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{editingVoucher ? 'Edit Voucher' : 'Request Payment'}</div>
        <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">PAYMENT VOUCHER</h1>

        <div className="mt-5 grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
          <label className="block">
            <span className="font-semibold text-slate-500">Request Number</span>
            <input readOnly value={requestNumber} className={`${readonlyClass} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Request Date</span>
            <input type="date" required value={requestDate} onChange={(e) => setRequestDate(e.target.value || todayIso())} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Info JOB</span>
            {operationalOnly ? (
              <input readOnly value="Operasional" className={`${readonlyClass} mt-1`} />
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
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Pilih vendor</option>
              {vendorPartners.map((item) => <option key={item.id} value={item.id}>{item.vendorName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Paid To</span>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Pilih penerima</option>
              {vendorPartners.map((item) => <option key={item.id} value={item.id}>{optionLabel(item.paidName, item, 'paidName') || item.vendorName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">Bank</span>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Pilih bank</option>
              {vendorPartners.map((item) => <option key={item.id} value={item.id}>{optionLabel(item.bankName, item, 'bankName') || item.vendorName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold text-slate-500">A/c Number</span>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={`${inputClass} mt-1 font-mono`}>
              <option value="">Pilih nomor rekening</option>
              {vendorPartners.map((item) => <option key={item.id} value={item.id}>{optionLabel(item.accountNumber, item, 'accountNumber') || item.vendorName}</option>)}
            </select>
          </label>
        </div>
        {vendorPartners.length === 0 && (
          <p className="mt-3 text-[11px] text-amber-700">Belum ada data Vendor Partners. Minta Admin menambahkannya di Master Data.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-sm font-black text-slate-900">Detail Voucher</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200">
              <Plus className="h-3.5 w-3.5" /> Tambah Item
            </button>
            <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100">
              <Printer className="h-3.5 w-3.5" /> Cetak / PDF
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-3">No</th>
                <th className="p-3">JOB Number</th>
                <th className="p-3">{jobInfo === 'JOB_VESSEL' ? 'Vessel name' : 'Customer'}</th>
                <th className="p-3">Item Service</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Vat (11%)</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">PPH 23 (2%)</th>
                <th className="p-3 text-right">Paid Amount</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => {
                const result = calculate(row);
                return (
                  <tr key={row.id} className="align-top">
                    <td className="p-3 font-mono text-slate-500">{index + 1}</td>
                    <td className="w-44 p-3">
                      {jobInfo === 'JOB_VESSEL' ? (
                        <select value={row.jobNumber} onChange={(e) => selectJob(row.id, e.target.value)} className={inputClass}>
                          <option value="">Pilih JOB</option>
                          {activeJobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.jobId}</option>)}
                        </select>
                      ) : (
                        <input readOnly value={operationalJobNumber} className={readonlyClass} />
                      )}
                    </td>
                    <td className="w-52 p-3">
                      {jobInfo === 'JOB_VESSEL' ? (
                        <input readOnly value={row.customerName} className={readonlyClass} placeholder="Otomatis dari JOB" />
                      ) : (
                        <input value={row.customerName} onChange={(e) => updateRow(row.id, { customerName: e.target.value })} className={inputClass} placeholder="Customer" />
                      )}
                    </td>
                    <td className="w-60 p-3">
                      <input value={row.itemService} onChange={(e) => updateRow(row.id, { itemService: e.target.value })} className={inputClass} placeholder="Input item service" />
                    </td>
                    <td className="w-36 p-3">
                      <input
                        inputMode="decimal"
                        value={row.amount ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row.amount) : ''}
                        onChange={(e) => updateRow(row.id, { amount: parseTariffNumber(e.target.value) })}
                        className={`${inputClass} text-right font-mono`}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <label className="flex items-center justify-end gap-1.5"><input type="checkbox" checked={row.vatApplied} onChange={(e) => updateRow(row.id, { vatApplied: e.target.checked })} /><span className="font-mono">{money(result.vatAmount)}</span></label>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">{money(result.total)}</td>
                    <td className="p-3 text-right">
                      <label className="flex items-center justify-end gap-1.5"><input type="checkbox" checked={row.pph23Applied} onChange={(e) => updateRow(row.id, { pph23Applied: e.target.checked })} /><span className="font-mono">{money(result.pph23Amount)}</span></label>
                    </td>
                    <td className="p-3 text-right font-mono font-black text-slate-900">{money(result.paidAmount)}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        disabled={rows.length === 1}
                        onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                        className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                        title="Hapus item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={8} className="p-3 text-right text-[11px] font-bold uppercase text-slate-500">Total Paid Amount</td>
                <td className="p-3 text-right font-mono font-black text-slate-900">{money(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}

      {draftRestored && !editingVoucher && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-700">
          Draft sebelumnya dipulihkan. Perubahan disimpan otomatis sampai voucher disimpan.
        </div>
      )}

      <div className="flex justify-end gap-2">
        {editingVoucher && (
          <button type="button" onClick={onCancelEdit} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
            Batal
          </button>
        )}
        <button type="submit" className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300">
          <Save className="h-4 w-4" /> {editingVoucher ? 'Simpan Perubahan' : 'Simpan Voucher'}
        </button>
      </div>
    </form>
  );
};

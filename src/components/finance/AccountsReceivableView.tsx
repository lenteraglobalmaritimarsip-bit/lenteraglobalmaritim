import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import ExcelJS from 'exceljs';
import { AccountsReceivableEntry, BankAccount, ReceivableInvoiceOption, ReceivableInvoiceType } from '../../types';
import { createAccountsReceivableEntry, loadAccountsReceivableHistory, loadAccountsReceivableOptions } from '../../lib/api';
import { formatDateDisplay } from '../../utils/date';

interface AccountsReceivableViewProps {
  mode: 'INPUT' | 'HISTORY';
}

const formatAmount = (value: number, currency: 'IDR' | 'USD') => new Intl.NumberFormat(
  currency === 'IDR' ? 'id-ID' : 'en-US',
  { style: 'currency', currency, maximumFractionDigits: currency === 'IDR' ? 0 : 2 },
).format(value || 0);

const invoiceOptionKey = (option: ReceivableInvoiceOption) =>
  `${option.jobId}:${option.invoiceType}:${option.invoiceNo}`;
const MAX_RECEIVABLE_ATTACHMENT_SIZE = 1024 * 1024;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const AccountsReceivableView: React.FC<AccountsReceivableViewProps> = ({ mode }) => {
  const [invoiceOptions, setInvoiceOptions] = useState<ReceivableInvoiceOption[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [entries, setEntries] = useState<AccountsReceivableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [selectedInvoiceKey, setSelectedInvoiceKey] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState('');
  const [pph23AmountIDR, setPph23AmountIDR] = useState('0');
  const [remark, setRemark] = useState('');
  const [idrAmount, setIdrAmount] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    const request = mode === 'INPUT'
      ? loadAccountsReceivableOptions().then(({ invoiceOptions: options, bankAccounts: banks }) => {
          if (cancelled) return;
          setInvoiceOptions(options);
          setBankAccounts(banks);
        })
      : loadAccountsReceivableHistory().then((history) => {
          if (!cancelled) setEntries(history);
        });
    void request
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Accounts Receivable gagal dimuat.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  const principals = useMemo(
    () => [...new Set<string>(invoiceOptions.map((option) => option.principalName))].sort((first, second) => first.localeCompare(second)),
    [invoiceOptions],
  );
  const vessels = useMemo(
    () => [...new Set<string>(invoiceOptions.filter((option) => option.principalName === principalName).map((option) => option.vesselName))]
      .sort((first, second) => first.localeCompare(second)),
    [invoiceOptions, principalName],
  );
  const filteredInvoices = useMemo(
    () => invoiceOptions.filter((option) => option.principalName === principalName && option.vesselName === vesselName),
    [invoiceOptions, principalName, vesselName],
  );
  const selectedInvoice = filteredInvoices.find((option) => invoiceOptionKey(option) === selectedInvoiceKey) || null;
  const selectedBank = bankAccounts.find((account) => account.id === bankAccountId) || null;
  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate);
  const filteredEntries = useMemo(
    () => invalidDateRange ? [] : entries.filter((entry) =>
      (!startDate || entry.incomeDate >= startDate) && (!endDate || entry.incomeDate <= endDate),
    ),
    [entries, startDate, endDate, invalidDateRange],
  );

  const handleDownloadHistory = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('History Receivable');
    worksheet.addRow(['No', 'Date Income', 'Principal', 'Vessel', 'Invoice Type', 'Invoice No', 'PPh 23 (IDR)', 'Remark', 'Bank', 'A/C Name', 'A/C Number', 'IDR Amount', 'USD Amount', 'Photo Bukti Kas', 'Created By']);
    filteredEntries.forEach((entry, index) => worksheet.addRow([
      index + 1, entry.incomeDate, entry.principalName, entry.vesselName, entry.invoiceType, entry.invoiceNo,
      entry.pph23AmountIDR, entry.remark, entry.bankName, entry.accountName, entry.accountNumber,
      entry.idrAmount, entry.usdAmount, entry.attachmentName, entry.createdBy,
    ]));
    worksheet.getRow(1).font = { bold: true };
    [8, 14].forEach((column) => { worksheet.getColumn(column).width = 32; });
    [7, 12, 13].forEach((column) => { worksheet.getColumn(column).numFmt = '#,##0.00'; });
    worksheet.columns.forEach((column) => { if (!column.width) column.width = 18; });
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `history-receivable-${startDate || 'awal'}-${endDate || 'akhir'}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintHistory = () => {
    const rows = filteredEntries.map((entry) => `<tr><td>${escapeHtml(formatDateDisplay(entry.incomeDate))}</td><td>${escapeHtml(entry.principalName)}</td><td>${escapeHtml(entry.vesselName)}</td><td>${escapeHtml(`${entry.invoiceType} · ${entry.invoiceNo}`)}</td><td>${escapeHtml(formatAmount(entry.pph23AmountIDR, 'IDR'))}</td><td>${escapeHtml(entry.remark)}</td><td>${escapeHtml(entry.bankName)}</td><td>${escapeHtml(`${entry.accountName} · ${entry.accountNumber}`)}</td><td>${escapeHtml(formatAmount(entry.idrAmount, 'IDR'))}</td><td>${escapeHtml(formatAmount(entry.usdAmount, 'USD'))}</td><td>${entry.attachmentDataUrl ? `<img src="${escapeHtml(entry.attachmentDataUrl)}" alt="${escapeHtml(entry.attachmentName)}" />` : '-'}</td></tr>`).join('');
    const range = `${startDate || 'Awal'} - ${endDate || 'Akhir'}`;
    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>History Receivable</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;margin:0}h1{font-size:18px;margin:0 0 4px}p{font-size:10px;color:#64748b;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:7px}th{background:#eef3f9;text-align:left;padding:5px;border:1px solid #d5deea}td{padding:5px;border:1px solid #dfe6ef;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even){background:#fafcff}img{max-width:48px;max-height:36px;object-fit:contain}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>History Receivable</h1><p>Periode: ${escapeHtml(range)} · ${filteredEntries.length} data</p><table><thead><tr><th>Date Income</th><th>Principal</th><th>Vessel</th><th>Invoice</th><th>PPh 23</th><th>Remark</th><th>Bank</th><th>A/C Account</th><th>IDR Amount</th><th>USD Amount</th><th>Photo Bukti Kas</th></tr></thead><tbody>${rows || '<tr><td colspan="11">Tidak ada data pada periode ini.</td></tr>'}</tbody></table><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    printWindow.document.close();
  };

  const resetForm = () => {
    setPrincipalName('');
    setVesselName('');
    setSelectedInvoiceKey('');
    setIncomeDate(new Date().toISOString().slice(0, 10));
    setBankAccountId('');
    setPph23AmountIDR('0');
    setRemark('');
    setIdrAmount('');
    setUsdAmount('');
    setAttachment(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAttachment(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Photo bukti kas harus berupa file JPG atau PNG.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_RECEIVABLE_ATTACHMENT_SIZE) {
      setError('Ukuran photo bukti kas maksimal 1 MB.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Photo bukti kas tidak dapat dibaca.'));
        reader.onerror = () => reject(new Error('Gagal membaca photo bukti kas.'));
        reader.readAsDataURL(file);
      });
      setAttachment({ name: file.name, dataUrl });
      setError('');
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Gagal membaca photo bukti kas.');
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setError('');
    setMessage('');
    const parsedPph23 = Number(pph23AmountIDR || 0);
    const parsedIdr = Number(idrAmount || 0);
    const parsedUsd = Number(usdAmount || 0);
    if (!selectedInvoice || !selectedBank || !incomeDate || !remark.trim() || !attachment
      || !Number.isFinite(parsedPph23) || parsedPph23 < 0
      || !Number.isFinite(parsedIdr) || parsedIdr < 0
      || !Number.isFinite(parsedUsd) || parsedUsd < 0
      || (parsedIdr <= 0 && parsedUsd <= 0)) {
      setError('Lengkapi tanggal, invoice, rekening, photo bukti kas, remark, dan isi salah satu amount IDR/USD dengan nilai di atas nol.');
      return;
    }

    setIsSaving(true);
    try {
      await createAccountsReceivableEntry({
        jobId: selectedInvoice.jobId,
        invoiceType: selectedInvoice.invoiceType,
        invoiceNo: selectedInvoice.invoiceNo,
        incomeDate,
        bankAccountId: selectedBank.id,
        pph23AmountIDR: parsedPph23,
        remark: remark.trim(),
        idrAmount: parsedIdr,
        usdAmount: parsedUsd,
        attachmentName: attachment.name,
        attachmentDataUrl: attachment.dataUrl,
      });
      resetForm();
      setMessage('Penerimaan berhasil disimpan.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Penerimaan gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Finance · Accounts Receivable</div>
        <h1 className="mt-1 text-xl font-black text-slate-900">{mode === 'INPUT' ? 'Input Receivable' : 'History Receivable'}</h1>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}
      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat data...</div>
      ) : mode === 'INPUT' ? (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Date Income *
            <input type="date" required value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Principal *
            <select required value={principalName} onChange={(event) => { setPrincipalName(event.target.value); setVesselName(''); setSelectedInvoiceKey(''); }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
              <option value="">Pilih Principal</option>
              {principals.map((principal) => <option key={principal} value={principal}>{principal}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Vessel *
            <select required disabled={!principalName} value={vesselName} onChange={(event) => { setVesselName(event.target.value); setSelectedInvoiceKey(''); }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100">
              <option value="">Pilih Vessel</option>
              {vessels.map((vessel) => <option key={vessel} value={vessel}>{vessel}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Invoice *
            <select required disabled={!vesselName} value={selectedInvoiceKey} onChange={(event) => setSelectedInvoiceKey(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100">
              <option value="">Pilih FDA / FPDA</option>
              {filteredInvoices.map((option) => <option key={invoiceOptionKey(option)} value={invoiceOptionKey(option)}>{option.invoiceType} · {option.invoiceNo} · {option.jobId}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">PPh 23 (IDR)
            <input type="number" min="0" step="1" value={pph23AmountIDR} onChange={(event) => setPph23AmountIDR(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Bank *
            <select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
              <option value="">Pilih Bank</option>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bankName}{account.branch ? ` · ${account.branch}` : ''}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">A/C Account
            <input readOnly value={selectedBank ? `${selectedBank.accountName} · ${selectedBank.accountNumber}` : ''} placeholder="Otomatis dari pilihan Bank" className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600" />
          </label>
          <label className="text-xs font-semibold text-slate-600">IDR Amount
            <input type="number" min="0" step="1" value={idrAmount} onChange={(event) => setIdrAmount(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-semibold text-slate-600">USD Amount
            <input type="number" min="0" step="0.01" value={usdAmount} onChange={(event) => setUsdAmount(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Photo Bukti Kas *
            <input ref={attachmentInputRef} type="file" required accept="image/jpeg,image/png" onChange={(event) => void handleAttachmentChange(event)} className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold" />
            {attachment && <span className="mt-1 block truncate text-[11px] text-slate-500">{attachment.name}</span>}
          </label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2 xl:col-span-3">Remark *
            <textarea required rows={3} value={remark} onChange={(event) => setRemark(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
          </label>
          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button type="submit" disabled={isSaving || invoiceOptions.length === 0 || bankAccounts.length === 0} className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? 'Menyimpan...' : 'Tambah Uang Masuk'}
            </button>
          </div>
        </form>
      ) : (
        <>
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">START
              <input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold normal-case text-slate-700" />
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">END
              <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold normal-case text-slate-700" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleDownloadHistory()} disabled={!filteredEntries.length || invalidDateRange} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Download size={14} /> Download Excel</button>
            <button type="button" onClick={handlePrintHistory} disabled={invalidDateRange} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer size={14} /> Cetak / PDF</button>
          </div>
          {invalidDateRange && <p role="alert" className="w-full text-xs font-semibold text-rose-600">START harus sebelum atau sama dengan END.</p>}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1400px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="p-3">Date Income</th><th className="p-3">Principal</th><th className="p-3">Vessel</th><th className="p-3">Invoice</th><th className="p-3 text-right">PPh 23 (IDR)</th><th className="p-3">Remark</th><th className="p-3">Bank</th><th className="p-3">A/C Account</th><th className="p-3 text-right">IDR Amount</th><th className="p-3 text-right">USD Amount</th><th className="p-3">Photo Bukti Kas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? <tr><td colSpan={11} className="p-8 text-center text-slate-500">Belum ada data receivable pada periode ini.</td></tr> : filteredEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="p-3 text-slate-700">{formatDateDisplay(entry.incomeDate)}</td>
                  <td className="p-3 font-semibold text-slate-900">{entry.principalName}</td>
                  <td className="p-3 text-slate-700">{entry.vesselName}</td>
                  <td className="p-3 font-mono text-slate-700">{entry.invoiceType} · {entry.invoiceNo}</td>
                  <td className="p-3 text-right font-mono">{formatAmount(entry.pph23AmountIDR, 'IDR')}</td>
                  <td className="max-w-[280px] p-3 text-slate-700">{entry.remark}</td>
                  <td className="p-3 text-slate-700">{entry.bankName}</td>
                  <td className="p-3 font-mono text-slate-700">{entry.accountName} · {entry.accountNumber}</td>
                  <td className="p-3 text-right font-mono text-slate-900">{entry.idrAmount > 0 ? formatAmount(entry.idrAmount, 'IDR') : '-'}</td>
                  <td className="p-3 text-right font-mono text-slate-900">{entry.usdAmount > 0 ? formatAmount(entry.usdAmount, 'USD') : '-'}</td>
                  <td className="p-3"><a href={entry.attachmentDataUrl} download={entry.attachmentName} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">Lihat Foto</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil, Save, Search, X } from 'lucide-react';
import ExcelJS from 'exceljs';
import { DateInput } from '../shared/DateInput';
import { loadAccountingChartOfAccounts, loadAccountingPostedJournalReport, updateAccountingPostedJournal } from '../../lib/api';
import { AccountingPostedJournalRow, ChartOfAccount } from '../../types';

const headers = [
  'Journal No', 'date Jurnal', 'NO AR/AP', 'Applied', 'Shipment', 'Customer', 'Job Vessel', 'Ref No FDA',
  'BL', 'Curr', 'Kurs', 'Item', 'Vendor', 'Description', 'COA', 'Nama COA', 'D/K', 'Amount',
];

const toExcelDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : '';
};

const toExcelRow = (row: AccountingPostedJournalRow) => [
  row.journalNumber,
  toExcelDate(row.journalDate),
  row.arApNumber,
  toExcelDate(row.appliedDate),
  row.shipment,
  row.customer,
  row.jobVessel,
  row.refNoFda,
  row.bl,
  row.currency,
  row.exchangeRate,
  row.item,
  row.vendor,
  row.description,
  row.coa,
  row.accountName,
  row.direction,
  row.amount,
];

const displayDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || '-';
};

const formatAmount = (value: number) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value || 0);

const pageSizes = [50, 100, 250] as const;

export const AccountingPostedJournalReport: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rows, setRows] = useState<AccountingPostedJournalRow[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [editingJournalId, setEditingJournalId] = useState('');
  const [editJournalDate, setEditJournalDate] = useState('');
  const [editLines, setEditLines] = useState<AccountingPostedJournalRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const initialLoadStarted = useRef(false);
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const loadReport = async () => {
    if (invalidRange || isLoading) return;
    setIsLoading(true);
    setError('');
    setMessage('');
    try {
      const [result, chartOfAccounts] = await Promise.all([
        loadAccountingPostedJournalReport(startDate, endDate),
        loadAccountingChartOfAccounts(),
      ]);
      setRows(result);
      setAccounts(chartOfAccounts);
      setLoaded(true);
      setPage(1);
      setMessage(`${result.length.toLocaleString('en-US')} baris jurnal posted dimuat.`);
    } catch (loadError) {
      setRows([]);
      setLoaded(false);
      setError(loadError instanceof Error ? loadError.message : 'Laporan posted jurnal gagal dimuat.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadReport();
  }, []);

  const downloadReport = async () => {
    if (!loaded || invalidRange || isDownloading) return;
    setIsDownloading(true);
    setError('');
    setMessage('');
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Hasil Posted Jurnal');
      sheet.addRow(headers);
      rows.forEach((row) => sheet.addRow(toExcelRow(row)));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'R1' };
      sheet.columns = [
        { width: 28 }, { width: 14 }, { width: 24 }, { width: 14 }, { width: 24 }, { width: 30 },
        { width: 24 }, { width: 24 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 30 },
        { width: 30 }, { width: 40 }, { width: 16 }, { width: 34 }, { width: 8 }, { width: 18 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245F4C' } };
      [2, 4].forEach((column) => { sheet.getColumn(column).numFmt = 'dd-mm-yyyy'; });
      sheet.getColumn(11).numFmt = '#,##0.0000';
      sheet.getColumn(18).numFmt = '#,##0.00;[Red]-#,##0.00';
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `hasil-posted-jurnal-${startDate || 'awal'}-${endDate || 'akhir'}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Excel berhasil dibuat: ${rows.length.toLocaleString('en-US')} baris jurnal posted.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Laporan posted jurnal gagal diunduh.');
    } finally {
      setIsDownloading(false);
    }
  };

  const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold normal-case text-slate-700';
  const updateStartDate = (value: string) => {
    setStartDate(value);
    setRows([]);
    setLoaded(false);
    setMessage('');
  };
  const updateEndDate = (value: string) => {
    setEndDate(value);
    setRows([]);
    setLoaded(false);
    setMessage('');
  };
  const startEditing = (row: AccountingPostedJournalRow) => {
    if (!row.journalId || !row.journalLineId) {
      setError('Baris jurnal ini tidak memiliki identitas database sehingga tidak dapat diedit.');
      return;
    }
    const journalRows = rows.filter((entry) => entry.journalId === row.journalId);
    if (journalRows.some((entry) => !entry.journalLineId)) {
      setError('Sebagian baris jurnal tidak lengkap. Muat ulang data sebelum mengedit.');
      return;
    }
    setError('');
    setMessage('');
    setEditingJournalId(row.journalId);
    setEditJournalDate(row.journalDate);
    setEditLines(journalRows.map((entry) => ({ ...entry })));
  };
  const updateEditLine = <K extends keyof AccountingPostedJournalRow>(
    index: number,
    key: K,
    value: AccountingPostedJournalRow[K],
  ) => {
    setEditLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, [key]: value } : line,
    ));
  };
  const saveEdits = async () => {
    if (!editingJournalId || isSaving) return;
    const debit = editLines.reduce((sum, line) => sum + (line.direction === 'D' ? Number(line.amount) || 0 : 0), 0);
    const credit = editLines.reduce((sum, line) => sum + (line.direction === 'K' ? Number(line.amount) || 0 : 0), 0);
    if (!editJournalDate || editLines.length < 2 || Math.abs(Math.round((debit - credit) * 100) / 100) > 0.01) {
      setError('Tanggal jurnal wajib diisi dan total Debit/Kredit harus seimbang sebelum menyimpan.');
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await updateAccountingPostedJournal({
        journalId: editingJournalId,
        journalDate: editJournalDate,
        lines: editLines.map((line) => ({
          id: line.journalLineId,
          coaId: line.coaId,
          memo: line.description,
          direction: line.direction === 'D' ? 'DEBIT' : 'CREDIT',
          amount: Number(line.amount),
          overrides: {
            arApNumber: line.arApNumber,
            appliedDate: line.appliedDate,
            shipment: line.shipment,
            customer: line.customer,
            jobVessel: line.jobVessel,
            refNoFda: line.refNoFda,
            bl: line.bl,
            currency: line.currency,
            exchangeRate: Number(line.exchangeRate) || 0,
            item: line.item,
            vendor: line.vendor,
          },
        })),
      });
      setEditingJournalId('');
      setEditLines([]);
      setMessage(`Jurnal ${editLines[0]?.journalNumber || ''} berhasil diperbarui ke database.`);
      try {
        const refreshedRows = await loadAccountingPostedJournalReport(startDate, endDate);
        setRows(refreshedRows);
        setLoaded(true);
        setPage(1);
      } catch (refreshError) {
        setError(`Perubahan sudah tersimpan, tetapi laporan gagal dimuat ulang: ${refreshError instanceof Error ? refreshError.message : 'kesalahan tidak diketahui.'}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Perubahan jurnal gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accounting Pusat</div>
        <h1 className="mt-1 text-xl font-black text-slate-900">Hasil Posted Jurnal</h1>
        <p className="mt-1 text-xs text-slate-500">Data jurnal posted lintas branch sesuai tanggal jurnal.</p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}

      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="grid min-w-48 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Start
          <DateInput value={startDate} max={endDate || undefined} onChange={updateStartDate} inputClassName={inputClass} ariaLabel="Tanggal awal posted journal" />
        </label>
        <label className="grid min-w-48 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          End
          <DateInput value={endDate} min={startDate || undefined} onChange={updateEndDate} inputClassName={inputClass} ariaLabel="Tanggal akhir posted journal" />
        </label>
        <button type="button" onClick={() => void loadReport()} disabled={isLoading || invalidRange} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Search size={15} /> {isLoading ? 'Memuat...' : 'Tampilkan Data'}
        </button>
        <button type="button" onClick={() => void downloadReport()} disabled={!loaded || isDownloading || invalidRange} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Download size={15} /> {isDownloading ? 'Menyiapkan Excel...' : 'Download Excel'}
        </button>
      </section>
      {invalidRange && <p role="alert" className="text-xs font-semibold text-rose-700">Tanggal Start tidak boleh melewati End.</p>}

      {loaded && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
            <div className="text-xs font-semibold text-slate-600">
              {rows.length.toLocaleString('en-US')} baris jurnal · {startDate || 'semua tanggal awal'} s/d {endDate || 'semua tanggal akhir'}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label htmlFor="posted-journal-page-size">Baris per halaman</label>
              <select id="posted-journal-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-md border border-slate-200 bg-white px-2 font-semibold">
                {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1900px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>{[...headers, 'Aksi'].map((header) => <th key={header} className="whitespace-nowrap border-b border-slate-200 px-3 py-2">{header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row, index) => (
                  <tr key={row.journalLineId || `${row.journalNumber}-${(page - 1) * pageSize + index}`} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-slate-800">{row.journalNumber || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{displayDate(row.journalDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.arApNumber || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{displayDate(row.appliedDate)}</td>
                    <td className="px-3 py-2">{row.shipment || '-'}</td>
                    <td className="px-3 py-2">{row.customer || '-'}</td>
                    <td className="px-3 py-2">{row.jobVessel || '-'}</td>
                    <td className="px-3 py-2">{row.refNoFda || '-'}</td>
                    <td className="px-3 py-2">{row.bl || '-'}</td>
                    <td className="px-3 py-2">{row.currency || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{row.exchangeRate ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(row.exchangeRate) : '-'}</td>
                    <td className="px-3 py-2">{row.item || '-'}</td>
                    <td className="px-3 py-2">{row.vendor || '-'}</td>
                    <td className="min-w-64 px-3 py-2">{row.description || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{row.coa}</td>
                    <td className="min-w-48 px-3 py-2">{row.accountName}</td>
                    <td className="px-3 py-2 font-bold">{row.direction}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.amount)}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => startEditing(row)} disabled={!row.journalLineId} className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">
                        <Pencil size={12} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && <tr><td colSpan={headers.length + 1} className="px-3 py-10 text-center text-slate-500">Tidak ada jurnal posted pada rentang tanggal ini.</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <span>Menampilkan {rows.length ? ((page - 1) * pageSize + 1).toLocaleString('en-US') : 0}–{Math.min(page * pageSize, rows.length).toLocaleString('en-US')} dari {rows.length.toLocaleString('en-US')}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} title="Halaman sebelumnya" aria-label="Halaman sebelumnya" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="min-w-20 text-center font-semibold">Halaman {page} / {pageCount}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} title="Halaman berikutnya" aria-label="Halaman berikutnya" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </footer>
        </section>
      )}
      {editingJournalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-posted-journal-title" className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Edit jurnal posted</div>
                <h2 id="edit-posted-journal-title" className="mt-1 text-lg font-black text-slate-900">{editLines[0]?.journalNumber || '-'}</h2>
                <p className="mt-1 text-xs text-slate-500">Journal No dikunci. Perubahan disimpan ke database dan jurnal harus tetap seimbang.</p>
              </div>
              <button type="button" onClick={() => setEditingJournalId('')} disabled={isSaving} aria-label="Tutup edit jurnal" className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={18} /></button>
            </header>
            {error && <div role="alert" className="mx-4 mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}
            <div className="overflow-auto p-4">
              <div className="mb-4 max-w-xs">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Tanggal Jurnal</label>
                <DateInput value={editJournalDate} onChange={setEditJournalDate} inputClassName={inputClass} ariaLabel="Tanggal jurnal posted" />
              </div>
              <div className="space-y-4">
                {editLines.map((line, index) => (
                  <fieldset key={line.journalLineId} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
                    <legend className="px-1 text-xs font-bold text-slate-700">Baris jurnal {index + 1}</legend>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">No AR/AP<input value={line.arApNumber} onChange={(event) => updateEditLine(index, 'arApNumber', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Applied<input type="date" value={line.appliedDate} onChange={(event) => updateEditLine(index, 'appliedDate', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Shipment<input value={line.shipment} onChange={(event) => updateEditLine(index, 'shipment', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Customer<input value={line.customer} onChange={(event) => updateEditLine(index, 'customer', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Job Vessel<input value={line.jobVessel} onChange={(event) => updateEditLine(index, 'jobVessel', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Ref No FDA<input value={line.refNoFda} onChange={(event) => updateEditLine(index, 'refNoFda', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">BL<input value={line.bl} onChange={(event) => updateEditLine(index, 'bl', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Currency<input value={line.currency} onChange={(event) => updateEditLine(index, 'currency', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Kurs<input type="number" min="0" step="0.0001" value={line.exchangeRate} onChange={(event) => updateEditLine(index, 'exchangeRate', Number(event.target.value))} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Item<input value={line.item} onChange={(event) => updateEditLine(index, 'item', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Vendor<input value={line.vendor} onChange={(event) => updateEditLine(index, 'vendor', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Description<input value={line.description} onChange={(event) => updateEditLine(index, 'description', event.target.value)} className={inputClass} /></label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">COA · Nama COA
                      <select value={line.coaId} onChange={(event) => {
                        const selected = accounts.find((account) => account.id === event.target.value);
                        updateEditLine(index, 'coaId', event.target.value);
                        if (selected) updateEditLine(index, 'coa', selected.code);
                      }} className={inputClass}>
                        {!accounts.some((account) => account.id === line.coaId) && <option value={line.coaId}>{line.coa} · {line.accountName} (saat ini)</option>}
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.accountDesc}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">D/K
                      <select value={line.direction} onChange={(event) => updateEditLine(index, 'direction', event.target.value as 'D' | 'K')} className={inputClass}>
                        <option value="D">D · Debit</option><option value="K">K · Kredit</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Amount
                      <input type="number" min="0.01" step="0.01" value={line.amount} onChange={(event) => updateEditLine(index, 'amount', Number(event.target.value))} className={inputClass} />
                    </label>
                  </fieldset>
                ))}
              </div>
            </div>
            <footer className="flex flex-col justify-between gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center">
              <div className="text-xs font-semibold text-slate-600">
                Debit {formatAmount(editLines.reduce((sum, line) => sum + (line.direction === 'D' ? Number(line.amount) || 0 : 0), 0))}
                {' · '}Kredit {formatAmount(editLines.reduce((sum, line) => sum + (line.direction === 'K' ? Number(line.amount) || 0 : 0), 0))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingJournalId('')} disabled={isSaving} className="h-10 rounded-md border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                <button type="button" onClick={() => void saveEdits()} disabled={isSaving || accounts.length === 0} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Save size={14} /> {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

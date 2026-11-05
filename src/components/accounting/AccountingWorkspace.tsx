import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, RefreshCw, Search } from 'lucide-react';
import { AccountingInboxItem, Currency, FinanceJournalLine } from '../../types';
import { loadAccountingInbox, saveAccountingJournal } from '../../lib/api';
import { createFinanceJournalLine } from '../../utils/financeJournal';
import { getPaymentVoucherPphLabel } from '../../utils/paymentVoucherTax';
import { FinanceJournalEditor } from '../finance/FinanceJournalEditor';
import { DateInput } from '../shared/DateInput';

const formatAmount = (amount: number, currency: Currency) => new Intl.NumberFormat(
  'en-US',
  { style: 'currency', currency, currencyDisplay: currency === 'IDR' ? 'narrowSymbol' : 'symbol', maximumFractionDigits: currency === 'IDR' ? 0 : 2 },
).format(amount || 0);

const bankDetails = (bank?: string, accountName?: string, accountNumber?: string) =>
  [bank, accountName, accountNumber].filter((value) => value?.trim()).join(' | ') || '-';

const sourceLabel = (sourceType: AccountingInboxItem['sourceType']) =>
  sourceType === 'PAYABLE' ? 'Pengeluaran' : 'Penerimaan';

interface AccountingDetailRow {
  key: string;
  item: string;
  description: string;
  amount: number;
  vat: number;
  total: number;
  pph23: number;
  pphRate?: number;
  receivAmount: number;
  currency: Currency;
}

const getAccountingDetailRows = (source: AccountingInboxItem): AccountingDetailRow[] => {
  const details = source.sourceDetails;
  if (!details) return [];
  if (source.sourceType === 'PAYABLE') {
    return (details.items || []).map((item, index) => ({
      key: `${item.jobNumber}-${item.itemService}-${index}`,
      item: item.itemService || 'Item Payment Voucher',
      description: [item.jobNumber && `Job ${item.jobNumber}`, item.documentType, item.documentNumber, item.customerName].filter(Boolean).join(' · ') || '-',
      amount: item.amount,
      vat: item.vatAmount,
      total: item.total,
      pph23: item.pph23Amount,
      pphRate: item.pphRate,
      receivAmount: item.paidAmount,
      currency: item.currency,
    }));
  }

  const label = details.subjectData === 'PRINCIPAL' ? 'Penerimaan Principal' : 'Penerimaan Operasional';
  const sourceDescription = [
    details.jobId && `Job ${details.jobId}`,
    details.principalName,
    details.vesselName,
    details.invoiceType,
    details.invoiceNo,
  ].filter(Boolean).join(' · ') || '-';
  const rows: AccountingDetailRow[] = [];
  const idrAmount = Number(details.idrAmount) || 0;
  const usdAmount = Number(details.usdAmount) || 0;
  if (idrAmount > 0 || usdAmount === 0) {
    rows.push({
      key: `${source.sourceKey}:IDR`,
      item: label,
      description: sourceDescription,
      amount: idrAmount,
      vat: 0,
      total: idrAmount,
      pph23: Number(details.pph23AmountIDR) || 0,
      receivAmount: idrAmount,
      currency: 'IDR',
    });
  }
  if (usdAmount > 0) {
    rows.push({
      key: `${source.sourceKey}:USD`,
      item: label,
      description: sourceDescription,
      amount: usdAmount,
      vat: 0,
      total: usdAmount,
      pph23: 0,
      receivAmount: usdAmount,
      currency: 'USD',
    });
  }
  return rows;
};

const statusLabel = (status: AccountingInboxItem['accountingStatus']) => ({
  PENDING: 'Menunggu jurnal',
  DRAFT: 'Draft',
  POSTED: 'Posted',
}[status]);

export const AccountingWorkspace: React.FC = () => {
  const [items, setItems] = useState<AccountingInboxItem[]>([]);
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof loadAccountingInbox>>['accounts']>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [search, setSearch] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [description, setDescription] = useState('');
  const [journalLines, setJournalLines] = useState<FinanceJournalLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await loadAccountingInbox();
      setItems(result.items);
      setAccounts(result.accounts);
      setSelectedKey((current) => result.items.some((item) => item.sourceKey === current) ? current : '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Inbox Accounting gagal dimuat.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const branches = useMemo(() => [...new Set(items.map((item) => item.branchName).filter(Boolean))].sort(), [items]);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesBranch = branchFilter === 'ALL' || item.branchName === branchFilter;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'OPEN' ? item.accountingStatus !== 'POSTED' : item.accountingStatus === statusFilter);
      const searchable = `${item.referenceNo} ${item.requestNo} ${item.counterparty} ${item.description} ${item.branchName}`.toLocaleLowerCase();
      return matchesBranch && matchesStatus && (!query || searchable.includes(query));
    });
  }, [items, branchFilter, statusFilter, search]);
  const selected = items.find((item) => item.sourceKey === selectedKey) || null;

  useEffect(() => {
    if (!selected) return;
    setEntryDate(selected.journalDate || selected.date);
    setDescription(selected.journalDescription || selected.description || `${sourceLabel(selected.sourceType)} ${selected.referenceNo}`);
    setJournalLines(selected.journalLines.length
      ? selected.journalLines
      : [createFinanceJournalLine(), createFinanceJournalLine()]);
  }, [selected?.sourceKey]);

  const saveJournal = async (post: boolean) => {
    if (!selected || isSaving) return;
    if (!selected.branchId) {
      setError('Branch sumber belum ditetapkan. Hubungi Admin sebelum membuat jurnal.');
      return;
    }
    if (post && !window.confirm(`Posting jurnal ${selected.referenceNo} untuk branch ${selected.branchName}? Jurnal yang diposting tidak dapat diubah.`)) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await saveAccountingJournal({
        sourceType: selected.sourceType,
        sourceKey: selected.sourceKey,
        entryDate,
        description,
        lines: journalLines,
      }, post);
      setMessage(post
        ? `Jurnal ${result.journalNumber || ''} berhasil diposting.`
        : 'Draft jurnal berhasil disimpan.');
      const refreshed = await loadAccountingInbox();
      setItems(refreshed.items);
      setAccounts(refreshed.accounts);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Jurnal gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 md:flex-row md:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accounting Pusat</div>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900"><BookOpen size={20} /> Jurnal Finance</h1>
          <p className="mt-1 text-[10px] text-slate-500">Penerimaan dan pembayaran dari seluruh branch.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading} title="Muat ulang inbox" aria-label="Muat ulang inbox Accounting" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Muat ulang
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-semibold text-emerald-700">{message}</div>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-48 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Status jurnal
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-semibold normal-case text-slate-700">
              <option value="OPEN">Belum posted</option>
              <option value="PENDING">Menunggu jurnal</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="ALL">Semua status</option>
            </select>
          </label>
          <label className="grid min-w-48 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Branch
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-semibold normal-case text-slate-700">
              <option value="ALL">Semua branch</option>
              {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </label>
          <label className="relative grid min-w-60 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Cari transaksi
            <Search size={15} className="absolute bottom-3 left-3 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Referensi, vendor, branch..." className="h-10 rounded-md border border-slate-200 pl-9 pr-3 text-[10px] font-medium normal-case text-slate-700" />
          </label>
          <div className="pb-2 text-[10px] font-semibold text-slate-500">{filteredItems.length} transaksi</div>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1020px] text-left text-[10px]">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Jenis</th><th className="px-3 py-2">No Invoice</th><th className="px-3 py-2">Referensi</th><th className="px-3 py-2">Pihak</th><th className="px-3 py-2 text-right">Nilai</th><th className="px-3 py-2 text-right">Equivalent IDR</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-center">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">{isLoading ? 'Memuat transaksi...' : 'Tidak ada transaksi untuk filter ini.'}</td></tr> : filteredItems.map((item) => (
                <tr key={item.sourceKey} className={selectedKey === item.sourceKey ? 'bg-emerald-50' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-2 whitespace-nowrap">{item.date}</td>
                  <td className="px-3 py-2">{item.branchName || 'Branch belum dipetakan'}</td>
                  <td className={`px-3 py-2 font-semibold ${item.sourceType === 'PAYABLE' ? 'text-rose-700' : 'text-emerald-700'}`}>{sourceLabel(item.sourceType)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-slate-800">{item.arApNumber || '-'}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => { setSelectedKey(item.sourceKey); setError(''); setMessage(''); }} className="font-mono font-bold text-emerald-800 hover:underline">{item.referenceNo}</button>
                    {item.journalNumber && <div className="mt-0.5 font-mono text-[10px] text-slate-500">{item.journalNumber}</div>}
                  </td>
                  <td className="max-w-52 truncate px-3 py-2">{item.counterparty || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(item.amount, item.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(item.amountIdr, 'IDR')}</td>
                  <td className="px-3 py-2"><span className={item.accountingStatus === 'POSTED' ? 'font-semibold text-emerald-700' : item.accountingStatus === 'DRAFT' ? 'font-semibold text-amber-700' : 'font-semibold text-slate-500'}>{statusLabel(item.accountingStatus)}</span></td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedKey === item.sourceKey}
                      onChange={(event) => {
                        setSelectedKey(event.target.checked ? item.sourceKey : '');
                        setError('');
                        setMessage('');
                      }}
                      aria-label={`Pilih transaksi ${item.referenceNo} untuk entry jurnal`}
                      title="Pilih transaksi untuk dikerjakan di editor jurnal"
                      className="h-4 w-4 cursor-pointer accent-emerald-700"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-start">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{sourceLabel(selected.sourceType)} · {selected.branchName || 'Branch belum dipetakan'}</div>
              <h2 className="mt-1 text-base font-black text-slate-900">{selected.arApNumber || '-'}</h2>
              <p className="mt-1 text-[10px] text-slate-500">Referensi: {selected.referenceNo || '-'} · {selected.counterparty || 'Operasional'} · {selected.bankName} · {selected.accountNumber}</p>
            </div>
            <div className="text-left md:text-right">
              <div className="font-mono text-[10px] font-bold text-slate-900">{formatAmount(selected.amount, selected.currency)}</div>
              {selected.currency === 'USD' && <div className="mt-1 text-[10px] text-slate-500">Ekuivalen {formatAmount(selected.amountIdr, 'IDR')} · kurs {selected.exchangeRate.toLocaleString('en-US')}</div>}
              <div className="mt-1 text-[10px] text-slate-500">Sumber {selected.sourceType === 'PAYABLE' ? 'Payment Voucher' : 'Accounts Receivable'} · {selected.date}</div>
            </div>
          </div>

          {selected.sourceDetails && (
            <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-[10px]">
            <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-700">Rincian sumber transaksi</h3>
              {selected.sourceType === 'PAYABLE' ? (
                <>
                  <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                    <table className="w-full min-w-[880px] text-left text-[10px]">
                      <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
                        <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Job / Dokumen / Customer</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">VAT</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Potongan PPh</th><th className="px-3 py-2 text-right">Receiv Amount</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(selected.sourceDetails.items || []).length === 0 ? (
                          <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">Item sumber tidak tersedia.</td></tr>
                        ) : selected.sourceDetails.items?.map((item, index) => (
                          <tr key={`${item.jobNumber}-${item.itemService}-${index}`}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{item.itemService || '-'}</td>
                            <td className="px-3 py-2 text-slate-600">{[item.jobNumber && `Job ${item.jobNumber}`, item.documentType, item.documentNumber, item.customerName].filter(Boolean).join(' · ') || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(item.amount, item.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(item.vatAmount, item.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(item.total, item.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{item.pphRate ? <span className="mr-1 text-[10px] text-rose-600">{getPaymentVoucherPphLabel(item.pphRate)}</span> : null}{formatAmount(item.pph23Amount, item.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(item.paidAmount, item.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                    <table className="w-full min-w-[880px] text-left text-[10px]">
                      <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
                        <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Job / Dokumen / Customer</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">VAT</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Potongan PPh</th><th className="px-3 py-2 text-right">Receiv Amount</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {getAccountingDetailRows(selected).map((row) => (
                          <tr key={row.key}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{row.item}</td>
                            <td className="px-3 py-2 text-slate-600">{row.description}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.amount, row.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{row.vat > 0 ? formatAmount(row.vat, row.currency) : '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.total, row.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{row.pph23 > 0 ? <>{row.pphRate ? <span className="mr-1 text-[10px] text-rose-600">{getPaymentVoucherPphLabel(row.pphRate)}</span> : null}{formatAmount(row.pph23, row.currency)}</> : '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.receivAmount, row.currency)}</td>
                          </tr>
                        ))}
                        {getAccountingDetailRows(selected).length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">Rincian penerimaan tidak tersedia.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <h4 className="mb-3 text-[10px] font-black uppercase tracking-wide text-slate-700">Sumber Transaksi</h4>
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {selected.sourceType === 'PAYABLE' ? (
                    <>
                      <div><span className="text-slate-500">Bank Remitten Finance: </span><span className="font-semibold">{bankDetails(selected.sourceDetails.remittanceBankName, selected.sourceDetails.remittanceAccountName, selected.sourceDetails.remittanceAccountNumber)}</span></div>
                      <div><span className="text-slate-500">Bank Tujuan: </span><span className="font-semibold">{bankDetails(selected.bankName, selected.sourceDetails.destinationAccountName || selected.counterparty, selected.accountNumber)}</span></div>
                    </>
                  ) : (
                    <>
                      <div><span className="text-slate-500">Bank Beneficiary Finance: </span><span className="font-semibold">{bankDetails(selected.sourceDetails.beneficiaryBankName || selected.bankName, selected.sourceDetails.beneficiaryAccountName, selected.sourceDetails.beneficiaryAccountNumber || selected.accountNumber)}</span></div>
                      <div><span className="text-slate-500">Bank Tujuan: </span><span className="font-semibold">-</span></div>
                    </>
                  )}
                  <div><span className="text-slate-500">Surcharge: </span><span className="font-mono font-semibold">{formatAmount(selected.sourceDetails.surcharge || 0, selected.currency)}</span></div>
                  <div><span className="text-slate-500">Biaya Lain: </span><span className="font-mono font-semibold">{formatAmount(selected.sourceDetails.otherExpenses || 0, selected.currency)}</span></div>
                  <div><span className="text-slate-500">Currency: </span><span className="font-semibold">{selected.sourceDetails.currency || selected.currency}</span></div>
                  <div><span className="text-slate-500">Kurs: </span><span className="font-mono font-semibold">
                    {(selected.sourceDetails.exchangeRateUSDToIDR || selected.exchangeRate) > 1
                      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(selected.sourceDetails.exchangeRateUSDToIDR || selected.exchangeRate)
                      : '-'}
                  </span></div>
                  <div><span className="text-slate-500">Ekuivalen IDR: </span><span className="font-mono font-semibold">{formatAmount(selected.amountIdr, 'IDR')}</span></div>
                  <div><span className="text-slate-500">Total dibayar: </span><span className="font-mono font-semibold">{formatAmount(selected.sourceType === 'PAYABLE' ? selected.sourceDetails.paymentTotal || selected.amount : selected.amount, selected.currency)}</span></div>
                  <div className="sm:col-span-2"><span className="text-slate-500">Keterangan pembayaran: </span><span>{selected.sourceDetails.paymentDescription || selected.sourceDetails.remark || selected.description || '-'}</span></div>
                  {selected.sourceType === 'RECEIVABLE' && (
                    <div className="sm:col-span-2"><span className="text-slate-500">Tujuan: </span><span className="font-semibold">{selected.sourceDetails.paymentType === 'ADVANCE_PAYMENT' ? 'Advance Payment' : selected.sourceDetails.paymentType === 'INVOICE' ? 'Invoice' : '-'}</span></div>
                  )}
                </div>
              </div>
            </section>
          )}

          {selected.accountingStatus === 'POSTED' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-600">
                <span className="font-bold text-emerald-700">Posted · {selected.journalNumber}</span>
                <span>{selected.postedBy} · {selected.postedAt}</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[620px] text-left text-[10px]">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Akun COA</th><th className="p-2">Keterangan</th><th className="p-2">D/K</th><th className="p-2 text-right">Jumlah IDR</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{selected.journalLines.map((line) => {
                    const account = accounts.find((item) => item.id === line.coaId);
                    return <tr key={line.id}><td className="p-2">{account ? `${account.code} · ${account.accountDesc}` : line.coaId}</td><td className="p-2">{line.memo}</td><td className="p-2">{line.direction === 'DEBIT' ? 'Debit' : 'Kredit'}</td><td className="p-2 text-right font-mono">{formatAmount(line.amount, 'IDR')}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Tanggal jurnal
                  <DateInput value={entryDate} onChange={(value) => setEntryDate(value || selected.date)} inputClassName="h-10 rounded-md border border-slate-200 px-3 text-[10px] font-semibold normal-case text-slate-700" ariaLabel="Tanggal jurnal accounting" />
                </label>
                <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Keterangan jurnal
                  <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} className="h-10 rounded-md border border-slate-200 px-3 text-[10px] font-medium normal-case text-slate-700" />
                </label>
              </div>
              {!selected.branchId && <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800">Branch transaksi belum dipetakan; jurnal belum dapat dibuat.</div>}
              <FinanceJournalEditor
                accounts={accounts}
                lines={journalLines}
                onChange={setJournalLines}
                onSaveDraft={() => { void saveJournal(false); }}
                onPost={() => { void saveJournal(true); }}
                postingLabel="Posting Jurnal"
                isSaving={isSaving}
                canPost={Boolean(selected.branchId)}
              />
              {selected.accountingStatus === 'DRAFT' && <div className="text-[10px] text-slate-500">Draft oleh {selected.createdBy} · diperbarui {selected.updatedAt} oleh {selected.updatedBy}</div>}
            </>
          )}
        </section>
      )}
    </div>
  );
};

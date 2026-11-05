import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from 'lucide-react';
import ExcelJS from 'exceljs';
import { AccountsReceivableEntry, BankAccount, Branch, Currency, JobCall, PaymentVoucher, PrincipalReceipt } from '../../types';
import { loadAccountingFinanceReceivableHistory } from '../../lib/api';
import { getPaymentVoucherPaymentEvents } from '../../utils/paymentVoucherHistory';
import { getPaymentVoucherPphRate } from '../../utils/paymentVoucherTax';

interface AccountingFinanceHistoryProps {
  branches: Branch[];
  jobCalls: JobCall[];
  paymentVouchers: PaymentVoucher[];
  bankAccounts: BankAccount[];
}

interface FinanceHistoryRow {
  id: string;
  date: string;
  transactionType: 'Pemasukan' | 'Pengeluaran';
  voucherNo: string;
  requestNo: string;
  branchName: string;
  party: string;
  jobNumber: string;
  fdaNo: string;
  itemService: string;
  description: string;
  bank: string;
  accountNumber: string;
  remittanceBank: string;
  remittanceAccountNumber: string;
  currency: Currency;
  amount: number;
  vat: number;
  pph23: number;
  pph23Rate: number | null;
  total: number;
  exchangeRate: number;
  totalInIDR: number | null;
  paidBy: string;
}

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2000, index, 1)));
const headers = [
  'Tanggal', 'Branch', 'No Voucher', 'Jenis', 'No Request', 'Pihak', 'Job Number', 'No FDA',
  'Item Service', 'Deskripsi', 'Bank Tujuan', 'Rekening Tujuan', 'Bank Remitten', 'Rekening Remitten',
  'Currency', 'Amount', 'VAT', 'PPh 23', 'Ket PPH23', 'Total Dibayar', 'Kurs USD/IDR', 'Total IDR Ekuivalen', 'Dibayar Oleh',
];
const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700';
const pageSizes = [50, 100, 250] as const;
const dateInRange = (value: string, startDate: string, endDate: string) => value >= startDate && value <= endDate;
const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || '-';
};
const formatAmount = (value: number) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value || 0);
const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('id-ID')
  .replace(/\s+/g, ' ')
  .trim();
const normalizedId = (value?: string | number) => String(value || '').replace(/^0+/, '') || '0';
const excelDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : '';
};

const toExcelRow = (row: FinanceHistoryRow) => [
  excelDate(row.date), row.branchName, row.voucherNo, row.transactionType, row.requestNo,
  row.party, row.jobNumber, row.fdaNo, row.itemService, row.description, row.bank,
  row.accountNumber, row.remittanceBank, row.remittanceAccountNumber, row.currency, row.amount,
  row.vat, row.pph23, row.pph23Rate ?? '', row.total, row.exchangeRate || '', row.totalInIDR, row.paidBy,
];

export const AccountingFinanceHistory: React.FC<AccountingFinanceHistoryProps> = ({
  branches, jobCalls, paymentVouchers, bankAccounts,
}) => {
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(today.getFullYear());
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receivableEntries, setReceivableEntries] = useState<AccountsReceivableEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [searchQuery, setSearchQuery] = useState('');

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(new Date(year, Number(month), 0).getDate()).padStart(2, '0')}`;
  const selectedBranch = branches.find((branch) => normalizedId(branch.id) === normalizedId(branchId));
  const matchesBranch = (sourceId?: string, sourceName?: string) => {
    if (!branchId) return true;
    if (sourceId) return normalizedId(sourceId) === normalizedId(branchId);
    const branchName = (sourceName || '').trim().toLowerCase();
    return Boolean(branchName && [selectedBranch?.code, selectedBranch?.name].some((value) => value?.trim().toLowerCase() === branchName));
  };
  const branchNameFor = (branch?: Branch, fallback = '') => branch ? `${branch.code} · ${branch.name}` : fallback || '-';

  const rows = useMemo(() => {
    const jobs = jobCalls.filter((job) => matchesBranch(
      job.inquiry?.createdByBranchId,
      job.inquiry?.createdByBranch,
    ));
    const jobsById = new Map<string, JobCall>(jobs.map((job): [string, JobCall] => [job.jobId, job]));
    const result: FinanceHistoryRow[] = [];
    const receiptFingerprint = (
      jobId: string,
      date: string,
      paymentType: PrincipalReceipt['paymentType'],
      currency: Currency,
      amount: number,
    ) => [jobId, date, paymentType, currency, amount.toFixed(2)].join('|');
    const jobReceiptByFingerprint = new Map<string, FinanceHistoryRow>();
    for (const job of jobs) {
      for (const receipt of (job.principalReceipts || []).filter((item) => !item.id.startsWith('FIN-AR-'))) {
        const currency = receipt.currency || job.currency || 'IDR';
        const amount = Number(receipt.amount) || 0;
        const exchangeRate = Number(receipt.exchangeRateUSDToIDR || job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 0);
        const row: FinanceHistoryRow = {
          id: `JOB-RECEIPT-${receipt.id}`,
          date: String(receipt.receivedDate || '').slice(0, 10),
          transactionType: 'Pemasukan',
          voucherNo: '-',
          requestNo: '-',
          branchName: branchNameFor(branches.find((branch) => normalizedId(branch.id) === normalizedId(job.inquiry?.createdByBranchId)), job.inquiry?.createdByBranch),
          party: job.customerName || '-',
          jobNumber: job.jobId,
          fdaNo: job.fda?.fdaNo || '-',
          itemService: receipt.paymentType === 'ADVANCE_PAYMENT' ? 'FDA Advance' : 'Invoice Receipt',
          description: receipt.bankRemark || '',
          bank: '-',
          accountNumber: '-',
          remittanceBank: '-',
          remittanceAccountNumber: '-',
          currency,
          amount,
          vat: 0,
          pph23: 0,
          pph23Rate: null,
          total: amount,
          exchangeRate,
          totalInIDR: currency === 'IDR' ? amount : exchangeRate > 0 ? amount * exchangeRate : null,
          paidBy: 'Job Receipt',
        };
        if (/^\d{4}-\d{2}-\d{2}$/.test(row.date) && dateInRange(row.date, startDate, endDate)) {
          result.push(row);
          jobReceiptByFingerprint.set(receiptFingerprint(job.jobId, row.date, receipt.paymentType, currency, amount), row);
        }
        if (receipt.refundStatus === 'PAID') {
          const refundAmount = Number(receipt.refundAmount) || 0;
          const refundRate = Number(receipt.refundExchangeRateUSDToIDR || receipt.exchangeRateUSDToIDR || job.fda?.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 0);
          const refundDate = String(receipt.refundDate || '').slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(refundDate) && dateInRange(refundDate, startDate, endDate)) {
            result.push({
              ...row,
              id: `REFUND-${receipt.id}`,
              date: refundDate,
              transactionType: 'Pengeluaran',
              voucherNo: receipt.refundBankReference || `REFUND-${receipt.id}`,
              itemService: 'Principal refund',
              description: `Refund lebih bayar ${currency} ${formatAmount(refundAmount)}`,
              amount: refundAmount,
              pph23Rate: null,
              total: refundAmount,
              exchangeRate: refundRate,
              totalInIDR: currency === 'IDR' ? refundAmount : refundRate > 0 ? refundAmount * refundRate : null,
              paidBy: 'Finance',
            });
          }
        }
      }
    }

    for (const entry of receivableEntries) {
      if (!dateInRange(String(entry.incomeDate).slice(0, 10), startDate, endDate)) continue;
      if (!matchesBranch(entry.branchId, entry.branchName)) continue;
      const idrAmount = Number(entry.idrAmount) || 0;
      const usdAmount = Number(entry.usdAmount) || 0;
      const currencies: Array<{ currency: Currency; amount: number }> = [
        ...(idrAmount > 0 ? [{ currency: 'IDR' as const, amount: idrAmount }] : []),
        ...(usdAmount > 0 ? [{ currency: 'USD' as const, amount: usdAmount }] : []),
      ];
      const job = entry.jobId ? jobsById.get(entry.jobId) : undefined;
      const exchangeRate = Number(entry.exchangeRateUSDToIDR) || 0;
      let pphMerged = false;
      currencies.forEach(({ currency, amount }) => {
        const fingerprint = entry.jobId && entry.paymentType
          ? receiptFingerprint(entry.jobId, String(entry.incomeDate).slice(0, 10), entry.paymentType, currency, amount)
          : '';
        const duplicate = fingerprint ? jobReceiptByFingerprint.get(fingerprint) : undefined;
        if (duplicate) {
          if (!pphMerged) {
            duplicate.pph23 += Number(entry.pph23AmountIDR) || 0;
            pphMerged = true;
          }
          if (duplicate.bank === '-') duplicate.bank = entry.bankName || '-';
          duplicate.accountNumber = entry.accountNumber || '-';
          duplicate.voucherNo = entry.receiptNumber || '-';
          duplicate.totalInIDR = idrAmount + usdAmount * exchangeRate;
          return;
        }
        const pph23 = pphMerged ? 0 : Number(entry.pph23AmountIDR) || 0;
        pphMerged = true;
        result.push({
          id: `AR-${entry.id}-${currency}`,
          date: String(entry.incomeDate).slice(0, 10),
          transactionType: 'Pemasukan',
          voucherNo: entry.receiptNumber || '-',
          requestNo: '-',
          branchName: branchNameFor(
            branches.find((branch) => normalizedId(branch.id) === normalizedId(entry.branchId)),
            entry.branchName,
          ),
          party: entry.subjectData === 'PRINCIPAL' ? entry.principalName || '-' : 'Operasional',
          jobNumber: entry.jobId || '-',
          fdaNo: job?.fda?.fdaNo || entry.invoiceNo || '-',
          itemService: entry.invoiceType || entry.subjectData || '-',
          description: entry.remark || '',
          bank: entry.bankName || '-',
          accountNumber: entry.accountNumber || '-',
          remittanceBank: '-',
          remittanceAccountNumber: '-',
          currency,
          amount,
          vat: 0,
          pph23,
          pph23Rate: null,
          total: amount,
          exchangeRate,
          totalInIDR: currency === 'IDR' ? amount : amount * exchangeRate,
          paidBy: entry.createdBy || '',
        });
      });
    }

    const filteredVouchers = paymentVouchers.filter((voucher) => matchesBranch(voucher.branchId, voucher.branchName));
    const bankAccountsById = new Map<string, BankAccount>(bankAccounts.map((account): [string, BankAccount] => [account.id, account]));
    for (const voucher of filteredVouchers.flatMap(getPaymentVoucherPaymentEvents)) {
      const date = String(voucher.paidAt || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dateInRange(date, startDate, endDate)) continue;
      const currency = voucher.currency || 'IDR';
      const exchangeRate = Number(voucher.exchangeRateUSDToIDR) || 0;
      const remittanceAccount = voucher.paidFromBankAccountId ? bankAccountsById.get(voucher.paidFromBankAccountId) : undefined;
      const items = voucher.items || [];
      const voucherBranch = branches.find((branch) => normalizedId(branch.id) === normalizedId(voucher.branchId));
      const addExpenseRow = (
        id: string,
        itemService: string,
        amount: number,
        vat: number,
        pph23: number,
        pph23Rate: number | null,
        total: number,
      ) => result.push({
        id,
        date,
        transactionType: 'Pengeluaran',
        voucherNo: voucher.voucherNumber || '-',
        requestNo: voucher.requestNumber || '-',
        branchName: branchNameFor(voucherBranch, voucher.branchName),
        party: voucher.vendorName || '-',
        jobNumber: [...new Set(items.map((item) => item.jobNumber).filter(Boolean))].join(', ') || '-',
        fdaNo: [...new Set(items.map((item) => jobsById.get(item.jobNumber)?.fda?.fdaNo).filter(Boolean))].join(', ') || '-',
        itemService,
        description: voucher.paymentDescription || '',
        bank: voucher.bankName || '-',
        accountNumber: voucher.accountNumber || '-',
        remittanceBank: remittanceAccount?.bankName || '-',
        remittanceAccountNumber: remittanceAccount?.accountNumber || '-',
        currency,
        amount,
        vat,
        pph23,
        pph23Rate,
        total,
        exchangeRate,
        totalInIDR: currency === 'IDR' ? total : exchangeRate > 0 ? total * exchangeRate : null,
        paidBy: voucher.paidBy || '',
      });
      if (items.length) {
        for (const item of items) {
          const amount = Number(item.amount) || 0;
          const pphRate = getPaymentVoucherPphRate(item);
          const savedPphAmount = Number(item.pph23Amount) || 0;
          const pph23Amount = savedPphAmount || Math.round((amount * pphRate + Number.EPSILON) * 100) / 100;
          addExpenseRow(
            `${voucher.paymentEventKey}-${item.id}`,
            item.itemService || '-',
            amount,
            Number(item.vatAmount) || 0,
            pph23Amount,
            pphRate || null,
            Number(item.paidAmount) || Math.max(0, Number(item.total) - pph23Amount),
          );
        }
      }
      if (Number(voucher.paymentSurcharge) > 0) addExpenseRow(
        `${voucher.paymentEventKey}-surcharge`, 'Surcharge', Number(voucher.paymentSurcharge), 0, 0, null, Number(voucher.paymentSurcharge),
      );
      if (Number(voucher.paymentOtherExpenses) > 0) addExpenseRow(
        `${voucher.paymentEventKey}-other`, 'Biaya Lain', Number(voucher.paymentOtherExpenses), 0, 0, null, Number(voucher.paymentOtherExpenses),
      );
    }
    return result.sort((left, right) => left.date.localeCompare(right.date) || left.voucherNo.localeCompare(right.voucherNo));
  }, [bankAccounts, branches, branchId, endDate, jobCalls, month, paymentVouchers, receivableEntries, startDate]);

  const filteredRows = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return rows;
    const tokens = query.split(' ').filter(Boolean);
    return rows.filter((row) => {
      const values = [
        formatDate(row.date),
        row.branchName,
        row.voucherNo,
        row.transactionType,
        row.requestNo,
        row.party,
        row.jobNumber,
        row.fdaNo,
        row.itemService,
        row.description,
        row.bank,
        row.accountNumber,
        row.remittanceBank,
        row.remittanceAccountNumber,
        row.currency,
        row.amount,
        row.vat,
        row.pph23,
        row.pph23Rate,
        row.total,
        row.exchangeRate,
        row.totalInIDR,
        row.paidBy,
      ].filter((value) => value !== null && value !== undefined)
        .flatMap((value) => {
          const text = String(value);
          return [
            text,
            ...(typeof value === 'number' ? [formatAmount(value)] : []),
            text.replace(/[^\p{L}\p{N}]/gu, ''),
          ];
        })
        .map(normalizeSearchText);
      return tokens.every((token) => {
        const compactToken = token.replace(/[^\p{L}\p{N}]/gu, '');
        return values.some((value) => value.includes(token)
          || (compactToken.length > 0 && value.replace(/[^\p{L}\p{N}]/gu, '').includes(compactToken)));
      });
    });
  }, [rows, searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const yearOptions = Array.from({ length: Math.max(0, today.getFullYear() - 1999) }, (_, index) => today.getFullYear() - index);

  const loadHistory = async () => {
    if (loading || isDownloading) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const entries = await loadAccountingFinanceReceivableHistory(branchId);
      setReceivableEntries(entries);
      setLoaded(true);
      setPage(1);
      setMessage(`Data Rekap Keuangan ${monthNames[Number(month) - 1]} ${year} berhasil dimuat.`);
    } catch (loadError) {
      setReceivableEntries([]);
      setLoaded(false);
      setError(loadError instanceof Error ? loadError.message : 'Rekap keuangan gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    if (!loaded || loading || isDownloading) return;
    setIsDownloading(true);
    setError('');
    setMessage('');
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'MaritimPort';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('Rekap Keuangan');
      sheet.addRow(headers);
      rows.forEach((row) => sheet.addRow(toExcelRow(row)));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'W1' };
      sheet.columns = [
        { width: 15 }, { width: 28 }, { width: 24 }, { width: 16 }, { width: 24 }, { width: 30 },
        { width: 22 }, { width: 22 }, { width: 30 }, { width: 40 }, { width: 22 }, { width: 24 },
        { width: 22 }, { width: 24 }, { width: 12 }, { width: 18 }, { width: 16 }, { width: 16 },
        { width: 16 }, { width: 18 }, { width: 16 }, { width: 22 }, { width: 24 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245F4C' } };
      sheet.getColumn(1).numFmt = 'dd-mm-yyyy';
      [16, 17, 18, 20, 21, 22].forEach((column) => { sheet.getColumn(column).numFmt = '#,##0.00;[Red]-#,##0.00'; });
      sheet.getColumn(19).numFmt = '0.##%';
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rekap-keuangan-${year}-${month}-${selectedBranch?.code || 'semua-branch'}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Excel rekap keuangan berhasil dibuat: ${rows.length.toLocaleString('en-US')} transaksi.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Rekap keuangan gagal diunduh.');
    } finally {
      setIsDownloading(false);
    }
  };

  const updateFilters = (update: () => void) => {
    update();
    setReceivableEntries([]);
    setLoaded(false);
    setPage(1);
    setError('');
    setMessage('');
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accounting Pusat</div>
          <h1 className="mt-1 text-xl font-black text-slate-900">History Keuangan</h1>
          <p className="mt-1 text-xs text-slate-500">Sumber data: Rekap Keuangan Finance, pemasukan dan pengeluaran tiap branch.</p>
        </div>
        <button type="button" onClick={() => void loadHistory()} disabled={loading || isDownloading} title="Muat ulang history keuangan" aria-label="Muat ulang history keuangan" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang
        </button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}

      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="grid min-w-40 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Bulan
          <select value={month} onChange={(event) => updateFilters(() => setMonth(event.target.value))} disabled={loading || isDownloading} className={inputClass} aria-label="Bulan History Keuangan">
            {monthNames.map((name, index) => <option key={index + 1} value={String(index + 1).padStart(2, '0')}>{name}</option>)}
          </select>
        </label>
        <label className="grid min-w-32 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tahun
          <select value={year} onChange={(event) => updateFilters(() => setYear(Number(event.target.value)))} disabled={loading || isDownloading} className={inputClass} aria-label="Tahun History Keuangan">
            {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid min-w-48 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Branch
          <select value={branchId} onChange={(event) => updateFilters(() => setBranchId(event.target.value))} disabled={loading || isDownloading} className={inputClass} aria-label="Branch History Keuangan">
            <option value="">Semua Branch</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void loadHistory()} disabled={loading || isDownloading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Search size={15} /> {loading ? 'Memuat...' : 'Tampilkan'}
        </button>
        <button type="button" onClick={() => void download()} disabled={!loaded || loading || isDownloading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Download size={15} /> {isDownloading ? 'Menyiapkan Excel...' : 'Download Excel'}
        </button>
      </section>

      {loaded && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold text-slate-600">
                {filteredRows.length.toLocaleString('en-US')} transaksi
                {searchQuery.trim() && ` ditemukan dari ${rows.length.toLocaleString('en-US')}`}
                {' · '}{monthNames[Number(month) - 1]} {year}
                {selectedBranch ? ` · ${selectedBranch.code} · ${selectedBranch.name}` : ' · Semua Branch'}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative block sm:w-72">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
                    placeholder="Cari voucher, branch, pihak, job..."
                    aria-label="Cari transaksi History Keuangan"
                    className={`${inputClass} pl-9`}
                  />
                </label>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <label htmlFor="finance-history-page-size">Baris per halaman</label>
                  <select id="finance-history-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-md border border-slate-200 bg-white px-2 font-semibold">
                    {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1900px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap border-b border-slate-200 px-3 py-2">{header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
                    <td className="px-3 py-2">{row.branchName}</td>
                    <td className="px-3 py-2 font-mono">{row.voucherNo}</td>
                    <td className="px-3 py-2 font-bold">
                      <span className={row.transactionType === 'Pemasukan' ? 'text-emerald-700' : 'text-rose-700'}>
                        {row.transactionType}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{row.requestNo}</td>
                    <td className="px-3 py-2">{row.party}</td>
                    <td className="px-3 py-2">{row.jobNumber}</td>
                    <td className="px-3 py-2">{row.fdaNo}</td>
                    <td className="px-3 py-2">{row.itemService}</td>
                    <td className="min-w-64 px-3 py-2">{row.description || '-'}</td>
                    <td className="px-3 py-2">{row.bank}</td>
                    <td className="px-3 py-2">{row.accountNumber}</td>
                    <td className="px-3 py-2">{row.remittanceBank}</td>
                    <td className="px-3 py-2">{row.remittanceAccountNumber}</td>
                    <td className="px-3 py-2">{row.currency}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.vat)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.pph23)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{row.pph23Rate === null ? '-' : new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 2 }).format(row.pph23Rate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatAmount(row.total)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{row.exchangeRate ? formatAmount(row.exchangeRate) : '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{row.totalInIDR === null ? '-' : formatAmount(row.totalInIDR)}</td>
                    <td className="px-3 py-2">{row.paidBy || '-'}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-10 text-center text-slate-500">Tidak ada transaksi Rekap Keuangan pada bulan dan branch ini.</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <span>Menampilkan {filteredRows.length ? ((page - 1) * pageSize + 1).toLocaleString('en-US') : 0}–{Math.min(page * pageSize, filteredRows.length).toLocaleString('en-US')} dari {filteredRows.length.toLocaleString('en-US')}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} title="Halaman sebelumnya" aria-label="Halaman sebelumnya" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="min-w-20 text-center font-semibold">Halaman {page} / {pageCount}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} title="Halaman berikutnya" aria-label="Halaman berikutnya" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
};

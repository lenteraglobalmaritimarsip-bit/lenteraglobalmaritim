import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Calculator, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { AccountsReceivableEntry, Currency, JobCall, PaymentVoucher, PrincipalReceipt } from '../../types';
import { loadAccountsReceivableHistory } from '../../lib/api';
import { formatDateDisplay, toLocalISODate } from '../../utils/date';
import { DateInput } from '../shared/DateInput';
import { getPaymentVoucherPaymentEvents } from '../../utils/paymentVoucherHistory';

interface FinanceRecapViewProps {
  paymentVouchers: PaymentVoucher[];
  jobCalls: JobCall[];
}

interface IncomeRow {
  id: string;
  jobId: string;
  date: string;
  paymentType: PrincipalReceipt['paymentType'] | null;
  subject: string;
  principal: string;
  vesselOrJob: string;
  invoiceType: string;
  invoiceNo: string;
  bank: string;
  remark: string;
  pph23: number;
  idr: number;
  usd: number;
  exchangeRate: number;
  usdInIDR: number;
  idrEquivalent: number;
  createdBy: string;
}

interface ExpenseRow {
  id: string;
  date: string;
  voucherNo: string;
  requestNo: string;
  vendor: string;
  jobInfo: string;
  jobNumbers: string;
  bank: string;
  accountNumber: string;
  paid: number;
  surcharge: number;
  other: number;
  total: number;
  currency: Currency;
  exchangeRate: number;
  exchangeRateDate: string;
  totalInIDR: number | null;
  description: string;
  paidBy: string;
}

interface MonthRow {
  month: string;
  inIDR: number;
  inUSD: number;
  usdInIDR: number;
  outUSD: number;
  usdOutIDR: number;
  outIDR: number;
}

const PAGE_SIZE = 15;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const money = (value: number, currency: Currency = 'IDR') => currency === 'USD'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)
  : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const monthLabel = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
};

const toExcelDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const rangeForMonth = (offset: number) => {
  const now = new Date();
  return {
    from: toLocalISODate(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
    to: toLocalISODate(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
  };
};

const PRESETS: Array<{ label: string; range: () => { from: string; to: string } }> = [
  { label: 'Bulan ini', range: () => rangeForMonth(0) },
  { label: 'Bulan lalu', range: () => rangeForMonth(-1) },
  {
    label: 'Tahun ini',
    range: () => {
      const year = new Date().getFullYear();
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    },
  },
  { label: 'Semua', range: () => ({ from: '', to: '' }) },
];

const toIncomeRow = (entry: AccountsReceivableEntry): IncomeRow => {
  const principalEntry = entry.subjectData === 'PRINCIPAL';
  const idr = Number(entry.idrAmount) || 0;
  const usd = Number(entry.usdAmount) || 0;
  const exchangeRate = Number(entry.exchangeRateUSDToIDR) || 0;
  return {
    id: entry.id,
    jobId: entry.jobId || '',
    date: String(entry.incomeDate).slice(0, 10),
    paymentType: principalEntry ? entry.paymentType : null,
    subject: principalEntry ? 'Principal' : 'Operasional',
    principal: principalEntry ? entry.principalName || '-' : '-',
    vesselOrJob: principalEntry ? entry.vesselName || entry.jobId || '-' : '-',
    invoiceType: principalEntry ? entry.invoiceType || '-' : '-',
    invoiceNo: principalEntry ? entry.invoiceNo || '-' : '-',
    bank: entry.bankName || '-',
    remark: entry.remark || '',
    pph23: Number(entry.pph23AmountIDR) || 0,
    idr,
    usd,
    exchangeRate,
    usdInIDR: usd * exchangeRate,
    idrEquivalent: idr + usd * exchangeRate,
    createdBy: entry.createdBy || '',
  };
};

const toPrincipalReceiptRow = (job: JobCall, receipt: PrincipalReceipt): IncomeRow => {
  const currency = receipt.currency || job.currency || 'IDR';
  const amount = Number(receipt.amount) || 0;
  const idr = currency === 'IDR' ? amount : 0;
  const usd = currency === 'USD' ? amount : 0;
  const exchangeRate = Number(
    receipt.exchangeRateUSDToIDR
    || job.fda?.exchangeRateUSDToIDR
    || job.exchangeRateUSDToIDR
    || 0,
  );
  return {
    id: receipt.id,
    jobId: job.jobId,
    date: String(receipt.receivedDate).slice(0, 10),
    paymentType: receipt.paymentType,
    subject: 'Principal',
    principal: job.customerName || '-',
    vesselOrJob: job.vesselName || job.jobId,
    invoiceType: receipt.paymentType === 'ADVANCE_PAYMENT' ? 'FDA Advance' : 'Invoice Receipt',
    invoiceNo: job.fda?.fdaNo || '-',
    bank: '-',
    remark: receipt.bankRemark || '',
    pph23: 0,
    idr,
    usd,
    exchangeRate,
    usdInIDR: usd * exchangeRate,
    idrEquivalent: idr + usd * exchangeRate,
    createdBy: 'Job Receipt',
  };
};

const toExpenseRow = (voucher: PaymentVoucher): ExpenseRow => {
  const currency = voucher.currency || 'IDR';
  const exchangeRate = Number(voucher.exchangeRateUSDToIDR) || 0;
  const surcharge = Number(voucher.paymentSurcharge) || 0;
  const other = Number(voucher.paymentOtherExpenses) || 0;
  const paid = Number(voucher.totalPaidAmount) || 0;
  const jobNumbers = [...new Set((voucher.items || []).map((item) => item.jobNumber).filter(Boolean))].join(', ');
  const total = Number(voucher.paymentTotalAmount) || paid + surcharge + other;
  return {
    id: voucher.id,
    date: String(voucher.paidAt).slice(0, 10),
    voucherNo: voucher.voucherNumber || '-',
    requestNo: voucher.requestNumber,
    vendor: voucher.vendorName || '-',
    jobInfo: voucher.jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional',
    jobNumbers: jobNumbers || '-',
    bank: voucher.bankName || '-',
    accountNumber: voucher.accountNumber || '-',
    paid,
    surcharge,
    other,
    total,
    currency,
    exchangeRate,
    exchangeRateDate: voucher.exchangeRateDate || '',
    totalInIDR: currency === 'IDR' ? total : exchangeRate > 0 ? total * exchangeRate : null,
    description: voucher.paymentDescription || '',
    paidBy: voucher.paidBy || '',
  };
};

const toPrincipalRefundExpenseRow = (job: JobCall, receipt: PrincipalReceipt): ExpenseRow => {
  const currency = receipt.currency || job.currency || 'IDR';
  const refundAmount = Number(receipt.refundAmount) || 0;
  const refundRate = Number(
    receipt.refundExchangeRateUSDToIDR
    || receipt.exchangeRateUSDToIDR
    || job.fda?.exchangeRateUSDToIDR
    || job.exchangeRateUSDToIDR
    || 0,
  );
  const totalInIDR = currency === 'USD' ? refundAmount * refundRate : refundAmount;
  return {
    id: `REFUND-${receipt.id}`,
    date: String(receipt.refundDate || '').slice(0, 10),
    voucherNo: receipt.refundBankReference || `REFUND-${receipt.id}`,
    requestNo: `REFUND-${receipt.id}`,
    vendor: job.customerName || 'Principal',
    jobInfo: 'JOB Vessel',
    jobNumbers: job.jobId,
    bank: 'Principal refund',
    accountNumber: '-',
    paid: refundAmount,
    surcharge: 0,
    other: 0,
    total: refundAmount,
    currency,
    exchangeRate: refundRate,
    exchangeRateDate: receipt.refundDate || receipt.receivedDate || '',
    totalInIDR: currency === 'USD' && refundRate <= 0 ? null : totalInIDR,
    description: `Refund lebih bayar ${currency} ${money(refundAmount)}`,
    paidBy: 'Finance',
  };
};

const sumBy = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

export const FinanceRecapView: React.FC<FinanceRecapViewProps> = ({ paymentVouchers, jobCalls }) => {
  const [startDate, setStartDate] = useState(() => rangeForMonth(0).from);
  const [endDate, setEndDate] = useState(() => rangeForMonth(0).to);
  const [entries, setEntries] = useState<AccountsReceivableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [page, setPage] = useState(1);

  const loadEntries = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    loadAccountsReceivableHistory()
      .then((history) => { if (!cancelled) setEntries(history); })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Data pemasukan gagal dimuat.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => loadEntries(), [loadEntries]);

  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const inRange = useCallback(
    (date: string) => (!startDate || date >= startDate) && (!endDate || date <= endDate),
    [startDate, endDate],
  );

  const incomeRows = useMemo(() => {
    if (invalidRange) return [];
    const receiptFingerprint = (jobId: string, date: string, paymentType: PrincipalReceipt['paymentType'], currency: 'IDR' | 'USD', amount: number) =>
      [jobId, date, paymentType, currency, amount.toFixed(2)].join('|');
    const jobReceiptRows = jobCalls.flatMap((job) => (job.principalReceipts || [])
      .filter((receipt) => !receipt.id.startsWith('FIN-AR-'))
      .map((receipt) => toPrincipalReceiptRow(job, receipt)));
    const jobReceiptByFingerprint = new Map<string, IncomeRow>();
    for (const row of jobReceiptRows) {
      if (!row.paymentType || !row.jobId) continue;
      if (row.idr > 0) jobReceiptByFingerprint.set(receiptFingerprint(row.jobId, row.date, row.paymentType, 'IDR', row.idr), row);
      if (row.usd > 0) jobReceiptByFingerprint.set(receiptFingerprint(row.jobId, row.date, row.paymentType, 'USD', row.usd), row);
    }
    const financeRows = entries.map(toIncomeRow).flatMap((row) => {
      if (row.subject !== 'Principal' || !row.jobId || !row.paymentType) return [row];
      let idr = row.idr;
      let usd = row.usd;
      let pphMerged = false;
      const mergeDuplicate = (currency: 'IDR' | 'USD', amount: number) => {
        const matchingReceipt = jobReceiptByFingerprint.get(receiptFingerprint(row.jobId, row.date, row.paymentType!, currency, amount));
        if (!matchingReceipt) return false;
        if (!pphMerged) {
          matchingReceipt.pph23 += row.pph23;
          pphMerged = true;
        }
        if (matchingReceipt.bank === '-') matchingReceipt.bank = row.bank;
        return true;
      };
      if (idr > 0 && mergeDuplicate('IDR', idr)) idr = 0;
      if (usd > 0 && mergeDuplicate('USD', usd)) usd = 0;
      if (idr === 0 && usd === 0) return [];
      return [{ ...row, idr, usd, usdInIDR: usd * row.exchangeRate, idrEquivalent: idr + usd * row.exchangeRate }];
    });
    return [...jobReceiptRows, ...financeRows]
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && inRange(row.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, inRange, invalidRange, jobCalls]);

  const expenseRows = useMemo(() => {
    if (invalidRange) return [];
    const voucherExpenses = paymentVouchers
      .flatMap(getPaymentVoucherPaymentEvents)
      .filter((voucher) => Boolean(voucher.paidAt))
      .map(toExpenseRow);
    const refundExpenses = jobCalls.flatMap((job) => (job.principalReceipts || [])
      .filter((receipt) => receipt.refundStatus === 'PAID')
      .map((receipt) => toPrincipalRefundExpenseRow(job, receipt)));
    return [...voucherExpenses, ...refundExpenses]
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && inRange(row.date))
      .sort((a, b) => a.date.localeCompare(b.date) || a.requestNo.localeCompare(b.requestNo));
  }, [jobCalls, paymentVouchers, inRange, invalidRange]);

  const totals = useMemo(() => {
    const inIDR = sumBy<IncomeRow>(incomeRows, (row) => row.idr);
    const inUSD = sumBy<IncomeRow>(incomeRows, (row) => row.usd);
    const usdInIDR = sumBy<IncomeRow>(incomeRows, (row) => row.usdInIDR);
    const pph23 = sumBy<IncomeRow>(incomeRows, (row) => row.pph23);
    const outUSD = sumBy<ExpenseRow>(expenseRows.filter((row) => row.currency === 'USD'), (row) => row.total);
    const usdOutIDR = sumBy<ExpenseRow>(expenseRows.filter((row) => row.currency === 'USD'), (row) => row.totalInIDR || 0);
    const outIDR = sumBy<ExpenseRow>(expenseRows.filter((row) => row.currency === 'IDR'), (row) => row.total) + usdOutIDR;
    return { inIDR, inUSD, usdInIDR, pph23, outIDR, outUSD, usdOutIDR, netIDR: inIDR + usdInIDR - outIDR };
  }, [incomeRows, expenseRows]);

  const monthRows = useMemo<MonthRow[]>(() => {
    const byMonth = new Map<string, MonthRow>();
    const bucket = (date: string) => {
      const key = date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, { month: key, inIDR: 0, inUSD: 0, usdInIDR: 0, outUSD: 0, usdOutIDR: 0, outIDR: 0 });
      return byMonth.get(key)!;
    };
    incomeRows.forEach((row) => {
      const item = bucket(row.date);
      item.inIDR += row.idr;
      item.inUSD += row.usd;
      item.usdInIDR += row.usdInIDR;
    });
    expenseRows.forEach((row) => {
      const item = bucket(row.date);
      if (row.currency === 'USD') {
        item.outUSD += row.total;
        item.usdOutIDR += row.totalInIDR || 0;
      } else {
        item.outIDR += row.total;
      }
    });
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [incomeRows, expenseRows]);

  const ledger = useMemo(() => {
    const merged = [
      ...incomeRows.map((row) => ({
        key: `IN-${row.id}`, date: row.date, kind: 'IN' as const,
        reference: row.subject === 'Principal' ? `${row.invoiceType} ${row.invoiceNo}`.trim() : 'Operasional',
        party: row.principal, detail: row.vesselOrJob, bank: row.bank, note: row.remark, exchangeRate: row.exchangeRate,
        inIDR: row.idrEquivalent, inUSD: row.usd, inRate: row.exchangeRate, outIDR: 0, outUSD: 0, outRate: 0, outIDREquivalent: null,
      })),
      ...expenseRows.map((row) => ({
        key: `OUT-${row.id}`, date: row.date, kind: 'OUT' as const,
        reference: row.voucherNo !== '-' ? row.voucherNo : row.requestNo,
        party: row.vendor, detail: row.jobInfo === 'Operasional' ? 'Operasional' : row.jobNumbers,
        bank: row.bank, note: `${row.currency}${row.description ? ` · ${row.description}` : ''}`, exchangeRate: row.exchangeRate,
        inIDR: 0, inUSD: 0, inRate: 0,
        outIDR: row.currency === 'IDR' ? row.total : 0,
        outUSD: row.currency === 'USD' ? row.total : 0,
        outRate: row.currency === 'USD' ? row.exchangeRate : 0,
        outIDREquivalent: row.totalInIDR,
      })),
    ];
    return merged.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  }, [incomeRows, expenseRows]);

  const pageCount = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedLedger = ledger.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const periodLabel = !startDate && !endDate
    ? 'Semua tanggal'
    : `${startDate ? formatDateDisplay(startDate) : 'Awal'} s.d. ${endDate ? formatDateDisplay(endDate) : 'Akhir'}`;
  const nothingToExport = incomeRows.length === 0 && expenseRows.length === 0;

  const applyRange = (from: string, to: string) => {
    setStartDate(from);
    setEndDate(to);
    setPage(1);
  };

  const handleDownload = async () => {
    setDownloadError('');
    setIsDownloading(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'MaritimPort';
      workbook.created = new Date();
      const money2 = '#,##0.00';
      const dateFmt = 'dd-mm-yyyy';

      const styleHeader = (sheet: ExcelJS.Worksheet, headerRow: number, columns: number) => {
        const row = sheet.getRow(headerRow);
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        sheet.views = [{ state: 'frozen', ySplit: headerRow }];
        sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns } };
      };
      const sumCell = (column: string, count: number, value: number) =>
        count > 0 ? { formula: `SUM(${column}2:${column}${count + 1})`, result: value } : 0;

      // Urutan sheet mengikuti urutan pembuatan: Ringkasan harus dibuat lebih dulu.
      const summary = workbook.addWorksheet('Ringkasan');

      // --- Pemasukan ---
      const incomeSheet = workbook.addWorksheet('Pemasukan');
      incomeSheet.addRow(['No', 'Tanggal', 'Subjek', 'Principal', 'Vessel / Job', 'Jenis Invoice', 'No Invoice', 'Bank', 'Keterangan', 'PPh 23 (IDR)', 'Jumlah IDR', 'Jumlah USD', 'Dicatat Oleh', 'Kurs USD/IDR', 'Ekuivalen IDR']);
      incomeRows.forEach((row, index) => incomeSheet.addRow([
        index + 1, toExcelDate(row.date), row.subject, row.principal, row.vesselOrJob, row.invoiceType, row.invoiceNo,
        row.bank, row.remark, row.pph23, row.idr, row.usd, row.createdBy, row.exchangeRate, row.idrEquivalent,
      ]));
      const incomeTotal = incomeSheet.addRow([
        '', '', '', '', '', '', '', '', 'TOTAL',
        sumCell('J', incomeRows.length, totals.pph23), sumCell('K', incomeRows.length, totals.inIDR), sumCell('L', incomeRows.length, totals.inUSD), '', '',
        sumCell('O', incomeRows.length, totals.inIDR + totals.usdInIDR),
      ]);
      incomeTotal.font = { bold: true };
      styleHeader(incomeSheet, 1, 15);
      incomeSheet.getColumn(2).numFmt = dateFmt;
      [10, 11, 12, 14, 15].forEach((column) => { incomeSheet.getColumn(column).numFmt = money2; });
      [6, 12, 12, 24, 24, 14, 22, 18, 32, 16, 18, 16, 20, 16, 20].forEach((width, index) => { incomeSheet.getColumn(index + 1).width = width; });

      // --- Pengeluaran ---
      const expenseSheet = workbook.addWorksheet('Pengeluaran');
      expenseSheet.addRow(['No', 'Tanggal Bayar', 'No Voucher', 'No Request', 'Vendor', 'Info JOB', 'Job Number', 'Bank Tujuan', 'No Rekening', 'Currency', 'Paid Amount', 'Surcharge', 'Biaya Lain', 'Total Dibayar', 'Kurs USD/IDR', 'Tanggal Kurs', 'Total IDR Ekuivalen', 'Keterangan', 'Dibayar Oleh']);
      expenseRows.forEach((row, index) => expenseSheet.addRow([
        index + 1, toExcelDate(row.date), row.voucherNo, row.requestNo, row.vendor, row.jobInfo, row.jobNumbers,
        row.bank, row.accountNumber, row.currency, row.paid, row.surcharge, row.other, row.total, row.exchangeRate || '', row.exchangeRateDate || '', row.totalInIDR, row.description, row.paidBy,
      ]));
      const expenseTotal = expenseSheet.addRow([
        '', '', '', '', '', '', '', '', 'TOTAL', '', '', '', '', '', '', '',
        sumCell('Q', expenseRows.length, totals.outIDR), '', '',
      ]);
      expenseTotal.font = { bold: true };
      styleHeader(expenseSheet, 1, 19);
      expenseSheet.getColumn(2).numFmt = dateFmt;
      [11, 12, 13, 14, 15, 17].forEach((column) => { expenseSheet.getColumn(column).numFmt = money2; });
      expenseSheet.getColumn(16).numFmt = dateFmt;
      [6, 14, 18, 20, 28, 14, 22, 18, 20, 12, 16, 14, 14, 18, 16, 16, 20, 32, 20].forEach((width, index) => { expenseSheet.getColumn(index + 1).width = width; });

      // --- Rekap Bulanan ---
      const monthSheet = workbook.addWorksheet('Rekap Bulanan');
      monthSheet.addRow(['Bulan', 'Pemasukan IDR', 'Pemasukan USD', 'Ekuiv. USD Masuk (IDR)', 'Pengeluaran IDR', 'Pengeluaran USD', 'Ekuiv. USD Keluar (IDR)', 'Total Pengeluaran IDR', 'Saldo IDR']);
      monthRows.forEach((row, index) => monthSheet.addRow([
        monthLabel(row.month), row.inIDR, row.inUSD, row.usdInIDR, row.outIDR, row.outUSD, row.usdOutIDR,
        row.outIDR + row.usdOutIDR,
        { formula: `B${index + 2}+D${index + 2}-H${index + 2}`, result: row.inIDR + row.usdInIDR - row.outIDR - row.usdOutIDR },
      ]));
      const monthTotal = monthSheet.addRow([
        'TOTAL',
        sumCell('B', monthRows.length, totals.inIDR), sumCell('C', monthRows.length, totals.inUSD),
        sumCell('D', monthRows.length, totals.usdInIDR), sumCell('E', monthRows.length, totals.outIDR - totals.usdOutIDR),
        sumCell('F', monthRows.length, totals.outUSD), sumCell('G', monthRows.length, totals.usdOutIDR),
        sumCell('H', monthRows.length, totals.outIDR), sumCell('I', monthRows.length, totals.netIDR),
      ]);
      monthTotal.font = { bold: true };
      styleHeader(monthSheet, 1, 9);
      [2, 3, 4, 5, 6, 7, 8, 9].forEach((column) => { monthSheet.getColumn(column).numFmt = money2; });
      [22, 20, 18, 22, 20, 20, 22, 22, 20].forEach((width, index) => { monthSheet.getColumn(index + 1).width = width; });

      const transactionSheet = workbook.addWorksheet('Rincian Transaksi');
      transactionSheet.addRow([
        'No', 'Tanggal', 'Jenis', 'Referensi', 'Pihak', 'Vessel / Job', 'Bank',
        'Masuk IDR Ekuiv.', 'Masuk USD', 'Kurs Masuk USD/IDR', 'Keluar IDR', 'Keluar USD',
        'Kurs Keluar USD/IDR', 'Keluar IDR Ekuiv.',
      ]);
      ledger.forEach((row, index) => transactionSheet.addRow([
        index + 1, toExcelDate(row.date), row.kind === 'IN' ? 'Masuk' : 'Keluar', row.reference,
        row.party, row.detail, row.bank, row.inIDR, row.inUSD, row.inRate || '', row.outIDR,
        row.outUSD, row.outRate || '', row.outIDREquivalent,
      ]));
      const transactionTotal = transactionSheet.addRow([
        '', '', '', '', '', '', 'TOTAL',
        sumCell('H', ledger.length, totals.inIDR + totals.usdInIDR),
        sumCell('I', ledger.length, totals.inUSD), '',
        sumCell('K', ledger.length, sumBy<ExpenseRow>(expenseRows.filter((row) => row.currency === 'IDR'), (row) => row.total)),
        sumCell('L', ledger.length, totals.outUSD), '',
        sumCell('N', ledger.length, totals.outIDR),
      ]);
      transactionTotal.font = { bold: true };
      styleHeader(transactionSheet, 1, 14);
      transactionSheet.getColumn(2).numFmt = dateFmt;
      [8, 9, 10, 11, 12, 13, 14].forEach((column) => { transactionSheet.getColumn(column).numFmt = money2; });
      [6, 14, 14, 26, 28, 20, 24, 20, 16, 20, 18, 16, 20, 20].forEach((width, index) => { transactionSheet.getColumn(index + 1).width = width; });

      // --- Isi sheet Ringkasan ---
      summary.addRow(['REKAP KEUANGAN']);
      summary.addRow(['Periode', periodLabel]);
      summary.addRow(['Dibuat', new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())]);
      summary.addRow([]);
      summary.addRow(['Keterangan', 'IDR', 'USD']);
      const incomeLast = incomeRows.length + 1;
      const expenseLast = expenseRows.length + 1;
      summary.addRow([
        'Total Pemasukan (IDR ekuivalen)',
        incomeRows.length > 0 ? { formula: `SUM(Pemasukan!O2:O${incomeLast})`, result: totals.inIDR + totals.usdInIDR } : 0,
        incomeRows.length > 0 ? { formula: `SUM(Pemasukan!L2:L${incomeLast})`, result: totals.inUSD } : 0,
      ]);
      summary.addRow([
        'Total Pengeluaran',
        expenseRows.length > 0 ? { formula: `SUM(Pengeluaran!Q2:Q${expenseLast})`, result: totals.outIDR } : 0,
        ledger.length > 0 ? { formula: `SUM('Rincian Transaksi'!L2:L${ledger.length + 1})`, result: totals.outUSD } : 0,
      ]);
      summary.addRow(['Saldo Bersih', { formula: 'B6-B7', result: totals.netIDR }, { formula: 'C6-C7', result: totals.inUSD - totals.outUSD }]);
      summary.addRow(['PPh 23 dipotong (info, sudah termasuk dalam pemasukan)', incomeRows.length > 0 ? { formula: `SUM(Pemasukan!J2:J${incomeLast})`, result: totals.pph23 } : 0, '']);
      summary.addRow(['Jumlah transaksi pemasukan', incomeRows.length, '']);
      summary.addRow(['Jumlah transaksi pengeluaran', expenseRows.length, '']);
      summary.addRow([]);
      summary.addRow(['Catatan: pemasukan USD dikonversi memakai kurs invoice/job yang disimpan saat transaksi; pemasukan tanpa kurs tetap dilaporkan dalam mata uang aslinya.']);
      summary.getRow(1).font = { bold: true, size: 14 };
      summary.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summary.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      summary.getRow(8).font = { bold: true };
      [2, 3].forEach((column) => { summary.getColumn(column).numFmt = money2; });
      summary.getColumn(1).width = 52;
      summary.getColumn(2).width = 24;
      summary.getColumn(3).width = 20;
      summary.getRow(10).getCell(2).numFmt = '0';
      summary.getRow(11).getCell(2).numFmt = '0';

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rekap-keuangan-${startDate || 'awal'}-${endDate || 'akhir'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError: unknown) {
      console.error('Gagal membuat Excel rekap keuangan:', exportError);
      setDownloadError(exportError instanceof Error ? exportError.message : 'File Excel gagal dibuat.');
    } finally {
      setIsDownloading(false);
    }
  };

  const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500';
  const num = 'px-3 py-2 text-right font-mono text-xs';
  const dateInputClass = 'w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Finance</div>
            <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Rekap Keuangan</h1>
            <p className="text-xs text-slate-500">Rekap pemasukan (Accounts Receivable) dan pengeluaran (Payment terbayar) pada periode yang dipilih.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Dari tanggal
              <DateInput value={startDate} onChange={(value) => applyRange(value, endDate)} inputClassName={dateInputClass} ariaLabel="Tanggal awal" max={endDate || undefined} />
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Sampai tanggal
              <DateInput value={endDate} onChange={(value) => applyRange(startDate, value)} inputClassName={dateInputClass} ariaLabel="Tanggal akhir" min={startDate || undefined} />
            </label>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={nothingToExport || invalidRange || isLoading || isDownloading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={15} /> {isDownloading ? 'Membuat file…' : 'Download Excel'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Periode cepat</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => { const { from, to } = preset.range(); applyRange(from, to); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {preset.label}
            </button>
          ))}
          <span className="ml-auto text-xs font-semibold text-slate-600">Periode: {periodLabel}</span>
        </div>
        {invalidRange && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">Tanggal awal tidak boleh lebih besar dari tanggal akhir.</p>}
        {downloadError && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{downloadError}</p>}
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => { loadEntries(); }} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-100">Coba lagi</button>
        </div>
      )}

      <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><ArrowDownToLine size={14} /> Pemasukan</div>
          <div className="mt-2 font-mono text-lg font-black text-emerald-700">IDR {money(totals.inIDR + totals.usdInIDR)}</div>
          <div className="whitespace-nowrap font-mono text-xs font-semibold text-emerald-700">USD {money(totals.inUSD)} · ekuivalen IDR {money(totals.usdInIDR)}</div>
          <div className="mt-1 text-[11px] text-slate-500">{incomeRows.length} transaksi · PPh 23: IDR {money(totals.pph23)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><ArrowUpFromLine size={14} /> Pengeluaran</div>
          <div className="mt-2 font-mono text-lg font-black text-rose-700">IDR {money(totals.outIDR)}</div>
          {totals.outUSD > 0 && <div className="whitespace-nowrap font-mono text-xs font-semibold text-rose-700">USD {money(totals.outUSD)} · ekuivalen IDR {money(totals.usdOutIDR)}</div>}
          <div className="mt-1 text-[11px] text-slate-500">{expenseRows.length} voucher terbayar</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><Calculator size={14} /> Saldo bersih</div>
          <div className={`mt-2 font-mono text-lg font-black ${totals.netIDR < 0 ? 'text-rose-700' : 'text-slate-900'}`}>IDR {money(totals.netIDR)}</div>
          <div className="whitespace-nowrap font-mono text-xs font-semibold text-slate-600">USD {money(totals.inUSD)} · ekuivalen IDR {money(totals.usdInIDR)}</div>
          <div className="mt-1 text-[11px] text-slate-500">Konversi memakai kurs invoice yang tersimpan pada tanggal penerimaan.</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-black text-slate-900">Rekap per bulan</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Bulan</th>
                <th className={`${th} text-right`}>Pemasukan IDR</th>
                <th className={`${th} text-right`}>Pemasukan USD</th>
                <th className={`${th} text-right`}>Ekuiv. USD (IDR)</th>
                <th className={`${th} text-right`}>Pengeluaran IDR</th>
                <th className={`${th} text-right`}>Pengeluaran USD</th>
                <th className={`${th} text-right`}>Ekuiv. USD Keluar</th>
                <th className={`${th} text-right`}>Total Keluar IDR</th>
                <th className={`${th} text-right`}>Saldo IDR</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="px-3 py-6 text-center text-xs text-slate-500">Memuat data…</td></tr>}
              {!isLoading && monthRows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-xs text-slate-500">Tidak ada transaksi pada periode ini.</td></tr>}
              {monthRows.map((row) => (
                <tr key={row.month} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs font-semibold text-slate-800">{monthLabel(row.month)}</td>
                  <td className={num}>{money(row.inIDR)}</td>
                  <td className={num}>{money(row.inUSD)}</td>
                  <td className={num}>{money(row.usdInIDR)}</td>
                  <td className={num}>{money(row.outIDR)}</td>
                  <td className={num}>{money(row.outUSD)}</td>
                  <td className={num}>{money(row.usdOutIDR)}</td>
                  <td className={num}>{money(row.outIDR + row.usdOutIDR)}</td>
                  <td className={`${num} font-bold ${row.inIDR + row.usdInIDR - row.outIDR - row.usdOutIDR < 0 ? 'text-rose-700' : ''}`}>{money(row.inIDR + row.usdInIDR - row.outIDR - row.usdOutIDR)}</td>
                </tr>
              ))}
            </tbody>
            {monthRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td className="px-3 py-2 text-xs font-black text-slate-900">TOTAL</td>
                  <td className={`${num} font-black`}>{money(totals.inIDR)}</td>
                  <td className={`${num} font-black`}>{money(totals.inUSD)}</td>
                  <td className={`${num} font-black`}>{money(totals.usdInIDR)}</td>
                  <td className={`${num} font-black`}>{money(totals.outIDR)}</td>
                  <td className={`${num} font-black`}>{money(totals.outUSD)}</td>
                  <td className={`${num} font-black`}>{money(totals.usdOutIDR)}</td>
                  <td className={`${num} font-black`}>{money(totals.outIDR)}</td>
                  <td className={`${num} font-black`}>{money(totals.netIDR)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="text-sm font-black text-slate-900">Rincian transaksi</div>
          <div className="text-[11px] text-slate-500">{ledger.length} baris · Excel memuat seluruh baris</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Tanggal</th>
                <th className={th}>Jenis</th>
                <th className={th}>Referensi</th>
                <th className={th}>Pihak</th>
                <th className={th}>Vessel / Job</th>
                <th className={th}>Bank</th>
                <th className={`${th} text-right`}>Masuk IDR Ekuiv.</th>
                <th className={`${th} text-right`}>Masuk USD</th>
                <th className={`${th} text-right`}>Kurs Masuk USD/IDR</th>
                <th className={`${th} text-right`}>Keluar IDR</th>
                <th className={`${th} text-right`}>Keluar USD</th>
                <th className={`${th} text-right`}>Kurs Keluar USD/IDR</th>
                <th className={`${th} text-right`}>Keluar IDR Ekuiv.</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && ledger.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-xs text-slate-500">Tidak ada transaksi pada periode ini.</td></tr>}
              {pagedLedger.map((row) => (
                <tr key={row.key} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">{formatDateDisplay(row.date)}</td>
                  <td className="px-3 py-2 text-xs font-bold">
                    <span className={row.kind === 'IN' ? 'text-emerald-700' : 'text-rose-700'}>{row.kind === 'IN' ? 'Masuk' : 'Keluar'}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.reference || '-'}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.party}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.detail}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.bank}</td>
                  <td className={num}>{row.kind === 'IN' ? money(row.inIDR) : '-'}</td>
                  <td className={num}>{row.kind === 'IN' ? money(row.inUSD) : '-'}</td>
                  <td className={num}>{row.kind === 'IN' && row.inRate > 0 ? money(row.inRate) : '-'}</td>
                  <td className={num}>{row.kind === 'OUT' ? money(row.outIDR) : '-'}</td>
                  <td className={num}>{row.kind === 'OUT' && row.outUSD > 0 ? money(row.outUSD, 'USD') : '-'}</td>
                  <td className={num}>{row.kind === 'OUT' && row.outRate > 0 ? money(row.outRate) : '-'}</td>
                  <td className={num}>{row.kind === 'OUT' && row.outIDREquivalent !== null ? money(row.outIDREquivalent) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
            <button type="button" aria-label="Halaman sebelumnya" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /></button>
            <span>Halaman {currentPage} dari {pageCount}</span>
            <button type="button" aria-label="Halaman berikutnya" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Dasar perhitungan: pemasukan dari Accounts Receivable menurut Date Income; pengeluaran dari seluruh transaksi Payment Voucher yang dibayar, termasuk pembayaran lama pada Error Correction. Nilai USD dikonversi ke IDR memakai kurs historis yang tersimpan pada Request Date.
      </p>
    </div>
  );
};

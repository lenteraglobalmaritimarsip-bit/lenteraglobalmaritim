import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Currency, JobCall } from '../../types';
import { convertPrincipalReceiptAmount } from '../../utils/principalInvoice';
import { formatDateDisplay } from '../../utils/date';

interface JobInvoiceMonitoringViewProps {
  jobCalls: JobCall[];
  audience: 'MANAGER_OPS' | 'DIRECTOR';
}

interface InvoiceMonitoringRow {
  job: JobCall;
  approvalDate: string;
  totalBilledIDR: number;
  advancePaymentIDR: number;
  remainingIDR: number;
  ageDays: number | null;
  isPaid: boolean;
}

interface ReceiptEvent {
  date: string;
  amountIDR: number;
}

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const dateOnlyInJakarta = (value?: string | null): string => {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?$)/.test(raw)) return raw.slice(0, 10);

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const dayDifference = (from: string, to: string) => {
  const fromParts = from.split('-').map(Number);
  const toParts = to.split('-').map(Number);
  const fromTime = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toTime = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
  return Math.max(0, Math.floor((toTime - fromTime) / 86_400_000));
};

const getReceiptAmountIDR = (
  job: JobCall,
  amount: number,
  currency: Currency,
  exchangeRate?: number,
) => convertPrincipalReceiptAmount(job, amount, currency, 'IDR', exchangeRate);

const buildMonitoringRow = (job: JobCall): InvoiceMonitoringRow => {
  const currency = job.fda.currency || job.currency || 'IDR';
  const exchangeRate = Number(
    job.fda.exchangeRateUSDToIDR
    || job.quotation?.epda?.exchangeRateUSDToIDR
    || job.exchangeRateUSDToIDR
    || 15800,
  );
  const rawTotal = Math.max(0, Number(job.fda.finalBilledToPrincipal || 0));
  const totalBilledIDR = Math.round(currency === 'USD' ? rawTotal * exchangeRate : rawTotal);
  const receipts = (job.principalReceipts || []).filter((receipt) => receipt.invoiceType !== 'FPDA');
  let advancePaymentIDR = 0;
  let totalReceivedIDR = 0;
  const receiptEvents: ReceiptEvent[] = [];

  receipts.forEach((receipt) => {
    const receiptCurrency = receipt.currency || currency;
    const received = getReceiptAmountIDR(
      job,
      Number(receipt.amount || 0),
      receiptCurrency,
      receipt.exchangeRateUSDToIDR || exchangeRate,
    );
    const refund = receipt.refundStatus === 'PAID'
      ? getReceiptAmountIDR(
          job,
          Number(receipt.refundAmount || 0),
          receiptCurrency,
          receipt.refundExchangeRateUSDToIDR || receipt.exchangeRateUSDToIDR || exchangeRate,
        )
      : 0;

    totalReceivedIDR += received - refund;
    if (receipt.paymentType === 'ADVANCE_PAYMENT') {
      advancePaymentIDR += received - refund;
    }

    const receivedDate = dateOnlyInJakarta(receipt.receivedDate);
    if (receivedDate && received > 0) receiptEvents.push({ date: receivedDate, amountIDR: received });
    if (refund > 0) {
      const refundDate = dateOnlyInJakarta(receipt.refundDate) || receivedDate;
      if (refundDate) receiptEvents.push({ date: refundDate, amountIDR: -refund });
    }
  });

  const remainingIDR = Math.max(0, totalBilledIDR - Math.round(totalReceivedIDR));
  const isPaid = remainingIDR === 0;
  const approvalDate = dateOnlyInJakarta(job.fda.approvedAt) || dateOnlyInJakarta(job.fda.date);
  const sortedEvents = [...receiptEvents].sort((first, second) => first.date.localeCompare(second.date));
  let cumulativeReceived = 0;
  let settlementDate = '';
  for (const event of sortedEvents) {
    cumulativeReceived += event.amountIDR;
    if (cumulativeReceived >= totalBilledIDR && totalBilledIDR > 0) {
      settlementDate = event.date;
      break;
    }
  }
  if (!settlementDate && isPaid) {
    settlementDate = dateOnlyInJakarta(job.closing?.closedAt) || approvalDate;
  }

  const endDate = isPaid ? settlementDate : dateOnlyInJakarta(new Date().toISOString());
  const ageDays = approvalDate && endDate ? dayDifference(approvalDate, endDate) : null;

  return {
    job,
    approvalDate,
    totalBilledIDR,
    advancePaymentIDR: Math.max(0, Math.round(advancePaymentIDR)),
    remainingIDR,
    ageDays,
    isPaid,
  };
};

export const JobInvoiceMonitoringView: React.FC<JobInvoiceMonitoringViewProps> = ({ jobCalls, audience }) => {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => jobCalls
    .filter((job) => Boolean(job.fda?.fdaApproved || job.fda?.approvalStatus === 'APPROVED'))
    .map(buildMonitoringRow)
    .sort((first, second) => {
      const firstDate = first.approvalDate || '9999-12-31';
      const secondDate = second.approvalDate || '9999-12-31';
      return firstDate.localeCompare(secondDate) || first.job.jobId.localeCompare(second.job.jobId);
    }), [jobCalls]);
  const filteredRows = rows.filter(({ job }) => (
    `${job.jobId} ${job.vesselName} ${job.customerName} ${job.fda.fdaNo}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ));
  const roleTitle = audience === 'DIRECTOR' ? 'Direktur' : 'Manager Operations';

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">{roleTitle}</div>
        <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">Monitoring JOB Invoice</h1>
        <p className="mt-1 text-xs text-slate-500">
          FDA yang telah disetujui, termasuk histori job yang sudah ditutup. Nilai ditampilkan dalam Rupiah; untuk FDA USD, kurs FDA ikut ditampilkan.
        </p>
        <label className="relative mt-4 block w-full max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari Job Vessel, kapal, customer, atau No FDA..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-400"
          />
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">No</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Job Vessel</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Vessel Name</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Date FDA</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">No FDA</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Tagihan</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Advance Payment</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Sisa Tagihan</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Umur Tagihan</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-400">
                    {rows.length ? 'Tidak ada invoice yang cocok dengan pencarian.' : 'Belum ada FDA yang disetujui.'}
                  </td>
                </tr>
              ) : filteredRows.map((row, index) => {
                const currency = row.job.fda.currency || row.job.currency || 'IDR';
                const exchangeRate = Number(
                  row.job.fda.exchangeRateUSDToIDR
                  || row.job.quotation?.epda?.exchangeRateUSDToIDR
                  || row.job.exchangeRateUSDToIDR
                  || 15800,
                );
                const originalTotal = Number(row.job.fda.finalBilledToPrincipal || 0);
                return (
                  <tr key={row.job.jobId} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-slate-800">{row.job.jobId}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-700">{row.job.vesselName || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-700">{row.job.customerName || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600">{formatDateDisplay(row.approvalDate)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-slate-700">{row.job.fda.fdaNo || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-mono text-slate-800">
                      <div>{idrFormatter.format(row.totalBilledIDR)}</div>
                      {currency === 'USD' && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          USD {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(originalTotal)}
                          {' × Rp '}
                          {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(exchangeRate)}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-mono text-slate-700">{idrFormatter.format(row.advancePaymentIDR)}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right text-sm font-mono font-semibold ${row.remainingIDR > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {idrFormatter.format(row.remainingIDR)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-slate-700">{row.ageDays === null ? '-' : `${row.ageDays} hari`}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {row.isPaid ? 'Lunas' : 'Belum Lunas'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

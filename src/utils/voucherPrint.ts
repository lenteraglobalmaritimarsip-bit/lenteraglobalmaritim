import { PaymentVoucher } from '../types';
import { db } from '../db/storage';
import { formatDateDisplay } from './date';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PrintableVoucher {
  requestNumber: string;
  requestDate: string;
  requestedPaymentDate: string;
  jobInfo: PaymentVoucher['jobInfo'];
  requestBy: string;
  checkerName?: string;
  paidBy?: string;
  paidAt?: string;
  signerName?: string;
  includeFinancePrintDetails?: boolean;
  vendorName: string;
  paidTo: string;
  bankName: string;
  accountNumber: string;
  items: Pick<PaymentVoucher['items'][number], 'jobNumber' | 'documentType' | 'documentNumber' | 'customerName' | 'itemService' | 'amount' | 'vatAmount' | 'total' | 'pph23Amount' | 'paidAmount'>[];
}

// Returns an error message, or null when the print window opened.
export const printPaymentVoucher = (voucher: PrintableVoucher): string | null => {
  const { requestNumber, requestBy, jobInfo } = voucher;
  const formattedDate = formatDateDisplay(voucher.requestDate);
  const formattedRequestedPaymentDate = formatDateDisplay(voucher.requestedPaymentDate);
  const paidTimestamp = voucher.paidAt ? new Date(voucher.paidAt) : null;
  const formattedPaidDate = paidTimestamp && !Number.isNaN(paidTimestamp.getTime())
    ? formatDateDisplay(voucher.paidAt)
    : '-';
  const printedAt = new Date();
  const printedDate = formatDateDisplay(printedAt);
  const printedTime = printedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const jobNumbers = [...new Set(voucher.items.map((item) => item.jobNumber.trim()).filter(Boolean))].join(', ');
  const infoJob = jobInfo === 'JOB_VESSEL' ? 'JOB Vessel' : 'Operasional';
  const partyLabel = jobInfo === 'JOB_VESSEL' ? 'Vessel name' : 'Customer';
  const sum = (pick: (item: PrintableVoucher['items'][number]) => number) => voucher.items.reduce((total, item) => total + (pick(item) || 0), 0);
  const totalBeforePph = sum((item) => item.total);
  const totalPph23 = sum((item) => item.pph23Amount);
  const totalPayment = totalBeforePph - totalPph23;
  const financeUsers = db.getState().users.filter((user) => user.role === 'FINANCE' && user.status !== 'INACTIVE');
  const checker = voucher.paidBy || financeUsers.find((user) => user.name === voucher.checkerName)?.name || financeUsers[0]?.name || '';
  const logoUrl = `${window.location.origin}/lenteraglobalmaritim/lgm-logo.png`;
  const bodyRows = voucher.items.map((row, index) => `<tr><td class="c">${index + 1}</td><td>${escapeHtml(row.jobNumber)}</td>${jobInfo === 'JOB_VESSEL' ? `<td>${escapeHtml(row.documentType && row.documentNumber ? `${row.documentType}: ${row.documentNumber}` : '-')}</td>` : ''}<td>${escapeHtml(row.customerName)}</td><td>${escapeHtml(row.itemService)}</td><td class="r">${money(row.amount)}</td><td class="r">${money(row.vatAmount)}</td><td class="r">${money(row.total)}</td><td class="r">${money(row.pph23Amount)}</td><td class="r b">${money(row.paidAmount)}</td></tr>`).join('');
  const metaField = (label: string, value: string) => label
    ? `<td class="k">${label}</td><td class="separator">:</td><td>${value}</td>`
    : '<td></td><td></td><td></td>';
  const metaRow = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) =>
    `<tr>${metaField(leftLabel, leftValue)}${metaField(rightLabel, rightValue)}</tr>`;
  const metaRows = voucher.includeFinancePrintDetails
    ? [
      metaRow('Request No.', escapeHtml(requestNumber), 'Date Paid', escapeHtml(formattedPaidDate)),
      metaRow('Request Date', escapeHtml(formattedDate), 'Vendor Name', escapeHtml(voucher.vendorName)),
      metaRow('Info JOB / JOB Number', `${infoJob} / ${escapeHtml(jobNumbers || '-')}`, 'Paid To', escapeHtml(voucher.paidTo)),
      metaRow('Request By', escapeHtml(requestBy), 'Bank', escapeHtml(voucher.bankName)),
      metaRow('', '', 'A/c Number', escapeHtml(voucher.accountNumber)),
      metaRow('', '', 'Requested Payment Date', escapeHtml(formattedRequestedPaymentDate)),
    ].join('')
    : [
      metaRow('Request No.', escapeHtml(requestNumber), 'Vendor Name', escapeHtml(voucher.vendorName)),
      metaRow('Request Date', escapeHtml(formattedDate), 'Paid To', escapeHtml(voucher.paidTo)),
      metaRow('Info JOB / JOB Number', `${infoJob} / ${escapeHtml(jobNumbers || '-')}`, 'Bank', escapeHtml(voucher.bankName)),
      metaRow('Request By', escapeHtml(requestBy), 'A/c Number', escapeHtml(voucher.accountNumber)),
      metaRow('', '', 'Requested Payment Date', escapeHtml(formattedRequestedPaymentDate)),
    ].join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payment Voucher ${escapeHtml(requestNumber)}</title><style>
    @page{size:A4 portrait;margin:12mm 12mm 40mm}
    body{font-family:Arial,sans-serif;font-size:10px;color:#172033;margin:0}
    .brand-row{text-align:center;margin-bottom:8px}
    .brand-wrap{display:inline-flex;align-items:center;gap:14px;text-align:left}
    .logo{width:76px;height:58px;object-fit:contain}
    .brand{font-weight:700;font-size:21px;line-height:1.15}
    .tag{color:#666;font-size:13px;margin-top:5px}
    h2{text-align:center;background:#182a50;color:#fff;padding:8px;font-size:13px;margin:14px 0 12px;letter-spacing:1px}
    .meta{width:100%;table-layout:fixed;border-collapse:collapse;margin-bottom:12px}
    .meta td{padding:2px 4px;vertical-align:top}
    .meta td.k{font-weight:bold}
    .meta tr:last-child td{white-space:nowrap}
    .meta td.separator{text-align:center;padding-left:0;padding-right:0}
    .meta td:nth-child(1){width:20%}.meta td:nth-child(2){width:2%}.meta td:nth-child(3){width:28%}
    .meta td:nth-child(4){width:19%}.meta td:nth-child(5){width:2%}.meta td:nth-child(6){width:29%}
    .meta tr td:nth-child(n+4){position:relative;left:24px}
    table.items{width:100%;border-collapse:collapse}
    table.items th,table.items td{border:1px solid #777;padding:4px 4px;font-size:9px}
    table.items th{background:#e8ecf2;text-transform:uppercase;font-size:8px;text-align:center}
    .r{text-align:right}.c{text-align:center}.b{font-weight:bold}
    .pph{color:#dc2626;font-weight:bold}
    .summary{width:55%;margin:10px 0 0 auto;border-collapse:collapse}
    .summary td{border:1px solid #777;padding:5px 7px;font-size:10px}
    .summary td.k{font-weight:bold;background:#e8ecf2}
    .summary tr.grand td{font-weight:bold;background:#fff;color:#000}
    .footer{position:fixed;bottom:0;left:0;width:34%;font-size:7px;color:#666}
    .sign{position:fixed;bottom:0;right:0;width:65%;border-collapse:collapse;page-break-inside:avoid;font-size:9px}
    .sign td{width:33.33%;height:5mm;border:1px solid #777;text-align:center;padding:2px}
    .sign .space{height:16mm}
  </style></head><body>
    <div class="brand-row"><div class="brand-wrap"><img class="logo" src="${logoUrl}" alt="LGM"><div><div class="brand">PT Lentera Global Maritim</div><div class="tag">Seamless Agent, Global Reach</div></div></div></div>
    <h2>REQUEST PAYMENT VOUCHER</h2>
    <table class="meta">${metaRows}</table>
    <table class="items"><thead><tr><th>No</th><th>JOB Number</th>${jobInfo === 'JOB_VESSEL' ? '<th>FDA / FPDA Number</th>' : ''}<th>${partyLabel}</th><th>Item Service</th><th>Amount</th><th>Vat</th><th>Total</th><th>PPH 23 (2%)</th><th>Paid Amount</th></tr></thead>
    <tbody>${bodyRows}</tbody></table>
    <table class="summary">
      <tr><td class="k">Total</td><td class="r">${money(totalBeforePph)}</td></tr>
      <tr class="pph"><td class="k">PPh 23</td><td class="r">${totalPph23 ? '-' : ''}${money(totalPph23)}</td></tr>
      <tr class="grand"><td>Total Payment</td><td class="r">${money(totalPayment)}</td></tr>
    </table>
    ${voucher.includeFinancePrintDetails ? `<div class="footer">Cetakan ini asli dikeluarkan PT. Lentera Global Maritim | ${printedDate} | ${printedTime}</div>` : ''}
    <table class="sign"><tbody>
    <tr><td>Maker</td><td>Checker</td><td>Signer</td></tr>
    <tr><td class="space"></td><td class="space"></td><td class="space"></td></tr>
    <tr><td>( ${escapeHtml(requestBy)} )</td><td>( ${escapeHtml(checker || "                    ")} )</td><td>( ${escapeHtml(voucher.signerName || "                    ")} )</td></tr>
    </tbody></table>
  </body></html>`;  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) return 'Pop-up diblokir browser. Izinkan pop-up untuk mencetak voucher.';
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
  return null;
};

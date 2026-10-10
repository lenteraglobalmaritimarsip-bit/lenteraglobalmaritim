import { PaymentVoucher } from '../types';
import { db } from '../db/storage';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PrintableVoucher {
  requestNumber: string;
  requestDate: string;
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
  items: Pick<PaymentVoucher['items'][number], 'jobNumber' | 'customerName' | 'itemService' | 'amount' | 'vatAmount' | 'total' | 'pph23Amount' | 'paidAmount'>[];
}

// Returns an error message, or null when the print window opened.
export const printPaymentVoucher = (voucher: PrintableVoucher): string | null => {
  const { requestNumber, requestBy, jobInfo } = voucher;
  const formattedDate = new Date(`${String(voucher.requestDate).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const paidTimestamp = voucher.paidAt ? new Date(voucher.paidAt) : null;
  const formattedPaidDate = paidTimestamp && !Number.isNaN(paidTimestamp.getTime())
    ? paidTimestamp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-';
  const printedAt = new Date();
  const printedDate = printedAt.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  const bodyRows = voucher.items.map((row, index) => `<tr><td class="c">${index + 1}</td><td>${escapeHtml(row.jobNumber)}</td><td>${escapeHtml(row.customerName)}</td><td>${escapeHtml(row.itemService)}</td><td class="r">${money(row.amount)}</td><td class="r">${money(row.vatAmount)}</td><td class="r">${money(row.total)}</td><td class="r">${money(row.pph23Amount)}</td><td class="r b">${money(row.paidAmount)}</td></tr>`).join('');
  const metaRows = voucher.includeFinancePrintDetails
    ? `<tr><td class="k">Request No.</td><td>: ${escapeHtml(requestNumber)}</td><td class="k">Date Paid</td><td>: ${escapeHtml(formattedPaidDate)}</td></tr><tr><td class="k">Request Date</td><td>: ${escapeHtml(formattedDate)}</td><td class="k">Vendor Name</td><td>: ${escapeHtml(voucher.vendorName)}</td></tr><tr><td class="k">Info JOB / JOB Number</td><td>: ${infoJob} / ${escapeHtml(jobNumbers || '-')}</td><td class="k">Paid To</td><td>: ${escapeHtml(voucher.paidTo)}</td></tr><tr><td class="k">Request By</td><td>: ${escapeHtml(requestBy)}</td><td class="k">Bank</td><td>: ${escapeHtml(voucher.bankName)}</td></tr><tr><td></td><td></td><td class="k">A/c Number</td><td>: ${escapeHtml(voucher.accountNumber)}</td></tr>`
    : `<tr><td class="k">Request No.</td><td>: ${escapeHtml(requestNumber)}</td><td class="k">Vendor Name</td><td>: ${escapeHtml(voucher.vendorName)}</td></tr><tr><td class="k">Request Date</td><td>: ${escapeHtml(formattedDate)}</td><td class="k">Paid To</td><td>: ${escapeHtml(voucher.paidTo)}</td></tr><tr><td class="k">Info JOB / JOB Number</td><td>: ${infoJob} / ${escapeHtml(jobNumbers || '-')}</td><td class="k">Bank</td><td>: ${escapeHtml(voucher.bankName)}</td></tr><tr><td class="k">Request By</td><td>: ${escapeHtml(requestBy)}</td><td class="k">A/c Number</td><td>: ${escapeHtml(voucher.accountNumber)}</td></tr>`;
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
    .meta td:nth-child(1){width:20%}.meta td:nth-child(2){width:30%}
    .meta td:nth-child(3){width:17%;padding-left:12px}.meta td:nth-child(4){width:33%}
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
    <table class="items"><thead><tr><th>No</th><th>JOB Number</th><th>${partyLabel}</th><th>Item Service</th><th>Amount</th><th>Vat</th><th>Total</th><th>PPH 23 (2%)</th><th>Paid Amount</th></tr></thead>
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

export const printPaymentReceipt = (voucher: PaymentVoucher): string | null => {
  if (voucher.status !== 'PAID') return 'Kwitansi hanya tersedia untuk voucher yang sudah dibayar.';

  const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
  const paidDate = voucher.paidAt
    ? new Date(voucher.paidAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';
  const receiptNumber = `KW-${voucher.requestNumber}`;
  const rows = voucher.items.map((item, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(item.jobNumber)}</td>
      <td>${escapeHtml(item.customerName)}</td>
      <td>${escapeHtml(item.itemService)}</td>
      <td class="amount">${money(item.paidAmount)}</td>
    </tr>
  `).join('');
  const logoUrl = `${window.location.origin}/lenteraglobalmaritim/lgm-logo.png`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Kwitansi ${escapeHtml(voucher.requestNumber)}</title><style>
    @page{size:A4 portrait;margin:18mm}
    body{font-family:Arial,sans-serif;color:#172033;font-size:12px;margin:0}
    .brand{text-align:center;margin-bottom:20px}.brand img{width:76px;height:58px;object-fit:contain;vertical-align:middle;margin-right:12px}.brand-name{display:inline-block;vertical-align:middle;text-align:left;font-size:19px;font-weight:700;color:#3562a8}.tag{font-size:11px;font-weight:400;margin-top:4px}
    h1{text-align:center;font-size:20px;letter-spacing:1px;margin:24px 0 6px}.receipt-no{text-align:center;color:#4b5563;margin-bottom:24px}
    .intro{line-height:1.7;margin-bottom:16px}.highlight{font-size:16px;font-weight:700;border-bottom:1px dashed #64748b;padding:0 8px 3px}
    table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #64748b;padding:9px 8px}th{background:#e8ecf2;text-align:center;font-size:10px;text-transform:uppercase}.center{text-align:center}.amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .total{width:48%;margin:14px 0 0 auto}.total td{font-weight:700}.total tr:last-child{background:#e8ecf2;font-size:14px}
    .date{text-align:right;margin-top:36px}.signature{width:240px;margin:8px 0 0 auto;text-align:center}.sign-space{height:76px}.sign-name{border-top:1px solid #64748b;padding-top:8px;font-weight:700}.sign-role{font-size:11px;margin-top:4px;color:#4b5563}
  </style></head><body>
    <div class="brand"><img src="${logoUrl}" alt="LGM"><div class="brand-name">PT Lentera Global Maritim<div class="tag">Seamless Agent, Global Reach</div></div></div>
    <h1>KWITANSI PEMBAYARAN</h1>
    <div class="receipt-no">No. Kwitansi: ${escapeHtml(receiptNumber)}</div>
    <div class="intro">Telah diterima dari <b>PT Lentera Global Maritim</b> untuk pembayaran kepada <b>${escapeHtml(voucher.paidTo || voucher.vendorName)}</b> sebesar <span class="highlight">${money(voucher.totalPaidAmount)}</span>.</div>
    <div><b>Vendor:</b> ${escapeHtml(voucher.vendorName)}</div>
    <div><b>No. Payment Voucher:</b> ${escapeHtml(voucher.requestNumber)}</div>
    <table><thead><tr><th>No</th><th>Job Number</th><th>Customer</th><th>Item Service</th><th>Jumlah Dibayar</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="total"><tbody><tr><td>Total Pembayaran</td><td class="amount">${money(voucher.totalPaidAmount)}</td></tr></tbody></table>
    <div class="date">Jakarta, ${escapeHtml(paidDate)}</div>
    <div class="signature"><div class="sign-space"></div><div class="sign-name">${escapeHtml(voucher.paidTo || voucher.vendorName)}</div><div class="sign-role">Penerima</div></div>
  </body></html>`;
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) return 'Pop-up diblokir browser. Izinkan pop-up untuk mencetak kwitansi.';
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
  return null;
};
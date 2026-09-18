import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, FileSpreadsheet, FileText, Search, Ship, CalendarDays, ChevronRight, ChevronDown,
  ArrowLeft, CheckCircle2, Clock3, AlertCircle, CircleDot
} from 'lucide-react';
import { JobCall, Vessel } from '../../types';
import { formatDateDisplay } from '../../utils/date';

interface Props {
  jobCalls: JobCall[];
  vessels: Vessel[];
  onSelectJob: (id: string) => void;
  onOpenJob?: (id: string) => void;
}

const statusLabel: Record<string,string> = {
  INQUIRY:'Inquiry', QUOTED:'Quoted', APPROVED:'Approved', IN_PROGRESS:'In Progress', COMPLETED:'Completed', CLOSED:'Closed'
};

const monthValue = (date?: string) => {
  if (!date) return '';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
};

type StatusTone = 'open'|'done'|'waiting'|'danger';

const stageStatus = (label: string, value: string, tone: StatusTone='open'): {label:string; value:string; tone:StatusTone} => ({ label, value, tone });

const resolveInquiryOwner = (job: JobCall) => ({
  createdBy: job.inquiry?.createdBy || 'Unknown User',
  branch: job.inquiry?.createdByBranch || 'Head Office'
});

function getManagementStatus(job: JobCall): Array<{label:string; value:string; tone:StatusTone}> {
  const epda = job.quotation?.epda?.status;
  const pda = job.quotation?.pda?.status;
  const crew = job.quotation?.crewChange;
  const approval = job.managerApproval?.status;
  const operational = job.operationalData?.atd
    ? 'Selesai'
    : job.operationalData?.ata || job.operationalData?.atb
      ? 'Berjalan'
      : 'Belum Mulai';
  const actual = job.actualCosts?.length
    ? (job.actualCosts.some(x => x.status === 'APPROVED_BY_FDA') ? 'Terverifikasi' : 'Updated')
    : 'Open';
  const fda = job.fda?.fdaApproved ? 'Approved' : 'Open';
  const ap = job.ap?.length
    ? (job.ap.every(x => x.status === 'PAID') ? 'Paid' : job.ap.some(x => x.status === 'PARTIALLY_PAID') ? 'Partial' : 'Open')
    : 'Open';
  const ar = job.ar?.length
    ? (job.ar.every(x => x.status === 'RECEIVED') ? 'Received' : job.ar.some(x => x.status === 'OVERDUE') ? 'Overdue' : 'Open')
    : 'Open';
  const invoice = job.principalInvoice?.status || 'DRAFT';
  const closing = job.closing?.isClosed ? 'Closed vessel calls' : 'Open';

  const inquiryLabel = job.inquiry?.status === 'CONVERTED' ? 'Converted to Job' : job.inquiry?.status || 'Open';
  const epdaLabel = epda === 'APPROVED' ? 'Approved' : epda === 'SUBMITTED' ? 'Submitted' : 'Open';
  const pdaLabel = pda === 'APPROVED' ? 'Approved' : pda === 'SUBMITTED' ? 'Submitted' : 'Open';
  const crewLabel = crew?.signOnCount || crew?.signOffCount || crew?.members?.length ? crew.status : 'Not Required / Planned';
  const approvalLabel = approval === 'APPROVED' ? 'Approved' : approval === 'REJECTED' ? 'Rejected' : 'Belum Approval';
  const financeLabel = job.closing?.isClosed
    ? 'Closed vessel calls'
    : ar === 'Received' && ap === 'Open'
      ? 'AP Open • AR Received'
      : `AP ${ap} • AR ${ar}`;

  const attention = [epdaLabel, pdaLabel, approvalLabel, fda, closing].some(v => ['Open','Belum Approval','Rejected'].includes(v))
    || ar === 'Overdue';

  return [
    stageStatus('Inquiry', inquiryLabel, inquiryLabel === 'Converted to Job' ? 'done' : 'waiting'),
    stageStatus('EPDA', epdaLabel, epdaLabel === 'Approved' ? 'done' : epdaLabel === 'Submitted' ? 'waiting' : 'open'),
    stageStatus('PDA', pdaLabel, pdaLabel === 'Approved' ? 'done' : pdaLabel === 'Submitted' ? 'waiting' : 'open'),
    stageStatus('Crew Change', crewLabel, crewLabel === 'COMPLETED' ? 'done' : crewLabel === 'Not Required / Planned' ? 'open' : 'waiting'),
    stageStatus('Manager Approval', approvalLabel, approvalLabel === 'Approved' ? 'done' : approvalLabel === 'Rejected' ? 'danger' : 'waiting'),
    stageStatus('Operational Data', operational, operational === 'Selesai' ? 'done' : operational === 'Berjalan' ? 'waiting' : 'open'),
    stageStatus('Actual Cost', actual, actual === 'Terverifikasi' ? 'done' : 'waiting'),
    stageStatus('FDA', fda, fda === 'Approved' ? 'done' : 'open'),
    stageStatus('Finance (AP / AR / Invoice)', financeLabel, financeLabel === 'AP Open • AR Received' || financeLabel === 'Closed vessel calls' ? 'done' : 'waiting'),
    stageStatus('Closing', closing, closing === 'Closed vessel calls' ? 'done' : 'open'),
    stageStatus('KESIMPULAN', attention ? 'Masih ada proses terbuka' : 'Siklus terkontrol', attention ? 'waiting' : 'done')
  ];
}
const toneIcon = (tone: 'open'|'done'|'waiting'|'danger') => {
  if (tone === 'done') return <CheckCircle2 size={16}/>;
  if (tone === 'danger') return <AlertCircle size={16}/>;
  if (tone === 'waiting') return <Clock3 size={16}/>;
  return <CircleDot size={16}/>;
};

export const ActiveVesselCallsView: React.FC<Props> = ({jobCalls,vessels,onSelectJob}) => {
  const months = useMemo(()=>Array.from(new Set(jobCalls.map(j=>monthValue(j.createdAt || j.inquiry?.date)).filter(Boolean))).sort().reverse(),[jobCalls]);
  const [month,setMonth] = useState(months[0] || '');
  const [query,setQuery] = useState('');
  const [selectedDetailId,setSelectedDetailId] = useState<string | null>(null);
  const [downloadOpen,setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeDownloadMenu = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) setDownloadOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDownloadOpen(false);
    };
    document.addEventListener('mousedown', closeDownloadMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeDownloadMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const rows = useMemo(()=>jobCalls.filter(j => {
    const date = monthValue(j.createdAt || j.inquiry?.date);
    const q=query.toLowerCase();
    return (!month || date===month) && (!q || [j.jobId,j.vesselName,j.customerName,j.portName].join(' ').toLowerCase().includes(q));
  }),[jobCalls,month,query]);

  const selectedJob = jobCalls.find(j=>j.jobId===selectedDetailId) || null;
  const selectedVessel = selectedJob ? vessels.find(v=>v.id === selectedJob.vesselId) : null;
  const monthText = month ? new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(new Date(`${month}-01T00:00:00`)) : 'Semua Bulan';

  const openStatus = (id: string) => {
    onSelectJob(id);
    setSelectedDetailId(id);
  };

  const exportHeaders = ['NO', 'VESSEL CALL', 'INQUIRY NO', 'TANGGAL INQUIRY', 'DIBUAT OLEH', 'BRANCH', 'VESSEL', 'IMO', 'CALL SIGN', 'FLAG', 'TYPE', 'GT', 'NT', 'LOA (M)', 'BEAM (M)', 'QUANTITY', 'SATUAN QUANTITY', 'CUSTOMER / PRINCIPAL', 'PELABUHAN', 'ETA', 'KETERANGAN ETA', 'ETD', 'KETERANGAN ETD', 'TUJUAN KUNJUNGAN', 'ESTIMASI DURASI (HARI)', 'CARGO / PURPOSE DETAILS', 'SPECIAL REQUIREMENTS', 'OVERALL STATUS', 'KESIMPULAN', 'EPDA', 'PDA', 'CREW CHANGE', 'MANAGER APPROVAL', 'OPERATIONAL DATA', 'ACTUAL COST', 'FDA', 'FINANCE (AP / AR / INVOICE)', 'CLOSING'];
  const exportRows = rows.map((j, index) => {
    const vessel = vessels.find(v => v.id === j.vesselId);
    const statuses = getManagementStatus(j);
    const statusByLabel = Object.fromEntries(statuses.map(s => [s.label, s.value]));
    const owner = resolveInquiryOwner(j);
    return [
      index + 1, j.jobId, j.inquiry.inquiryNo, formatDateDisplay(j.inquiry.date), owner.createdBy, owner.branch, j.vesselName,
      vessel?.imoNumber || '-', vessel?.callSign || '-', vessel?.flag || '-', vessel?.vesselType || '-',
      vessel?.grt ?? '-', vessel?.nrt ?? '-', vessel?.loa ?? '-', vessel?.beam ?? '-', j.inquiry.quantity ?? '-', j.inquiry.quantityUnit === 'MATRIX_TON' ? 'MT' : 'T', j.customerName,
      j.portName, formatDateDisplay(j.eta, true), j.inquiry.etaRemarks || '-', formatDateDisplay(j.etd, true), j.inquiry.etdRemarks || '-', j.purposeOfCall.replace(/_/g, ' '),
      j.inquiry.estimatedDays, j.inquiry.cargoDetails, j.inquiry.specialRequirements || '-', statusLabel[j.status] || j.status,
      statusByLabel.KESIMPULAN || '-', statusByLabel.EPDA || '-', statusByLabel.PDA || '-', statusByLabel['Crew Change'] || '-',
      statusByLabel['Manager Approval'] || '-', statusByLabel['Operational Data'] || '-', statusByLabel['Actual Cost'] || '-',
      statusByLabel.FDA || '-', statusByLabel['Finance (AP / AR / Invoice)'] || '-', statusByLabel.Closing || '-',
    ];
  });

  const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const exportExcel = () => {
    const table = `<table border="1"><thead><tr>${exportHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${exportRows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><h2>Monitoring Vessel Calls - ${monthText}</h2>${table}</body></html>`;
    download(new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'}),`active-vessel-calls-${month||'all'}.xls`);
    setDownloadOpen(false);
  };

  const exportPdf = () => {
    const lines = ['MONITORING VESSEL CALLS', monthText, '', exportHeaders.join(' | '), ...exportRows.map(row => row.map(value => String(value)).join(' | '))];
    const esc=(v:string)=>v.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const bodyLines = lines.slice(1).flatMap((l,i) => [`(${esc(l.slice(0,180))}) Tj`, ...(i < lines.length - 2 ? ['0 -12 Td'] : [])]);
    const stream = ['BT','/F1 16 Tf','40 550 Td',`(${esc(lines[0])}) Tj`,'0 -22 Td','/F1 8 Tf',...bodyLines,'ET'].join('\n');
    const objs=[
      '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
      '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj',
      '4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
      `5 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj`
    ];
    let pdf='%PDF-1.4\n'; const offsets=[0];
    objs.forEach(o=>{offsets.push(pdf.length);pdf+=o+'\n';});
    const xref=pdf.length; pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    download(new Blob([pdf],{type:'application/pdf'}),`active-vessel-calls-${month||'all'}.pdf`);
    setDownloadOpen(false);
  };

  const printTable = () => {
    const headers = ['VESSEL CALL','VESSEL','CUSTOMER','PORT','ETA','ETD','STATUS','EPDA','PDA','APPROVAL','FDA'];
    const body = rows.map(j=>{
      const st=getManagementStatus(j);
      return `<tr><td>${j.jobId}</td><td>${j.vesselName}</td><td>${j.customerName}</td><td>${j.portName}</td><td>${formatDateDisplay(j.eta, true)}</td><td>${formatDateDisplay(j.etd, true)}</td><td>${statusLabel[j.status]||j.status}</td><td>${st[1].value}</td><td>${st[2].value}</td><td>${st[4].value}</td><td>${st[7].value}</td></tr>`;
    }).join('');
    const win=window.open('','_blank','width=1400,height=900');
    if(!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Monitoring Vessel Calls - ${monthText}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;margin:0}h1{font-size:18px;margin:0 0 4px}p{font-size:10px;color:#64748b;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#eef3f9;text-align:left;padding:7px;border:1px solid #d5deea;letter-spacing:.05em}td{padding:7px;border:1px solid #dfe6ef;vertical-align:top}tr:nth-child(even){background:#fafcff}</style></head><body><h1>Monitoring Vessel Calls</h1><p>${monthText} • ${rows.length} Vessel Call</p><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    win.document.close();
  };

  if (selectedJob) {
    const statuses = getManagementStatus(selectedJob);
    const conclusion = statuses[statuses.length - 1];
    const inquiryOwner = resolveInquiryOwner(selectedJob);
    return <div className="vessel-calls-page">
      <section className="vessel-calls-hero">
        <div>
          <button className="vessel-back-btn" onClick={()=>setSelectedDetailId(null)}><ArrowLeft size={15}/> Kembali ke Monitoring Vessel Calls</button>
          <div className="eyebrow"><Ship size={14}/> STATUS VESSEL CALL</div>
          <h1>{selectedJob.jobId}</h1>
          <p><b>{selectedJob.vesselName}</b> • {selectedJob.customerName} • {selectedJob.portName}</p>
        </div>
        <div className="vessel-detail-identity">
          <span>REG ID VESSEL</span>
          <strong>{selectedJob.jobId}</strong>
          <small>{formatDateDisplay(selectedJob.eta, true)} → {formatDateDisplay(selectedJob.etd, true)}</small>
        </div>
      </section>

      <section className="vessel-inquiry-card">
        <div className="vessel-inquiry-head">
          <div><div className="eyebrow"><FileText size={14}/> INQUIRY DATA</div><h2>Vessel Call Inquiry</h2><p>Ringkasan inquiry yang menjadi dasar pembentukan Vessel Call ini.</p></div>
          <span className={`inquiry-status ${selectedJob.inquiry.status.toLowerCase()}`}>{selectedJob.inquiry.status}</span>
        </div>
        <div className="vessel-inquiry-grid">
          <div><small>INQUIRY NO.</small><strong>{selectedJob.inquiry.inquiryNo}</strong></div>
          <div><small>TANGGAL INQUIRY</small><strong>{formatDateDisplay(selectedJob.inquiry.date)}</strong></div>
          <div><small>STATUS INQUIRY</small><strong>{selectedJob.inquiry.status}</strong></div>
          <div><small>DIBUAT OLEH</small><strong>{inquiryOwner.createdBy}</strong></div>

          <div><small>BRANCH</small><strong>{inquiryOwner.branch}</strong></div>
          <div><small>VESSEL</small><strong>{selectedJob.vesselName}</strong></div>
          <div><small>IMO</small><strong>{selectedVessel?.imoNumber || '-'}</strong></div>
          <div><small>CALL SIGN / FLAG</small><strong>{selectedVessel?.callSign || '-'} / {selectedVessel?.flag || '-'}</strong></div>

          <div><small>CUSTOMER / PRINCIPAL</small><strong>{selectedJob.customerName}</strong></div>
          <div><small>PELABUHAN TUJUAN</small><strong>{selectedJob.portName}</strong></div>
          <div><small>ETA</small><strong>{formatDateDisplay(selectedJob.eta, true)}</strong></div>
          <div><small>KETERANGAN ETA</small><strong>{selectedJob.inquiry.etaRemarks || '-'}</strong></div>

          <div><small>ETD</small><strong>{formatDateDisplay(selectedJob.etd, true)}</strong></div>
          <div><small>KETERANGAN ETD</small><strong>{selectedJob.inquiry.etdRemarks || '-'}</strong></div>
          <div><small>QUANTITY</small><strong>{selectedJob.inquiry.quantity ?? '-'} {selectedJob.inquiry.quantityUnit === 'MATRIX_TON' ? 'MT' : 'T'}</strong></div>
          <div><small>ESTIMASI DURASI</small><strong>{selectedJob.inquiry.estimatedDays ?? 0} hari</strong></div>

          <div><small>VESSEL TYPE</small><strong>{selectedVessel?.vesselType || '-'}</strong></div>
          <div><small>GRT / NRT / DWT</small><strong>{selectedVessel?.grt?.toLocaleString() || '-'} / {selectedVessel?.nrt?.toLocaleString() || '-'} / {selectedVessel?.dwt?.toLocaleString() || '-'}</strong></div>
          <div><small>LOA / BEAM</small><strong>{selectedVessel ? `${selectedVessel.loa} m` : '-'} / {selectedVessel ? `${selectedVessel.beam} m` : '-'}</strong></div>
          <div><small>FDA NO.</small><strong>{selectedJob.fda?.fdaNo || '-'}</strong></div>

          <div><small>FDA DATE</small><strong>{selectedJob.fda?.date ? formatDateDisplay(selectedJob.fda.date) : '-'}</strong></div>
          <div><small>USER CREATE EPDA</small><strong>{inquiryOwner.createdBy}</strong></div>
          <div><small>BRANCH</small><strong>{inquiryOwner.branch}</strong></div>
          <div><small>STATUS VESSEL CALL</small><strong>{selectedJob.status}</strong></div>

          <div className="wide"><small>TUJUAN KUNJUNGAN</small><strong>{selectedJob.purposeOfCall.replace(/_/g, ' ')}</strong></div>
          <div className="wide"><small>CARGO / PURPOSE DETAILS</small><strong>{selectedJob.inquiry.cargoDetails || '-'}</strong></div>
          <div className="wide"><small>SPECIAL REQUIREMENTS</small><strong>{selectedJob.inquiry.specialRequirements || 'Tidak ada catatan khusus.'}</strong></div>
        </div>
      </section>

      <section className="vessel-status-conclusion">
        <div className="vessel-conclusion-head">
          <div><div className="eyebrow"><CircleDot size={14}/> MANAGEMENT CONTROL</div><h2>Kesimpulan Status Siklus Management Operasional Data</h2><p>Urutan kerja: Inquiry → Quotation (EPDA/PDA/Crew Change) → Manager Approval → FDA → Finance → Closing. Satu Job ID/Vessel Call menjadi pengikat seluruh data.</p></div>
          <span className={`status-conclusion-badge ${conclusion.tone}`}>{toneIcon(conclusion.tone)} {conclusion.value}</span>
        </div>
        <div className="vessel-status-grid">
          {statuses.slice(0,-1).filter(s=>!['PDA','Crew Change','Operational Data','Actual Cost'].includes(s.label)).map(s=><div key={s.label} className={`vessel-status-card ${s.tone}`}><div className="vessel-status-icon">{toneIcon(s.tone)}</div><div><small>{s.label}</small><strong>{s.value}</strong></div></div>)}
        </div>
      </section>
    </div>;
  }

  return <div className="vessel-calls-page">
    <section className="vessel-calls-hero">
      <div><div className="eyebrow"><Ship size={14}/> VESSEL CALL CONTROL</div><h1>Monitoring Vessel Calls</h1><p>Pilih bulan pembuatan Vessel Call, lalu klik nomor Vessel Call untuk melihat kesimpulan status siklus management operasional.</p></div>
      <div className="vessel-export-actions">
        <div className="vessel-download-wrap" ref={downloadRef}>
          <button className="download-main" onClick={()=>setDownloadOpen(v=>!v)}><Download size={16}/> Download <ChevronDown size={14}/></button>
          {downloadOpen && <div className="vessel-download-menu">
            <button onClick={exportPdf}><FileText size={15}/> Download PDF</button>
            <button onClick={exportExcel}><FileSpreadsheet size={15}/> Download Excel</button>
          </div>}
        </div>
        <button className="print" onClick={printTable}><FileText size={16}/> Print</button>
      </div>
    </section>
    <section className="vessel-filter-card">
      <div className="filter-field"><CalendarDays size={17}/><select value={month} onChange={e=>setMonth(e.target.value)}><option value="">Semua bulan pembuatan</option>{months.map(m=><option key={m} value={m}>{new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(new Date(`${m}-01T00:00:00`))}</option>)}</select></div>
      <div className="filter-field search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nomor Vessel Call, kapal, customer, port..."/></div>
      <div className="result-count">{rows.length} Vessel Call</div>
    </section>
    <section className="vessel-table-card"><table><thead><tr><th>NO</th><th>VESSEL CALL</th><th>VESSEL</th><th>CUSTOMER</th><th>PORT</th><th>BRANCH</th><th>CREATED BY</th><th>ETA</th><th>ETD</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>{rows.map((j,index)=><tr key={j.jobId}><td>{index + 1}</td><td><span className="job-number">{j.jobId}</span><small>{j.createdAt ? formatDateDisplay(j.createdAt) : ''}</small></td><td><b>{j.vesselName}</b></td><td>{j.customerName}</td><td>{j.portName}</td><td>{resolveInquiryOwner(j).branch}</td><td>{resolveInquiryOwner(j).createdBy}</td><td>{formatDateDisplay(j.eta, true)}</td><td>{formatDateDisplay(j.etd, true)}</td><td><span className={`status status-${j.status.toLowerCase()}`}>{statusLabel[j.status]||j.status}</span></td><td><button className="open-job" onClick={()=>openStatus(j.jobId)} title="Lihat informasi status">Status <ChevronRight size={14}/></button></td></tr>)}{!rows.length&&<tr><td colSpan={11} className="empty">Tidak ada Vessel Call untuk filter yang dipilih.</td></tr>}</tbody></table></section>
  </div>;
};

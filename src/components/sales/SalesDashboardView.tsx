import React, { useEffect, useState } from 'react';
import {
  FileQuestion, FileSpreadsheet, FolderKanban, TrendingUp,
  DollarSign, Clock, CheckCircle2, Users, Ship, CalendarDays
} from 'lucide-react';
import { JobCall, ActiveTab } from '../../types';
import { formatDateDisplay, formatInquiryDate } from '../../utils/date';
import { ApprovedSalesPdaTotal, listApprovedSalesPdaTotals } from '../../lib/api';

interface SalesDashboardViewProps {
  jobCalls: JobCall[];
  onNavigate: (tab: ActiveTab) => void;
  onSelectJob: (jobId: string) => void;
}

const statusClass=(status:string)=>{
  const s=status.toUpperCase();
  if(s.includes('APPROV')||s==='FINAL'||s==='SUBMITTED') return 'bg-emerald-100 text-emerald-700';
  if(s.includes('DRAFT')) return 'bg-amber-100 text-amber-700';
  if(s.includes('SENT')) return 'bg-slate-100 text-slate-600';
  if(s === 'CONVERTED') return 'bg-emerald-100 text-emerald-700';
  if(s === 'RECEIVED') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
};

export const SalesDashboardView:React.FC<SalesDashboardViewProps>=({jobCalls,onNavigate})=>{
  const [approvedPdaTotals, setApprovedPdaTotals] = useState<ApprovedSalesPdaTotal[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listApprovedSalesPdaTotals()
      .then((totals) => { if (!cancelled) setApprovedPdaTotals(totals); })
      .catch((error) => console.error('Approved Sales PDA totals failed to load:', error));
    return () => { cancelled = true; };
  }, []);

  const getTimestamp = (value: string, fallback: string) => {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
    const fallbackTimestamp = Date.parse(fallback);
    return Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0;
  };
  const recentInquiries = [...jobCalls]
    .sort((a, b) => {
      return getTimestamp(b.createdAt, b.inquiry.date) - getTimestamp(a.createdAt, a.inquiry.date)
        || b.jobId.localeCompare(a.jobId);
    })
    .slice(0, 5);
  const recentQuotations = jobCalls
    .map((job) => ({ job, ...job.quotation.epda }))
    .filter((quotation) => quotation.status !== 'DRAFT' && quotation.quoteNo)
    .sort((a, b) => getTimestamp(b.date, b.job.createdAt) - getTimestamp(a.date, a.job.createdAt)
      || b.quoteNo.localeCompare(a.quoteNo))
    .slice(0, 5);
  const activeQuotes=jobCalls.filter(j=>j.status==='QUOTED'||j.status==='INQUIRY').length;
  const getEpdaGrandTotal = (job: JobCall) => {
    const quote = job.quotation.epda;
    const items = quote.items || [];
    const categories = items.reduce<Array<{ category: string; items: typeof items }>>((groups, item) => {
      const category = item.category || '';
      const existing = groups.find((group) => group.category === category);
      if (existing) existing.items.push(item);
      else groups.push({ category, items: [item] });
      return groups;
    }, []);
    const roundCurrency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
    const vat = categories.reduce((sum, group) => {
      const taxableAmount = group.items
        .filter((item) => item.vatApplied)
        .reduce((categorySum, item) => categorySum + item.amount, 0);
      return sum + roundCurrency(taxableAmount * 0.11);
    }, 0);
    const pph23Applied = quote.pph23Applied ?? items.some((item) => item.pph23Applied);
    const pph23 = pph23Applied
      ? categories.reduce((sum, group) => {
          if (!group.items.some((item) => item.vatApplied)) return sum;
          const categoryTotal = group.items.reduce((categorySum, item) => categorySum + item.amount, 0);
          return sum + roundCurrency(categoryTotal * 0.02);
        }, 0)
      : 0;
    const baseAmount = Number(quote.totalAmount || 0);
    const globalVat = quote.globalVatApplied
      ? roundCurrency((baseAmount + vat) * 0.11)
      : 0;
    return roundCurrency(baseAmount + vat - pph23 + globalVat);
  };
  const totalApprovedEpdaIDR = jobCalls
    .filter((job) => job.managerApproval.status === 'APPROVED' && job.quotation.epda.status === 'APPROVED')
    .reduce((total, job) => {
      const epdaTotal = getEpdaGrandTotal(job);
      const currency = job.quotation.epda.currency || job.currency || 'USD';
      const exchangeRate = Number(job.quotation.epda.exchangeRateUSDToIDR || job.exchangeRateUSDToIDR || 15800);
      const normalizedTotal = currency === 'USD'
        ? Math.round((epdaTotal + Number.EPSILON) * 100) / 100
        : epdaTotal;
      return total + (currency === 'USD' ? normalizedTotal * exchangeRate : normalizedTotal);
    }, 0);
  const visibleJobIds = new Set(jobCalls.map((job) => job.jobId));
  const approvedPdaTotalIDR = approvedPdaTotals.reduce((sum, pda) => {
    if (!visibleJobIds.has(pda.jobId)) return sum;
    const normalizedTotal = pda.currency === 'USD'
      ? Math.round((pda.total + Number.EPSILON) * 100) / 100
      : pda.total;
    return sum + (pda.currency === 'USD' ? normalizedTotal * pda.exchangeRate : normalizedTotal);
  }, 0);
  const totalApprovedEpdaAndPdaIDR = totalApprovedEpdaIDR + approvedPdaTotalIDR;
  const formatIDR = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

  const cards=[
    {label:'CUSTOMERS',value:new Set(jobCalls.map(j=>j.customerName)).size,icon:Users,cls:'blue',note:'Customer aktif'},
    {label:'INQUIRIES',value:jobCalls.length,icon:FileQuestion,cls:'cyan',note:'Inquiry masuk'},
    {label:'QUOTES',value:activeQuotes,icon:FileSpreadsheet,cls:'green',note:'Dalam proses'},
    {label:'TOTAL EPDA + PDA',value:formatIDR(totalApprovedEpdaAndPdaIDR),icon:FileSpreadsheet,cls:'orange',note:'Grand total EPDA + PDA approved'},
  ];

  return <div className="space-y-5">
    <div className="maritim-page-card" style={{padding:'22px 20px 18px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:15}}>
        <div>
          <div className="maritim-kicker" style={{display:'flex',alignItems:'center',gap:6}}>
            <TrendingUp size={13}/> SALES WORKSPACE
          </div>
          <h1 style={{fontSize:27,fontWeight:900,color:'#111827',margin:'5px 0 1px',letterSpacing:'-.7px'}}>Dashboard Sales</h1>
          <p style={{fontSize:12,color:'#71809a',margin:0}}>Ringkasan aktivitas penjualan dan pipeline vessel call</p>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map(c=>{
        const Icon=c.icon;
        const gradients:any={
          blue:'linear-gradient(135deg,#2563eb,#2e58d4)',
          cyan:'linear-gradient(135deg,#0e9bb5,#128da5)',
          green:'linear-gradient(135deg,#11866f,#0f7a67)',
          orange:'linear-gradient(135deg,#f59e0b,#ee8c00)'
        };
        return <div key={c.label} style={{background:gradients[c.cls],borderRadius:13,padding:'15px 16px',color:'#fff',minHeight:128,position:'relative',overflow:'hidden',boxShadow:'0 8px 16px rgba(26,78,140,.12)'}}>
          <div style={{position:'absolute',right:-24,top:-22,width:110,height:110,border:'1px solid rgba(255,255,255,.18)',borderRadius:'50%'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{width:34,height:34,borderRadius:9,background:'rgba(255,255,255,.18)',display:'grid',placeItems:'center'}}><Icon size={17}/></div>
            <span style={{background:'#fff',color:c.cls==='orange'?'#d67b00':'#1670bd',borderRadius:999,padding:'4px 9px',fontSize:9,fontWeight:850}}>{c.label}</span>
          </div>
          <div style={{fontSize:28,fontWeight:900,marginTop:11,lineHeight:1}}>{c.value}</div>
          <div style={{fontSize:10,opacity:.78,marginTop:7}}>{c.note}</div>
        </div>
      })}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="maritim-page-card overflow-hidden">
        <div style={{padding:'14px 15px',borderBottom:'1px solid #e4eaf2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div className="maritim-section-title">Inquiry Terbaru</div><div style={{fontSize:10,color:'#8491a5',marginTop:2}}>Inquiry yang terakhir masuk</div></div>
          <button onClick={()=>onNavigate('INQUIRIES')} style={{border:0,background:'transparent',color:'#1768d2',fontSize:10,fontWeight:800}}>Lihat semua</button>
        </div>
        <div>
          {recentInquiries.length ? recentInquiries.map((j)=><div key={j.jobId} style={{display:'grid',gridTemplateColumns:'145px 1fr 100px',gap:8,padding:'11px 15px',borderBottom:'1px solid #edf1f6',alignItems:'center',fontSize:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontFamily:'ui-monospace',color:j.inquiry.inquiryNo ? '#53637a' : '#000000',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{j.inquiry.inquiryNo || j.jobId}</div>
              <div style={{fontSize:9,color:'#8491a5',marginTop:3}}>{j.createdAt ? formatDateDisplay(j.createdAt, true) : formatInquiryDate(j.inquiry.date)}</div>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:650,color:'#42516a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{j.customerName}</div>
              <div style={{fontSize:9,color:'#8491a5',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{j.vesselName}</div>
            </div>
            <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold text-center ${statusClass(j.inquiry.status)}`}>{j.inquiry.status}</span>
          </div>) : (
            <div style={{padding:'18px 15px',fontSize:11,color:'#8491a5',textAlign:'center'}}>Belum ada inquiry.</div>
          )}
        </div>
      </div>

      <div className="maritim-page-card overflow-hidden">
        <div style={{padding:'14px 15px',borderBottom:'1px solid #e4eaf2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div className="maritim-section-title">Quotation EPDA Terbaru</div><div style={{fontSize:10,color:'#8491a5',marginTop:2}}>Nomor EPDA yang sudah diajukan</div></div>
          <button onClick={()=>onNavigate('QUOTES_EPDA')} style={{border:0,background:'transparent',color:'#168b67',fontSize:10,fontWeight:800}}>Lihat semua</button>
        </div>
        <div>
          {recentQuotations.length ? recentQuotations.map((quotation)=><div key={quotation.job.jobId} style={{display:'grid',gridTemplateColumns:'145px 1fr 90px',gap:8,padding:'11px 15px',borderBottom:'1px solid #edf1f6',alignItems:'center',fontSize:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontFamily:'ui-monospace',color:'#53637a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{quotation.quoteNo}</div>
              <div style={{fontSize:9,color:'#8491a5',marginTop:3}}>EPDA · {formatDateDisplay(quotation.date)}</div>
            </div>
            <span style={{fontWeight:650,color:'#42516a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{quotation.job.customerName}</span>
            <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold text-center ${statusClass(quotation.status)}`}>{quotation.status}</span>
          </div>) : (
            <div style={{padding:'18px 15px',fontSize:11,color:'#8491a5',textAlign:'center'}}>Belum ada EPDA yang diajukan.</div>
          )}
        </div>
      </div>
    </div>

  </div>;
};

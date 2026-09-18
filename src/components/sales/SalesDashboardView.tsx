import React from 'react';
import {
  FileQuestion, FileSpreadsheet, FolderKanban, TrendingUp,
  DollarSign, Clock, CheckCircle2, Users, Ship, CalendarDays
} from 'lucide-react';
import { JobCall, ActiveTab } from '../../types';

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
  return 'bg-blue-100 text-blue-700';
};

export const SalesDashboardView:React.FC<SalesDashboardViewProps>=({jobCalls,onNavigate})=>{
  const activeQuotes=jobCalls.filter(j=>j.status==='QUOTED'||j.status==='INQUIRY').length;
  const totalApprovedEpdaIDR = jobCalls
    .filter((job) => job.managerApproval.status === 'APPROVED' && job.quotation.epda.status === 'APPROVED')
    .reduce((total, job) => {
      const epdaTotal = Number(job.quotation.epda.totalSellRate || 0);
      const currency = job.quotation.epda.currency || job.currency || 'USD';
      const exchangeRate = Number(job.exchangeRateUSDToIDR || 15800);
      return total + (currency === 'USD' ? epdaTotal * exchangeRate : epdaTotal);
    }, 0);
  const formatIDR = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);

  const cards=[
    {label:'CUSTOMERS',value:new Set(jobCalls.map(j=>j.customerName)).size,icon:Users,cls:'blue',note:'Customer aktif'},
    {label:'INQUIRIES',value:jobCalls.length,icon:FileQuestion,cls:'cyan',note:'Inquiry masuk'},
    {label:'QUOTES',value:activeQuotes,icon:FileSpreadsheet,cls:'green',note:'Dalam proses'},
    {label:'TOTAL EPDA',value:formatIDR(totalApprovedEpdaIDR),icon:FileSpreadsheet,cls:'orange',note:'Grand total EPDA approved'},
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
          {jobCalls.slice(0,5).map((j,i)=><div key={j.jobId} style={{display:'grid',gridTemplateColumns:'115px 1fr 110px',gap:8,padding:'11px 15px',borderBottom:'1px solid #edf1f6',alignItems:'center',fontSize:10}}>
            <span style={{fontFamily:'ui-monospace',color:'#53637a'}}>{`INQ-2026-${String(4-i).padStart(4,'0')}`}</span>
            <span style={{fontWeight:650,color:'#42516a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{j.customerName}</span>
            <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold text-center ${statusClass(j.quotation.pda.status)}`}>{j.quotation.pda.status}</span>
          </div>)}
        </div>
      </div>

      <div className="maritim-page-card overflow-hidden">
        <div style={{padding:'14px 15px',borderBottom:'1px solid #e4eaf2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div className="maritim-section-title">Quotation Terbaru</div><div style={{fontSize:10,color:'#8491a5',marginTop:2}}>EPDA / PDA yang sedang diproses</div></div>
          <button onClick={()=>onNavigate('QUOTES_EPDA')} style={{border:0,background:'transparent',color:'#168b67',fontSize:10,fontWeight:800}}>Lihat semua</button>
        </div>
        <div>
          {jobCalls.slice(0,5).map((j,i)=><div key={j.jobId} style={{display:'grid',gridTemplateColumns:'115px 1fr 90px',gap:8,padding:'11px 15px',borderBottom:'1px solid #edf1f6',alignItems:'center',fontSize:10}}>
            <span style={{fontFamily:'ui-monospace',color:'#53637a'}}>{j.quotation.pda.quoteNo || j.quotation.epda.quoteNo || `QT-2026-${String(4-i).padStart(4,'0')}`}</span>
            <span style={{fontWeight:650,color:'#42516a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{j.customerName}</span>
            <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold text-center ${statusClass(j.quotation.pda.status)}`}>{j.quotation.pda.status}</span>
          </div>)}
        </div>
      </div>
    </div>

  </div>;
};

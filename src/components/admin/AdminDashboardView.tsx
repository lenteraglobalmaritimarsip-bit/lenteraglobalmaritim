import React from 'react';
import { Activity, Building2, Database, FileCheck2, FolderKanban, MapPin, Settings2, Ship, Users, ArrowRight } from 'lucide-react';
import { DatabaseState, ActiveTab } from '../../types';

interface Props {
  data: DatabaseState;
  onNavigate: (tab: ActiveTab) => void;
}

export const AdminDashboardView: React.FC<Props> = ({ data, onNavigate }) => {
  const cards = [
    { label: 'USERS', note: 'Pengguna portal', value: data.users.length, icon: Users, tab: 'USERS' as ActiveTab, cls: 'blue' },
    { label: 'CUSTOMERS', note: 'Principal/customer', value: data.customers.length, icon: Building2, tab: 'CUSTOMERS' as ActiveTab, cls: 'cyan' },
    { label: 'VESSELS', note: 'Data kapal', value: data.vessels.length, icon: Ship, tab: 'VESSELS' as ActiveTab, cls: 'green' },
    { label: 'PORTS', note: 'Pelabuhan terdaftar', value: data.ports.length, icon: MapPin, tab: 'PORTS' as ActiveTab, cls: 'orange' },
  ];

  const gradients: Record<string, string> = {
    blue: 'linear-gradient(135deg,#2563eb,#2e58d4)',
    cyan: 'linear-gradient(135deg,#0e9bb5,#128da5)',
    green: 'linear-gradient(135deg,#11866f,#0f7a67)',
    orange: 'linear-gradient(135deg,#f59e0b,#ee8c00)',
  };

  const quickMenus = [
    ['USERS', 'Users', 'Kelola user dan role akses', Users],
    ['CUSTOMERS', 'Customers', 'Master data principal/customer', Building2],
    ['VESSELS', 'Vessels', 'Data kapal dan spesifikasi', Ship],
    ['PORTS', 'Ports', 'Port, UN/LOCODE & operasi', MapPin],
    ['FIX_TARIFF', 'Fix Tariff', 'Tarif layanan berdasarkan port', FileCheck2],
    ['EXPENSES_ITEM', 'Expenses Item', 'Komponen biaya dan vendor', Database],
  ] as const;

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-violet-600 text-xs font-bold uppercase tracking-[0.18em]">
              <Activity className="w-4 h-4" /> ADMIN CONTROL CENTER
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-2">Administration Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Kontrol master data, user, vessel call dan aktivitas sistem.</p>
          </div>
          <button onClick={() => onNavigate('USERS')} className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 border border-slate-300 text-slate-700 text-sm font-bold shadow-sm">
            <Users className="w-4 h-4" /> Kelola Users
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {cards.map(({ label, note, value, icon: Icon, tab, cls }) => (
            <button key={label} onClick={() => onNavigate(tab)} className="text-left rounded-xl p-4 transition relative overflow-hidden text-white shadow-lg shadow-blue-900/10" style={{ background: gradients[cls], minHeight: 128 }}>
              <span className="absolute -right-6 -top-6 w-28 h-28 rounded-full border border-white/20" />
              <div className="flex items-center justify-between relative">
                <span className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center" style={{ color: '#fff' }}><Icon className="w-4 h-4" /></span>
                <span className={`rounded-full bg-white px-2 py-1 text-[9px] font-extrabold ${cls === 'orange' ? 'text-amber-700' : 'text-blue-700'}`}>{label}</span>
              </div>
              <div className="relative mt-[11px]" style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: '#fff' }}>{value}</div>
              <div className="text-[10px] mt-1 relative" style={{ color: '#fff', opacity: .78 }}>{note}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-black text-slate-900">Master Data</h2><p className="text-xs text-slate-500 mt-0.5">Pilih menu untuk membuka data tanpa menu duplikat di bagian atas.</p></div>
          <FolderKanban className="w-5 h-5 text-slate-400" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {quickMenus.map(([tab, title, desc, Icon]) => (
            <button key={tab} onClick={() => onNavigate(tab as ActiveTab)} className="group flex items-center gap-3 text-left border border-slate-200 hover:border-violet-300 hover:bg-violet-50 rounded-xl p-3.5 transition">
              <span className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-white flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-slate-500 group-hover:text-violet-600" /></span>
              <span className="min-w-0"><b className="block text-sm text-slate-800">{title}</b><small className="block text-[11px] text-slate-500 truncate">{desc}</small></span>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 ml-auto shrink-0" />
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3"><h2 className="font-black text-slate-900">System Activity</h2><span className="text-xs text-slate-400">{data.auditLogs.length} audit log</span></div>
        <div className="space-y-2">
          {data.auditLogs.slice(0, 5).map(log => <div key={log.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5"><div className="min-w-0"><b className="text-xs text-slate-700">{log.action} · {log.entity}</b><div className="text-[11px] text-slate-500 truncate">{log.description}</div></div><span className="text-[10px] text-slate-400 shrink-0">{new Date(log.timestamp).toLocaleString('id-ID')}</span></div>)}
          {!data.auditLogs.length && <div className="text-xs text-slate-400 py-3">Belum ada aktivitas tercatat.</div>}
        </div>
      </section>
    </div>
  );
};

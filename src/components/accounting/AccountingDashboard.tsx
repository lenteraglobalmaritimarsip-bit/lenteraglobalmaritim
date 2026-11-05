import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BookOpen, Building2, Calculator, ChevronRight, FileSpreadsheet, RefreshCw, Sigma } from 'lucide-react';
import { ActiveTab, AccountingBalanceSheetReport, AccountingMonthlyProfitLossResponse, AccountingPostedJournalRow, AccountingProfitLossReport, AccountingReportBranch } from '../../types';
import { loadAccountingBalanceSheet, loadAccountingMonthlyProfitLoss, loadAccountingPostedJournalReport, loadAccountingProfitLoss } from '../../lib/api';
import { todayISO } from '../../utils/date';

interface AccountingDashboardProps {
  onNavigate: (tab: ActiveTab) => void;
  audience?: 'ACCOUNTING' | 'DIRECTOR';
}

type ReportScope = 'ALL' | 'BRANCH' | 'HISTORICAL';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const years = Array.from({ length: 7 }, (_, index) => String(new Date().getFullYear() - index));
const formatIdr = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'IDR',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
}).format(amount || 0);
const formatCompactIdr = (amount: number) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(amount);
const displayDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || '-';
};

const scopeTitle = (scope: ReportScope, branches: AccountingReportBranch[], branchId: string) => {
  if (scope === 'HISTORICAL') return 'Konsolidasi Historis';
  if (scope === 'BRANCH') {
    const branch = branches.find((branchOption) => branchOption.id === branchId);
    return branch ? `${branch.code} · ${branch.name}` : 'Per Branch';
  }
  return 'Semua Branch';
};

const monthlyNetIncome = (rows: AccountingPostedJournalRow[]) => {
  const totals = Array.from({ length: 12 }, () => 0);
  rows.forEach((row) => {
    const month = Number(row.journalDate.slice(5, 7)) - 1;
    if (month < 0 || month > 11) return;
    const isRevenue = row.coa.startsWith('RV') || row.coa.startsWith('OT100');
    const isExpense = row.coa.startsWith('EX') || row.coa.startsWith('GA') || row.coa.startsWith('OT21') || row.coa.startsWith('OT22');
    const signedAmount = row.direction === 'K' ? -row.amount : row.amount;
    if (isRevenue) totals[month] -= signedAmount;
    else if (isExpense) totals[month] -= Math.abs(signedAmount);
  });
  return totals;
};

const latestJournals = (rows: AccountingPostedJournalRow[]) => {
  const byNumber = new Map<string, AccountingPostedJournalRow>();
  rows.forEach((row) => {
    if (!row.journalNumber || byNumber.has(row.journalNumber)) return;
    byNumber.set(row.journalNumber, row);
  });
  return [...byNumber.values()].sort((first, second) => second.journalDate.localeCompare(first.journalDate)).slice(0, 5);
};

const selectClass = 'h-10 min-w-40 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700';

export const AccountingDashboard: React.FC<AccountingDashboardProps> = ({ onNavigate, audience = 'ACCOUNTING' }) => {
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [period, setPeriod] = useState<'YTD' | 'FULL_YEAR'>('YTD');
  const [scope, setScope] = useState<ReportScope>('ALL');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<AccountingReportBranch[]>([]);
  const [profitLoss, setProfitLoss] = useState<AccountingProfitLossReport | null>(null);
  const [monthlyProfitLoss, setMonthlyProfitLoss] = useState<AccountingMonthlyProfitLossResponse | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<AccountingBalanceSheetReport | null>(null);
  const [journalRows, setJournalRows] = useState<AccountingPostedJournalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentDate = todayISO();
  const startDate = `${year}-01-01`;
  const endDate = period === 'YTD' && year === currentDate.slice(0, 4) ? currentDate : `${year}-12-31`;
  const invalidScope = scope === 'BRANCH' && !branchId;

  const refresh = async () => {
    if (invalidScope || loading) return;
    setLoading(true);
    setError('');
    try {
      const [profitResult, balanceResult, journalResult, monthlyResult] = await Promise.all([
        loadAccountingProfitLoss(startDate, endDate, scope, branchId),
        loadAccountingBalanceSheet(endDate, scope, branchId),
        loadAccountingPostedJournalReport(startDate, endDate, scope, branchId),
        audience === 'DIRECTOR'
          ? loadAccountingMonthlyProfitLoss(Number(year), scope, branchId)
          : Promise.resolve(null),
      ]);
      setProfitLoss(profitResult.report);
      setBalanceSheet(balanceResult.report);
      setBranches(profitResult.branches);
      setJournalRows(journalResult);
      setMonthlyProfitLoss(monthlyResult);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Dashboard Accounting gagal dimuat.');
      setProfitLoss(null);
      setBalanceSheet(null);
      setJournalRows([]);
      setMonthlyProfitLoss(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const trend = monthlyNetIncome(journalRows);
  const maxTrend = Math.max(1, ...trend.map((value) => Math.abs(value)));
  const growthSeries = [
    {
      label: 'Pendapatan',
      color: '#059669',
      values: Array.from({ length: 12 }, (_, index) => {
        const report = monthlyProfitLoss?.reports[index];
        return report ? report.totalRevenue + report.totalOtherIncome : 0;
      }),
    },
    {
      label: 'Laba bersih',
      color: '#2563eb',
      values: Array.from({ length: 12 }, (_, index) => monthlyProfitLoss?.reports[index]?.netIncome || 0),
    },
    {
      label: 'Beban operasional',
      color: '#ea580c',
      values: Array.from({ length: 12 }, (_, index) => monthlyProfitLoss?.reports[index]?.totalExpenses || 0),
    },
  ];
  const growthValues = growthSeries.flatMap((series) => series.values);
  const growthMin = Math.min(0, ...growthValues);
  const growthMax = Math.max(0, ...growthValues);
  const growthRange = Math.max(1, growthMax - growthMin);
  const hasGrowthData = growthValues.some((value) => value !== 0);
  const growthChart = { left: 72, top: 18, width: 860, height: 190 };
  const growthX = (index: number) => growthChart.left + (index / 11) * growthChart.width;
  const growthY = (value: number) => growthChart.top + ((growthMax - value) / growthRange) * growthChart.height;
  const latest = latestJournals(journalRows);
  const scopeName = scopeTitle(scope, branches, branchId);
  const metricCards = [
    { label: 'Total Pendapatan', value: profitLoss ? profitLoss.totalRevenue + profitLoss.totalOtherIncome : 0, icon: ArrowUpRight, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Total Beban', value: profitLoss ? profitLoss.totalExpenses + profitLoss.totalOtherExpenses : 0, icon: ArrowDownRight, tone: 'text-orange-700 bg-orange-50' },
    { label: 'Laba / (Rugi)', value: profitLoss?.netIncome || 0, icon: Sigma, tone: 'text-blue-700 bg-blue-50' },
  ];
  const quickLinks = audience === 'DIRECTOR'
    ? [
      { title: 'Laporan laba rugi', description: 'Pendapatan, beban, dan laba bulanan', tab: 'DIRECTOR_PROFIT_LOSS' as const, icon: FileSpreadsheet },
      { title: 'Laporan neraca', description: 'Posisi aset, liabilitas, dan ekuitas', tab: 'DIRECTOR_BALANCE_SHEET' as const, icon: Calculator },
      { title: 'Manajemen aset', description: 'Daftar aset dan data penyusutan', tab: 'DIRECTOR_ASSETS' as const, icon: Building2 },
      { title: 'Monitoring Vessel Call', description: 'Pantau operasional seluruh branch', tab: 'DIRECTOR_VESSEL_CALLS' as const, icon: BookOpen },
      { title: 'Log aktivitas', description: 'Aktivitas user dan branch terbaru', tab: 'DIRECTOR_ACTIVITY_LOG' as const, icon: BookOpen },
    ]
    : [
      { title: 'Laporan laba rugi', description: 'Pendapatan, beban, dan laba bulanan', tab: 'ACCOUNTING_PROFIT_LOSS' as const, icon: FileSpreadsheet },
      { title: 'Laporan neraca', description: 'Posisi aset, liabilitas, dan ekuitas', tab: 'ACCOUNTING_BALANCE_SHEET' as const, icon: Calculator },
      { title: 'Input jurnal COA', description: 'Jurnal posted dan transaksi menunggu', tab: 'ACCOUNTING_WORKSPACE' as const, icon: BookOpen },
      { title: 'Manajemen aset', description: 'Daftar aset dan data penyusutan', tab: 'ACCOUNTING_ASSETS' as const, icon: Building2 },
    ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">{audience === 'DIRECTOR' ? 'Executive Monitoring' : 'Accounting Monitoring'}</div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">{audience === 'DIRECTOR' ? 'Dashboard Keuangan Direktur' : 'Dashboard Keuangan'}</h1>
          <p className="mt-1 text-xs text-slate-500">Laba rugi, posisi neraca, dan jurnal posted perusahaan.</p>
        </div>
        <div className="text-xs font-semibold text-slate-500">{new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${currentDate}T00:00:00`))}</div>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Periode monitoring
          <select value={period} onChange={(event) => setPeriod(event.target.value as 'YTD' | 'FULL_YEAR')} className={selectClass}>
            <option value="YTD">Tahun berjalan</option>
            <option value="FULL_YEAR">Setahun penuh</option>
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tahun
          <select value={year} onChange={(event) => setYear(event.target.value)} className={selectClass}>
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Scope
          <select value={scope} onChange={(event) => { setScope(event.target.value as ReportScope); setBranchId(''); }} className={selectClass}>
            <option value="ALL">Semua Branch</option>
            <option value="BRANCH">Per Branch</option>
            <option value="HISTORICAL">Konsolidasi Historis</option>
          </select>
        </label>
        {scope === 'BRANCH' && (
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Branch
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className={selectClass}>
              <option value="">Pilih branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={() => void refresh()} disabled={loading || invalidScope} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Memuat...' : 'Tampilkan'}
        </button>
        <div className="ml-auto text-[10px] text-slate-500">Jurnal posted · {startDate} sampai {endDate}</div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
      {loading && <div role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">Memuat data dashboard...</div>}

      <section className="grid gap-3 md:grid-cols-3">
        {metricCards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              {label}<span className={`grid h-8 w-8 place-items-center rounded-md ${tone}`}><Icon size={16} /></span>
            </div>
            <div className="mt-3 text-xl font-black text-slate-900">{formatIdr(value)}</div>
            <div className="mt-1 text-[10px] text-slate-400">Jurnal posted · Tahun {year} · {scopeName}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-sm font-bold text-slate-800">Tren Laba Rugi</h2><p className="mt-1 text-[10px] text-slate-500">Ringkasan bulanan dari jurnal posted</p></div>
            <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-600" /> Laba bersih</div>
          </div>
          <div className="mt-4 grid h-48 grid-cols-12 items-end gap-2 border-b border-slate-200 px-1">
            {trend.map((value, index) => {
              const height = value === 0 ? 3 : Math.max(5, Math.abs(value) / maxTrend * 100);
              return (
                <div key={monthNames[index]} className="flex h-full flex-col items-center justify-end gap-1">
                  <div className="flex h-[88%] w-full items-end justify-center border-b border-slate-100">
                    <div title={`${monthNames[index]} · ${formatIdr(value)}`} className={`w-full max-w-8 rounded-t-sm ${value < 0 ? 'bg-rose-500' : 'bg-blue-600'}`} style={{ height: `${height}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-400">{monthNames[index]}</span>
                </div>
              );
            })}
          </div>
          {!journalRows.length && !loading && <p className="mt-3 text-center text-[10px] text-slate-400">Belum ada jurnal posted pada periode ini.</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-800">Ringkasan Neraca</h2><p className="mt-1 text-[10px] text-slate-500">Saldo berdasarkan COA · {endDate}</p></div>
          <dl className="mt-4 divide-y divide-slate-100 text-xs">
            {[
              ['Aset', balanceSheet?.totalAssets || 0],
              ['Liabilitas', balanceSheet?.totalLiabilities || 0],
              ['Ekuitas', balanceSheet?.totalEquity || 0],
              ['Liabilitas + Ekuitas', (balanceSheet?.totalLiabilities || 0) + (balanceSheet?.totalEquity || 0)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3">
                <dt className="text-slate-500">{label}</dt><dd className="font-mono font-bold text-slate-800">{formatIdr(Number(value))}</dd>
              </div>
            ))}
          </dl>
          {balanceSheet && Math.abs(balanceSheet.difference) >= 1 && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">Neraca belum seimbang · {formatIdr(balanceSheet.difference)}</p>}
        </div>
      </section>

      {audience === 'DIRECTOR' && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Tren Pertumbuhan Bulanan</h2>
              <p className="mt-1 text-[10px] text-slate-500">Pendapatan, laba bersih, dan beban operasional · {year} · {scopeName}</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {growthSeries.map((series) => (
                <span key={series.label} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                  {series.label}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <svg viewBox="0 0 960 252" role="img" aria-label={`Grafik pendapatan, laba bersih, dan beban operasional bulanan tahun ${year}`} className="h-64 min-w-[680px] w-full">
              <title>Tren pertumbuhan bulanan tahun {year}</title>
              {[0, 1, 2, 3, 4].map((step) => {
                const value = growthMax - (growthRange * step) / 4;
                const y = growthChart.top + (growthChart.height * step) / 4;
                return (
                  <g key={step}>
                    <line x1={growthChart.left} x2={growthChart.left + growthChart.width} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={step === 4 ? undefined : '3 4'} />
                    <text x={growthChart.left - 8} y={y + 3} textAnchor="end" fill="#64748b" fontSize="10">{formatCompactIdr(value)}</text>
                  </g>
                );
              })}
              {growthSeries.map((series) => {
                const points = series.values.map((value, index) => `${growthX(index)},${growthY(value)}`).join(' ');
                return (
                  <g key={series.label}>
                    <polyline points={points} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {series.values.map((value, index) => (
                      <circle key={monthNames[index]} cx={growthX(index)} cy={growthY(value)} r="3.5" fill="white" stroke={series.color} strokeWidth="2">
                        <title>{`${series.label} · ${monthNames[index]} ${year}: ${formatIdr(value)}`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
              {monthNames.map((month, index) => (
                <text key={month} x={growthX(index)} y="232" textAnchor="middle" fill="#64748b" fontSize="10">{month}</text>
              ))}
            </svg>
          </div>
          {!hasGrowthData && !loading && <p className="mt-2 text-center text-[10px] text-slate-400">Belum ada transaksi posted untuk filter ini.</p>}
          <p className="mt-2 text-[10px] text-slate-400">Pendapatan mencakup pendapatan usaha dan lainnya. Beban operasional tidak mencakup beban lain-lain. Arahkan ke titik grafik untuk melihat nominal.</p>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-800">Jurnal Terbaru</h2><p className="mt-1 text-[10px] text-slate-500">Transaksi accounting terakhir dalam periode terpilih</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">No. Jurnal</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Deskripsi</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {latest.map((row) => (
                  <tr key={row.journalNumber}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-blue-700">{row.journalNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{displayDate(row.journalDate)}</td>
                    <td className="max-w-80 truncate px-3 py-2 text-slate-700">{row.description || '-'}</td>
                    <td className="px-3 py-2"><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Posted</span></td>
                  </tr>
                ))}
                {!latest.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">Tidak ada jurnal posted pada periode ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-800">Akses Cepat</h2><p className="mt-1 text-[10px] text-slate-500">{audience === 'DIRECTOR' ? 'Laporan dan informasi read-only' : 'Menu sesuai hak akses Accounting'}</p></div>
          <div className="mt-3 divide-y divide-slate-100">
            {quickLinks.map(({ title, description, tab, icon: Icon }) => (
              <button key={tab} type="button" onClick={() => onNavigate(tab)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700"><Icon size={15} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{title}</span><span className="mt-0.5 block text-[10px] text-slate-500">{description}</span></span>
                <ChevronRight size={15} className="text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
